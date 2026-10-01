import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { addDocument, cancelIncident, previewAffected, removeDocument, saveIncident, MAX_DOCUMENT_BYTES, type IncidentInput } from "@/data/incidents";
import { today as todayOf } from "@/data/context";
import type { AffectedClass, Incident, IncidentScope } from "@/data/types";
import { formatDate, weekdayOf } from "@/domain/dates";
import { WEEKDAYS } from "@/domain/time";
import { Badge, Button, ErrorBox, Field, SelectField, Sheet, TextAreaField } from "@/ui/ui";
import { Empty } from "@/ui/common";
import { download } from "@/ui/download";

const PAGE = 40;

export function IncidentsPage() {
  const incidents = useLiveQuery(() => db.incidents.orderBy("startDate").reverse().toArray(), [], []);
  const staff = useLiveQuery(() => db.staff.toArray(), [], []);
  const types = useLiveQuery(() => db.incidentTypes.toArray(), [], []);
  const [fStaff, setFStaff] = useState("");
  const [fType, setFType] = useState("");
  const [fStatus, setFStatus] = useState<"active" | "cancelled" | "">("active");
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<Incident | "new" | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const staffName = useMemo(() => new Map(staff.map((s) => [s.id, s.fullName])), [staff]);
  const typeName = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);
  const rows = incidents.filter((i) => (!fStaff || i.staffId === fStaff) && (!fType || i.typeId === fType) && (!fStatus || i.status === fStatus));

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Incidencias</h1>
      <button type="button" onClick={() => setEditing("new")} className="rounded-xl bg-emerald-700 px-4 py-4 text-lg font-bold tracking-wide text-white shadow hover:bg-emerald-800">+ REGISTRAR INCIDENCIA</button>
      <div className="grid gap-3 sm:grid-cols-3">
        <select aria-label="Filtrar por persona" value={fStaff} onChange={(e) => { setFStaff(e.target.value); setLimit(PAGE); }} className="rounded-lg border border-stone-300 bg-white px-3 py-2.5">
          <option value="">Todo el personal</option>
          {staff.slice().sort((a, b) => a.fullName.localeCompare(b.fullName, "es")).map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
        </select>
        <select aria-label="Filtrar por tipo" value={fType} onChange={(e) => { setFType(e.target.value); setLimit(PAGE); }} className="rounded-lg border border-stone-300 bg-white px-3 py-2.5">
          <option value="">Todos los tipos</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select aria-label="Filtrar por estado" value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)} className="rounded-lg border border-stone-300 bg-white px-3 py-2.5">
          <option value="active">Vigentes</option>
          <option value="cancelled">Canceladas</option>
          <option value="">Todas</option>
        </select>
      </div>
      {rows.length === 0 ? <Empty>No hay incidencias con esos filtros.</Empty> : (
        <ul className="flex flex-col gap-2">
          {rows.slice(0, limit).map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => setDetail(i.id)} className="flex w-full flex-col gap-1 rounded-lg border border-stone-200 bg-white p-3 text-left hover:bg-stone-50">
                <span className="flex items-center justify-between gap-2"><span className="font-semibold">{staffName.get(i.staffId) ?? "?"}</span>{i.status === "cancelled" ? <Badge tone="off">✗ Cancelada</Badge> : <Badge tone="info">{typeName.get(i.typeId)}</Badge>}</span>
                <span className="text-sm text-stone-600">{i.startDate === i.endDate ? formatDate(i.startDate) : `${formatDate(i.startDate)} al ${formatDate(i.endDate)}`} · {i.scope === "full_day" ? "Día completo" : i.scope === "time_range" ? `${i.startTime}–${i.endTime}` : "Por periodos"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > limit ? <Button variant="secondary" onClick={() => setLimit(limit + PAGE)}>Mostrar más</Button> : null}
      {editing ? <IncidentForm key={editing === "new" ? "new" : editing.id} incident={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(id) => { setEditing(null); setDetail(id); }} /> : null}
      {detail && !editing ? <IncidentDetail id={detail} onClose={() => setDetail(null)} onEdit={(i) => setEditing(i)} /> : null}
    </section>
  );
}

function IncidentForm({ incident, onClose, onSaved }: { incident: Incident | null; onClose: () => void; onSaved: (id: string) => void }) {
  const staff = useLiveQuery(() => db.staff.filter((s) => s.isActive || s.id === incident?.staffId).toArray(), [], []);
  const types = useLiveQuery(() => db.incidentTypes.filter((t) => t.isActive || t.id === incident?.typeId).toArray(), [], []);
  const periods = useLiveQuery(async () => (await db.periods.toArray()).sort((a, b) => a.position - b.position), [], []);
  const groups = useLiveQuery(() => db.groups.toArray(), [], []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);
  const today = useLiveQuery(() => todayOf(db), [], "");
  const [f, setF] = useState<IncidentInput>(() => ({
    id: incident?.id, staffId: incident?.staffId ?? "", typeId: incident?.typeId ?? "", startDate: incident?.startDate ?? "", endDate: incident?.endDate ?? "",
    scope: incident?.scope ?? "full_day", periodIds: incident?.periodIds ?? [], startTime: incident?.startTime ?? "", endTime: incident?.endTime ?? "", notes: incident?.notes ?? "", reason: "",
  }));
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmInactive, setConfirmInactive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<AffectedClass[]>([]);

  useEffect(() => { if (today && !incident && !f.startDate) setF((x) => ({ ...x, startDate: today, endDate: today })); }, [today, incident, f.startDate]);
  const key = JSON.stringify([f.staffId, f.typeId, f.startDate, f.endDate, f.scope, f.periodIds, f.startTime, f.endTime]);
  useEffect(() => { let off = false; previewAffected(db, f).then((r) => { if (!off) setPreview(r); }).catch(() => { if (!off) setPreview([]); }); return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = <K extends keyof IncidentInput>(k: K, v: IncidentInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const person = staff.find((s) => s.id === f.staffId);
  const dayCells = useLiveQuery(async () => {
    if (!f.staffId || !f.startDate) return [];
    const y = (await db.schoolYears.toArray()).find((x) => x.startsOn <= f.startDate && f.startDate <= x.endsOn) ?? (await db.schoolYears.toArray())[0];
    if (!y) return [];
    return (await db.assignments.where("[schoolYearId+staffId]").equals([y.id, f.staffId]).toArray()).filter((a) => a.weekday === weekdayOf(f.startDate));
  }, [f.staffId, f.startDate], []);
  const pName = new Map(periods.map((p) => [p.id, p]));
  const gName = new Map(groups.map((g) => [g.id, g.name]));
  const sName = new Map(subjects.map((s) => [s.id, s.name]));
  const classes = preview.filter((a) => a.isClass);

  const submit = async () => {
    setSaving(true);
    try { onSaved(await saveIncident(db, { ...f, confirmInactive })); } catch (e) { setErrors([e instanceof Error ? e.message : "No se pudo guardar."]); } finally { setSaving(false); }
  };

  return (
    <Sheet title={incident ? "Modificar incidencia" : "Registrar incidencia"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <SelectField label="Persona" value={f.staffId} onChange={(e) => set("staffId", e.target.value)}>
          <option value="">Elige a la persona…</option>
          {staff.slice().sort((a, b) => a.fullName.localeCompare(b.fullName, "es")).map((s) => <option key={s.id} value={s.id}>{s.fullName}{s.isActive ? "" : " (inactivo)"}</option>)}
        </SelectField>
        {person && !person.isActive ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={confirmInactive} onChange={(e) => setConfirmInactive(e.target.checked)} />Confirmo registrar la incidencia de una persona inactiva</label> : null}
        {person && f.startDate ? (
          <p className="rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-700">
            <b>{WEEKDAYS.find((d) => d.n === weekdayOf(f.startDate))?.label ?? ""} {formatDate(f.startDate)}:</b>{" "}
            {dayCells.length === 0 ? "sin actividades en su horario." : dayCells.sort((a, b) => (pName.get(a.periodId)?.startsAt ?? "").localeCompare(pName.get(b.periodId)?.startsAt ?? "")).map((a) => `${pName.get(a.periodId)?.name ?? "?"}${a.groupId ? ` ${gName.get(a.groupId)}` : ""}`).join(" · ")}
          </p>
        ) : null}
        <SelectField label="Tipo de incidencia" value={f.typeId} onChange={(e) => set("typeId", e.target.value)}>
          <option value="">Elige el tipo…</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </SelectField>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha inicial" type="date" value={f.startDate} onChange={(e) => setF((x) => ({ ...x, startDate: e.target.value, endDate: x.endDate < e.target.value ? e.target.value : x.endDate }))} />
          <Field label="Fecha final" type="date" value={f.endDate} min={f.startDate} onChange={(e) => set("endDate", e.target.value)} />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">¿Cuánto abarca?</legend>
          {([["full_day", "Día completo"], ["periods", "Por periodos"], ["time_range", "Rango de horas"]] as [IncidentScope, string][]).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-3"><input type="radio" name="scope" className="h-4 w-4 accent-emerald-700" checked={f.scope === k} onChange={() => set("scope", k)} />{l}</label>
          ))}
        </fieldset>
        {f.scope === "periods" ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Periodos afectados">
            {periods.filter((p) => p.kind !== "break").map((p) => {
              const on = f.periodIds.includes(p.id);
              return <button key={p.id} type="button" aria-pressed={on} onClick={() => set("periodIds", on ? f.periodIds.filter((x) => x !== p.id) : [...f.periodIds, p.id])} className={`rounded-lg border px-3 py-2 text-sm font-medium ${on ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-300 bg-white"}`}>{on ? "✓ " : ""}{p.name} <span className="opacity-70">{p.startsAt}</span></button>;
            })}
          </div>
        ) : null}
        {f.scope === "time_range" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="De" type="time" value={f.startTime} onChange={(e) => set("startTime", e.target.value)} />
            <Field label="A" type="time" value={f.endTime} onChange={(e) => set("endTime", e.target.value)} />
          </div>
        ) : null}

        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3" aria-live="polite">
          <p className="font-semibold text-amber-900">{classes.length === 0 ? "Clases afectadas: ninguna detectada" : `Clases afectadas detectadas: ${classes.length}`}</p>
          {classes.length > 0 ? (
            <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-sm text-amber-900">
              {classes.slice(0, 30).map((a) => <li key={a.id}>{formatDate(a.date)} · {pName.get(a.periodId)?.name} · {gName.get(a.groupId) ?? "—"} · {sName.get(a.subjectId) ?? "—"}</li>)}
              {classes.length > 30 ? <li>…y {classes.length - 30} más</li> : null}
            </ul>
          ) : null}
        </div>

        <TextAreaField label="Observaciones" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        {incident ? <Field label="Motivo del cambio (opcional)" value={f.reason ?? ""} onChange={(e) => set("reason", e.target.value)} /> : null}
        <ErrorBox messages={errors} />
        <Button onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Guardar incidencia"}</Button>
      </div>
    </Sheet>
  );
}

function IncidentDetail({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (i: Incident) => void }) {
  const inc = useLiveQuery(() => db.incidents.get(id), [id]);
  const person = useLiveQuery(async () => (inc ? db.staff.get(inc.staffId) : undefined), [inc?.staffId]);
  const type = useLiveQuery(async () => (inc ? db.incidentTypes.get(inc.typeId) : undefined), [inc?.typeId]);
  const affected = useLiveQuery(() => db.affected.where("incidentId").equals(id).toArray(), [id], []);
  const docs = useLiveQuery(() => db.documents.where("incidentId").equals(id).toArray(), [id], []);
  const history = useLiveQuery(() => db.audit.where("recordId").equals(id).toArray(), [id], []);
  const periods = useLiveQuery(() => db.periods.toArray(), [], []);
  const groups = useLiveQuery(() => db.groups.toArray(), [], []);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  if (!inc) return null;
  const pName = new Map(periods.map((p) => [p.id, p.name]));
  const gName = new Map(groups.map((g) => [g.id, g.name]));

  const attach = async (file: File | undefined) => {
    if (!file) return;
    try { await addDocument(db, id, { name: file.name, type: file.type, size: file.size }, file); setErrors([]); } catch (e) { setErrors([e instanceof Error ? e.message : "No se pudo adjuntar."]); }
  };

  return (
    <Sheet title={`${type?.name ?? "Incidencia"} · ${person?.fullName ?? ""}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p>{inc.startDate === inc.endDate ? formatDate(inc.startDate) : `${formatDate(inc.startDate)} al ${formatDate(inc.endDate)}`} · {inc.scope === "full_day" ? "Día completo" : inc.scope === "time_range" ? `${inc.startTime}–${inc.endTime}` : inc.periodIds.map((p) => pName.get(p)).join(", ")}</p>
        {inc.status === "cancelled" ? <p className="rounded-lg border border-stone-300 bg-stone-100 p-3">✗ Cancelada. Motivo: {inc.cancelReason}</p> : null}
        {inc.notes ? <p className="rounded-lg bg-white p-3 text-sm">{inc.notes}</p> : null}

        <div>
          <h3 className="font-semibold">Clases afectadas ({affected.filter((a) => a.isClass).length})</h3>
          {affected.length === 0 ? <p className="text-sm text-stone-600">Ninguna.</p> : (
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {affected.sort((a, b) => a.date.localeCompare(b.date)).map((a) => <li key={a.id} className="flex justify-between rounded bg-white px-2 py-1"><span>{formatDate(a.date)} · {pName.get(a.periodId)} · {gName.get(a.groupId) ?? "—"}</span><span>{a.coverageStatus === "covered" ? "✓ Cubierta" : a.coverageStatus === "not_required" ? "– No requiere" : "⚠ Sin cubrir"}</span></li>)}
            </ul>
          )}
          {affected.some((a) => a.coverageStatus === "uncovered") ? <a href="#/coberturas" className="mt-1 inline-block text-sm font-medium text-emerald-800 underline">Asignar coberturas</a> : null}
        </div>

        <div>
          <h3 className="font-semibold">Documentos</h3>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {docs.map((d) => <li key={d.id} className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1"><button type="button" className="truncate text-left font-medium text-emerald-800 underline" onClick={() => download(d.name, d.blob)}>{d.name}</button>{inc.status === "active" ? <button type="button" className="text-red-700" onClick={() => removeDocument(db, d.id)}>Quitar</button> : null}</li>)}
          </ul>
          {inc.status === "active" ? <label className="mt-2 block text-sm"><span className="mb-1 block font-medium">Adjuntar (PDF o foto, máx. {MAX_DOCUMENT_BYTES / 1024 / 1024} MB)</span><input type="file" accept="image/*,application/pdf" onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = ""; }} /></label> : null}
        </div>

        {inc.status === "active" ? (
          cancelling ? (
            <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <Field label="Motivo de la cancelación" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button variant="danger" onClick={async () => { try { await cancelIncident(db, id, reason); setCancelling(false); setErrors([]); } catch (e) { setErrors([e instanceof Error ? e.message : "No se pudo cancelar."]); } }}>Confirmar cancelación</Button>
            </div>
          ) : (
            <div className="flex gap-2"><Button onClick={() => onEdit(inc)}>Modificar</Button><Button variant="danger" onClick={() => setCancelling(true)}>Cancelar incidencia</Button></div>
          )
        ) : null}
        <ErrorBox messages={errors} />

        <div>
          <h3 className="font-semibold">Historial</h3>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {history.sort((a, b) => b.at.localeCompare(a.at)).map((h) => <li key={h.id} className="rounded bg-white px-2 py-1">{new Date(h.at).toLocaleString("es-MX")} — {h.summary}{h.reason ? ` (motivo: ${h.reason})` : ""}</li>)}
          </ul>
        </div>
      </div>
    </Sheet>
  );
}
