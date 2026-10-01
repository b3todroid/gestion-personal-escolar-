import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { buildReport, REPORT_TYPES, visibleSections, type Report, type ReportParams, type ReportType } from "@/data/reports";
import { reportToCsv, reportToPdf, reportToXlsx } from "@/data/exportReport";
import { getSettings, today as todayOf } from "@/data/context";
import { presetRange } from "@/domain/dates";
import { Button, CheckField, ErrorBox, SelectField } from "@/ui/ui";
import { RangePicker } from "@/ui/common";
import { download, downloadText } from "@/ui/download";

const MAX_PREVIEW = 150;

export function ReportsPage() {
  const today = useLiveQuery(() => todayOf(db), [], "");
  const staff = useLiveQuery(() => db.staff.orderBy("fullName").toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const groups = useLiveQuery(() => db.groups.toArray(), [], []);
  const types = useLiveQuery(() => db.incidentTypes.toArray(), [], []);
  const year = useLiveQuery(async () => (await db.schoolYears.toArray()).find((y) => y.isCurrent), [], undefined);
  const [p, setP] = useState<ReportParams>({ type: "general", from: "", to: "", detailed: false });
  const [report, setReport] = useState<Report | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (today && !p.from) { const r = presetRange("mes", today); setP((x) => ({ ...x, from: r.from, to: r.to })); } }, [today, p.from]);
  const set = <K extends keyof ReportParams>(k: K, v: ReportParams[K]) => { setP((x) => ({ ...x, [k]: v || undefined, ...(k === "detailed" ? { detailed: v as boolean } : {}) })); setReport(null); };
  const setType = (t: ReportType) => { setP((x) => ({ ...x, type: t })); setReport(null); };

  const generate = async () => { setBusy(true); try { setReport(await buildReport(db, p)); setErrors([]); } catch (e) { setReport(null); setErrors([e instanceof Error ? e.message : "No se pudo generar."]); } finally { setBusy(false); } };
  const fileBase = () => `${(report?.title ?? "reporte").replace(/[^\p{L}\p{N}]+/gu, "_")}_${p.from}_${p.to}`;
  const exportAs = async (kind: "pdf" | "xlsx" | "csv") => {
    if (!report) return;
    setBusy(true);
    try {
      if (kind === "csv") downloadText(`${fileBase()}.csv`, `﻿${reportToCsv(report)}`, "text/csv;charset=utf-8");
      else if (kind === "xlsx") download(`${fileBase()}.xlsx`, await reportToXlsx(report));
      else download(`${fileBase()}.pdf`, await reportToPdf(report, await getSettings(db)));
    } catch (e) { setErrors([e instanceof Error ? e.message : "No se pudo exportar."]); } finally { setBusy(false); }
  };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Reportes</h1>
      <div className="flex flex-col gap-4 rounded-lg border border-stone-200 bg-white p-4">
        <SelectField label="Tipo de reporte" value={p.type} onChange={(e) => setType(e.target.value as ReportType)}>
          {REPORT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label} — {t.hint}</option>)}
        </SelectField>
        {today ? <RangePicker from={p.from} to={p.to} today={today} year={year} onChange={(f, t) => { setP((x) => ({ ...x, from: f, to: t })); setReport(null); }} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Persona" value={p.staffId ?? ""} onChange={(e) => set("staffId", e.target.value)}><option value="">Todas</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</SelectField>
          <SelectField label="Categoría" value={p.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value)}><option value="">Todas</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
          <SelectField label="Grupo" value={p.groupId ?? ""} onChange={(e) => set("groupId", e.target.value)}><option value="">Todos</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</SelectField>
          <SelectField label="Tipo de incidencia" value={p.incidentTypeId ?? ""} onChange={(e) => set("incidentTypeId", e.target.value)}><option value="">Todos</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectField>
        </div>
        <CheckField label="Reporte detallado" hint="Incluye cada incidencia, retardo y clase afectada. Sin marcar: solo el resumen." checked={p.detailed} onChange={(e) => set("detailed", e.target.checked)} />
        <ErrorBox messages={errors} />
        <Button onClick={generate} disabled={busy}>{busy ? "Generando…" : "Generar reporte"}</Button>
      </div>

      {report ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => exportAs("pdf")} disabled={busy}>Descargar PDF</Button>
            <Button variant="secondary" onClick={() => exportAs("xlsx")} disabled={busy}>Excel (.xlsx)</Button>
            <Button variant="secondary" onClick={() => exportAs("csv")} disabled={busy}>CSV</Button>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="text-lg font-bold">{report.title}</h2>
            <p className="text-sm text-stone-600">{report.filters.join(" · ")}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {report.summary.map((s) => <div key={s.label} className="rounded-lg bg-stone-100 p-2"><dt className="text-xs text-stone-600">{s.label}</dt><dd className="text-lg font-bold">{s.value}</dd></div>)}
            </dl>
          </div>
          {visibleSections(report).map((s) => (
            <div key={s.heading} className="rounded-lg border border-stone-200 bg-white p-3">
              <h3 className="mb-2 font-semibold">{s.heading} <span className="text-sm font-normal text-stone-500">({s.rows.length})</span></h3>
              {s.rows.length === 0 ? <p className="text-sm text-stone-600">Sin registros en este periodo.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max text-left text-sm">
                    <thead><tr className="border-b border-stone-300">{s.columns.map((c) => <th key={c} className="px-2 py-1 font-semibold">{c}</th>)}</tr></thead>
                    <tbody>{s.rows.slice(0, MAX_PREVIEW).map((r, i) => <tr key={i} className="border-b border-stone-100">{r.map((c, j) => <td key={j} className="px-2 py-1">{c}</td>)}</tr>)}</tbody>
                  </table>
                  {s.rows.length > MAX_PREVIEW ? <p className="mt-1 text-xs text-stone-500">Se muestran {MAX_PREVIEW}; el PDF, Excel y CSV incluyen todo.</p> : null}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
