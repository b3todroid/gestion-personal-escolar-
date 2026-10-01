import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { loadToday, type TodayRow } from "@/data/dashboard";
import { correctEntry, registerEntry, voidEntry } from "@/data/attendance";
import { saveIncident } from "@/data/incidents";
import { getSettings, today as todayOf } from "@/data/context";
import { matchesQuery } from "@/data/staff";
import { formatLongDate, nowTimeIn } from "@/domain/dates";
import { Button, ErrorBox, Field, Sheet } from "@/ui/ui";
import { Empty, StatusPill, Tile } from "@/ui/common";
import { goTo } from "@/router";

type Action = { kind: "arrive" | "correct" | "absent"; row: TodayRow } | null;

export function HomePage() {
  const settings = useLiveQuery(() => getSettings(db).catch(() => null));
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 60_000); return () => clearInterval(t); }, []);
  const realToday = useLiveQuery(() => todayOf(db), [tick]);
  const [picked, setPicked] = useState("");
  const date = picked || realToday || "";
  const nowTime = settings ? nowTimeIn(settings.timezone) : "00:00";
  const data = useLiveQuery(() => (date ? loadToday(db, date, nowTime) : undefined), [date, nowTime]);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<Action>(null);
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  if (!data) return <p className="text-stone-600">Cargando…</p>;
  const c = data.counts;
  const q = query.trim();
  const rows = data.rows.filter((r) => !q || matchesQuery(r.staff.fullName, q));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Hoy</h1>
          <p className="text-stone-600 first-letter:uppercase">{formatLongDate(data.date)} · {data.nowTime}</p>
        </div>
        <div className="w-44"><Field label="Ver otro día" type="date" value={date} onChange={(e) => setPicked(e.target.value)} /></div>
      </div>

      {data.isHoliday ? <p className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sky-900">📅 Día no laborable{data.holidayLabel ? `: ${data.holidayLabel}` : ""}. No se espera al personal.</p> : null}
      {data.isWeekend && !data.isHoliday ? <p className="rounded-lg border border-stone-300 bg-white p-3 text-stone-700">Fin de semana: no se espera al personal.</p> : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Personal esperado" value={c.expected} />
        <Tile label="Con entrada" value={c.withEntry} tone="ok" />
        <Tile label="Sin registro" value={c.noRecord} tone={c.noRecord ? "warn" : "off"} />
        <Tile label="Retardos" value={c.late} tone={c.late ? "warn" : "off"} />
        <Tile label="Faltas" value={c.absences} tone={c.absences ? "bad" : "off"} />
        <Tile label="Licencias" value={c.leaves} tone="info" />
        <Tile label="Permisos / constancias" value={c.permits + c.certificates} tone="info" />
        <Tile label="Clases sin cubrir" value={c.pending} tone={c.pending ? "bad" : "ok"} onClick={() => goTo("/coberturas")} />
      </div>

      {data.pendingClasses.length > 0 ? (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">
          <p className="font-semibold">⚠ {data.pendingClasses.length} clase(s) sin cubrir</p>
          <a href="#/coberturas" className="text-sm font-medium underline">Ir a Coberturas</a>
        </div>
      ) : null}
      {data.overdue.length > 0 ? (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
          <p className="font-semibold">⏱ Sin entrada pasada su hora ({data.overdue.length})</p>
          <p className="text-sm">{data.overdue.map((r) => r.staff.fullName).join(", ")}</p>
        </div>
      ) : null}

      <div className="flex gap-2">
        <input aria-label="Buscar persona" placeholder="Buscar persona…" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2.5" />
        <Button onClick={() => goTo("/incidencias")}>+ Incidencia</Button>
      </div>

      {rows.length === 0 ? <Empty>{data.rows.length === 0 ? "Nadie se espera este día. Revisa que el personal tenga horario laboral en Personal." : "Nadie coincide con la búsqueda."}</Empty> : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.staff.id} className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <a href={`#/ficha/${r.staff.id}`} className="block truncate font-semibold hover:underline">{r.staff.fullName}</a>
                <p className="text-sm text-stone-600">{catName.get(r.staff.categoryId) ?? ""}{r.expectedTime ? ` · entra ${r.expectedTime}` : ""}{r.entry ? ` · llegó ${r.entry.arrivedTime}${r.entry.status === "late" ? ` (${r.entry.lateMinutes} min tarde)` : ""}` : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={r.status} />
                {!r.entry && r.status !== "absent" && r.status !== "leave" && r.status !== "permit" && r.status !== "certificate" ? <button type="button" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white" onClick={() => setAction({ kind: "arrive", row: r })}>Registrar llegada</button> : null}
                {r.entry ? <button type="button" className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold" onClick={() => setAction({ kind: "correct", row: r })}>Corregir</button> : null}
                {!r.entry && r.incidents.length === 0 ? <button type="button" className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700" onClick={() => setAction({ kind: "absent", row: r })}>Falta</button> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {action ? <ActionSheet action={action} date={data.date} defaultTime={data.nowTime} onClose={() => setAction(null)} /> : null}
    </section>
  );
}

function ActionSheet({ action, date, defaultTime, onClose }: { action: NonNullable<Action>; date: string; defaultTime: string; onClose: () => void }) {
  const { row, kind } = action;
  const [time, setTime] = useState(row.entry?.arrivedTime ?? defaultTime);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string[]>([]);
  const [done, setDone] = useState("");

  const run = async (fn: () => Promise<string | void>) => {
    try { const msg = await fn(); setError([]); if (msg) setDone(msg); else onClose(); } catch (e) { setError([e instanceof Error ? e.message : "No se pudo guardar."]); }
  };
  const title = kind === "arrive" ? `Llegada de ${row.staff.fullName}` : kind === "correct" ? `Corregir entrada de ${row.staff.fullName}` : `Falta de ${row.staff.fullName}`;

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {done ? (
          <>
            <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">{done}</p>
            <Button onClick={onClose}>Listo</Button>
          </>
        ) : kind === "absent" ? (
          <>
            <p>Se registrará una <b>inasistencia de día completo</b> el día elegido y se detectarán sus clases afectadas.</p>
            <Field label="Observaciones (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <ErrorBox messages={error} />
            <Button onClick={() => run(async () => {
              const t = (await db.incidentTypes.toArray()).find((x) => x.countsAs === "absence" && x.isActive);
              if (!t) throw new Error("No hay un tipo de incidencia de inasistencia activo. Revisa Configuración.");
              await saveIncident(db, { staffId: row.staff.id, typeId: t.id, startDate: date, endDate: date, scope: "full_day", periodIds: [], startTime: "", endTime: "", notes: note });
              const n = await db.affected.where("staffId").equals(row.staff.id).and((a) => a.date === date && a.isClass).count();
              return `Falta registrada. Clases afectadas: ${n}.${n ? " Asigna coberturas en la sección Coberturas." : ""}`;
            })}>Registrar falta</Button>
          </>
        ) : (
          <>
            <Field label="Hora de llegada" type="time" value={time} onChange={(e) => setTime(e.target.value)} hint={row.expectedTime ? `Hora esperada: ${row.expectedTime}` : undefined} />
            {kind === "arrive" ? <Field label="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} /> : <Field label="Motivo de la corrección" value={reason} onChange={(e) => setReason(e.target.value)} />}
            <ErrorBox messages={error} />
            <Button onClick={() => run(async () => {
              const e = kind === "arrive" ? await registerEntry(db, { staffId: row.staff.id, date, arrivedTime: time, note }) : await correctEntry(db, { staffId: row.staff.id, date, arrivedTime: time, reason });
              return e.status === "late" ? `Retardo de ${e.lateMinutes} minutos (esperada ${e.expectedTime}, llegó ${e.arrivedTime}).` : `A tiempo (${e.arrivedTime}).`;
            })}>{kind === "arrive" ? "Guardar llegada" : "Guardar corrección"}</Button>
            {kind === "correct" ? <Button variant="danger" onClick={() => run(async () => { await voidEntry(db, row.staff.id, date, reason); })}>Anular entrada (requiere motivo)</Button> : null}
          </>
        )}
      </div>
    </Sheet>
  );
}
