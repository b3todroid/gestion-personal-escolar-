import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { assignCoverage, loadAvailability, removeCoverage, setNotRequired } from "@/data/coverage";
import { today as todayOf } from "@/data/context";
import type { AffectedClass } from "@/data/types";
import type { Candidate } from "@/domain/coverage";
import { formatDate } from "@/domain/dates";
import { Button, ErrorBox, Field, Sheet } from "@/ui/ui";
import { Empty } from "@/ui/common";

type Mode = "day" | "pending";

export function CoveragesPage() {
  const today = useLiveQuery(() => todayOf(db), [], "");
  const [picked, setPicked] = useState("");
  const [mode, setMode] = useState<Mode>("day");
  const date = picked || today;
  const rows = useLiveQuery(async () => {
    if (!date) return [];
    const list = mode === "day" ? await db.affected.where("date").equals(date).toArray() : await db.affected.where("coverageStatus").equals("uncovered").filter((a) => a.date >= today).toArray();
    return list.filter((a) => a.isClass);
  }, [date, mode, today], [] as AffectedClass[]);
  const staff = useLiveQuery(() => db.staff.toArray(), [], []);
  const periods = useLiveQuery(() => db.periods.toArray(), [], []);
  const groups = useLiveQuery(() => db.groups.toArray(), [], []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);
  const coverages = useLiveQuery(() => db.coverages.filter((c) => !c.canceledAt).toArray(), [], []);
  const [active, setActive] = useState<AffectedClass | null>(null);
  const n = useMemo(() => ({ s: new Map(staff.map((x) => [x.id, x.fullName])), p: new Map(periods.map((x) => [x.id, x])), g: new Map(groups.map((x) => [x.id, x.name])), su: new Map(subjects.map((x) => [x.id, x.name])) }), [staff, periods, groups, subjects]);
  const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date) || (n.p.get(a.periodId)?.startsAt ?? "").localeCompare(n.p.get(b.periodId)?.startsAt ?? ""));
  const pending = rows.filter((r) => r.coverageStatus === "uncovered").length;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Coberturas</h1>
      <div role="group" aria-label="Vista" className="flex gap-2">
        {([["day", "Por día"], ["pending", "Todas las pendientes"]] as [Mode, string][]).map(([k, l]) => <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${mode === k ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-300 bg-white"}`}>{l}</button>)}
      </div>
      {mode === "day" ? <div className="w-48"><Field label="Día" type="date" value={date} onChange={(e) => setPicked(e.target.value)} /></div> : null}
      <p className={`rounded-lg border p-3 text-sm font-medium ${pending ? "border-red-300 bg-red-50 text-red-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>{pending ? `⚠ ${pending} clase(s) sin cubrir` : "✓ No hay clases sin cubrir"}</p>
      {sorted.length === 0 ? <Empty>No hay clases afectadas.</Empty> : (
        <ul className="flex flex-col gap-2">
          {sorted.map((a) => {
            const cov = coverages.find((c) => c.affectedId === a.id);
            return (
              <li key={a.id} className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{formatDate(a.date)} · {n.p.get(a.periodId)?.name} <span className="font-normal text-stone-600">({n.p.get(a.periodId)?.startsAt}–{n.p.get(a.periodId)?.endsAt})</span></p>
                  <p className="text-sm text-stone-600">Grupo {n.g.get(a.groupId) ?? "—"} · {n.su.get(a.subjectId) ?? "—"} · falta {n.s.get(a.staffId)}</p>
                  <p className="text-sm font-medium">{a.coverageStatus === "covered" ? `✓ Cubre: ${n.s.get(cov?.coveringStaffId ?? "") ?? "?"}` : a.coverageStatus === "not_required" ? "– No requiere cobertura" : "⚠ Sin cubrir"}</p>
                </div>
                <Button variant={a.coverageStatus === "uncovered" ? "primary" : "secondary"} onClick={() => setActive(a)}>{a.coverageStatus === "uncovered" ? "Asignar cobertura" : "Cambiar"}</Button>
              </li>
            );
          })}
        </ul>
      )}
      {active ? <CoverageSheet affectedId={active.id} onClose={() => setActive(null)} /> : null}
    </section>
  );
}

function CoverageSheet({ affectedId, onClose }: { affectedId: string; onClose: () => void }) {
  const row = useLiveQuery(() => db.affected.get(affectedId), [affectedId]);
  const staff = useLiveQuery(() => db.staff.toArray(), [], []);
  const cov = useLiveQuery(() => db.coverages.where("affectedId").equals(affectedId).filter((c) => !c.canceledAt).first(), [affectedId]);
  const cats = useLiveQuery(() => db.categories.toArray(), [], []);
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const version = row?.coverageStatus;
  useEffect(() => { let off = false; loadAvailability(db, affectedId).then((r) => { if (!off) setCands(r); }).catch((e) => { if (!off) setErrors([String(e.message ?? e)]); }); return () => { off = true; }; }, [affectedId, version]);
  const byId = new Map(staff.map((s) => [s.id, s]));
  const cat = new Map(cats.map((c) => [c.id, c.name]));
  const list = (cands ?? []).filter((c) => !q || (byId.get(c.staffId)?.fullName ?? "").toLowerCase().includes(q.toLowerCase()));
  const run = async (fn: () => Promise<unknown>, close = true) => { try { await fn(); setErrors([]); if (close) onClose(); } catch (e) { setErrors([e instanceof Error ? e.message : "No se pudo guardar."]); } };
  if (!row) return null;

  return (
    <Sheet title={`Cobertura · ${formatDate(row.date)}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {cov ? (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3">
            <p>Cubre: <b>{byId.get(cov.coveringStaffId)?.fullName}</b></p>
            <Button variant="danger" className="mt-2" onClick={() => run(() => removeCoverage(db, cov.id, "Se quitó la cobertura"), false)}>Quitar cobertura</Button>
          </div>
        ) : null}
        <input aria-label="Buscar a quien cubre" placeholder="Buscar personal disponible…" value={q} onChange={(e) => setQ(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-3 py-2.5" />
        <Field label="Nota (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {cands === null ? <p>Buscando…</p> : list.length === 0 ? <Empty>Nadie disponible en ese periodo.</Empty> : (
          <ul className="flex flex-col gap-2">
            {list.map((c) => {
              const s = byId.get(c.staffId);
              return (
                <li key={c.staffId}>
                  <button type="button" onClick={() => run(() => assignCoverage(db, affectedId, c.staffId, notes))} className="flex w-full items-center justify-between rounded-lg border border-stone-200 bg-white p-3 text-left hover:bg-emerald-50">
                    <span><span className="block font-semibold">{s?.fullName}</span><span className="text-sm text-stone-600">{cat.get(s?.categoryId ?? "")}</span></span>
                    <span className="text-xs font-semibold">{c.kind === "free" ? "✓ Hora libre" : "● Disponible"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="rounded-lg border border-stone-200 bg-white p-3">
          {row.coverageStatus === "not_required" ? <Button variant="secondary" onClick={() => run(() => setNotRequired(db, affectedId, false))}>Volver a requerir cobertura</Button> : (
            <>
              <Field label="No requiere cobertura — motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button variant="secondary" className="mt-2" onClick={() => run(() => setNotRequired(db, affectedId, true, reason))}>Marcar «No requiere cobertura»</Button>
            </>
          )}
        </div>
        <ErrorBox messages={errors} />
      </div>
    </Sheet>
  );
}
