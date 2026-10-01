import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { buildReport, type Report } from "@/data/reports";
import { today as todayOf } from "@/data/context";
import { presetRange } from "@/domain/dates";
import { RangePicker, Tile, Empty } from "@/ui/common";

export function StaffFilePage({ staffId }: { staffId: string }) {
  const person = useLiveQuery(() => db.staff.get(staffId), [staffId]);
  const category = useLiveQuery(async () => (person ? db.categories.get(person.categoryId) : undefined), [person?.categoryId]);
  const today = useLiveQuery(() => todayOf(db), [], "");
  const year = useLiveQuery(async () => (await db.schoolYears.toArray()).find((y) => y.isCurrent), [], undefined);
  const [range, setRange] = useState({ from: "", to: "" });
  const [report, setReport] = useState<Report | null>(null);
  useEffect(() => { if (today && !range.from) setRange(presetRange("mes", today)); }, [today, range.from]);
  // Se recalcula cuando cambian los datos (consulta viva sobre las tablas fuente).
  const stamp = useLiveQuery(async () => `${await db.incidents.count()}-${await db.attendance.count()}-${await db.coverages.count()}-${await db.audit.count()}`, [], "");
  useEffect(() => {
    if (!range.from || !person) return;
    let off = false;
    buildReport(db, { type: "persona", staffId, from: range.from, to: range.to, detailed: true }).then((r) => { if (!off) setReport(r); }).catch(() => { if (!off) setReport(null); });
    return () => { off = true; };
  }, [range.from, range.to, staffId, person, stamp]);

  if (person === undefined) return <p>Cargando…</p>;
  if (!person) return <Empty>No se encontró a la persona. <a className="underline" href="#/personal">Volver a Personal</a></Empty>;
  const val = (l: string) => report?.summary.find((s) => s.label === l)?.value ?? "0";

  return (
    <section className="flex flex-col gap-4">
      <a href="#/personal" className="text-sm font-medium text-emerald-800 underline">← Personal</a>
      <div>
        <h1 className="text-2xl font-bold">{person.fullName}</h1>
        <p className="text-stone-600">{category?.name ?? ""}{person.jobTitle ? ` · ${person.jobTitle}` : ""} · {person.isActive ? "✓ Activo" : "– Inactivo"}</p>
        {person.adminNotes ? <p className="mt-1 text-sm text-stone-600">{person.adminNotes}</p> : null}
      </div>
      {today ? <RangePicker from={range.from} to={range.to} today={today} year={year} onChange={(from, to) => setRange({ from, to })} /> : null}
      {report ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Tile label="Retardos (min)" value={val("Retardos")} tone="warn" />
            <Tile label="Faltas (días)" value={val("Faltas (días)")} tone="bad" />
            <Tile label="Licencias (días)" value={val("Licencias (días)")} tone="info" />
            <Tile label="Permisos (días)" value={val("Permisos (días)")} tone="info" />
            <Tile label="Constancias (días)" value={val("Constancias (días)")} tone="info" />
            <Tile label="Clases afectadas" value={val("Clases afectadas")} />
          </div>
          {report.sections.filter((s) => s.heading !== "Resumen por persona").map((s) => (
            <div key={s.heading} className="rounded-lg border border-stone-200 bg-white p-3">
              <h2 className="mb-2 font-semibold">{s.heading} ({s.rows.length})</h2>
              {s.rows.length === 0 ? <p className="text-sm text-stone-600">Sin registros.</p> : (
                <div className="overflow-x-auto"><table className="w-full min-w-max text-left text-sm"><thead><tr className="border-b">{s.columns.map((c) => <th key={c} className="px-2 py-1">{c}</th>)}</tr></thead><tbody>{s.rows.map((r, i) => <tr key={i} className="border-b border-stone-100">{r.map((c, j) => <td key={j} className="px-2 py-1">{c}</td>)}</tr>)}</tbody></table></div>
              )}
            </div>
          ))}
          <a href="#/reportes" className="text-sm font-medium text-emerald-800 underline">Generar PDF de esta persona en Reportes</a>
        </>
      ) : null}
    </section>
  );
}
