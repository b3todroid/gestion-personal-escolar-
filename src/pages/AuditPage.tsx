import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { formatDate } from "@/domain/dates";
import { normalizeText } from "@/data/staff";
import { Empty } from "@/ui/common";

const TABLES: Record<string, string> = { staff: "Personal", assignments: "Horarios", incidents: "Incidencias", attendance: "Entradas", coverages: "Coberturas", affected: "Clases afectadas", settings: "Configuración", holidays: "Días no laborables", schoolYears: "Ciclos", groups: "Grupos", subjects: "Materias", categories: "Categorías", incidentTypes: "Tipos de incidencia", activityTypes: "Actividades", periods: "Periodos", documents: "Documentos" };
const ACTIONS: Record<string, string> = { create: "Alta", update: "Cambio", deactivate: "Baja / cancelación", activate: "Reactivación" };
const PAGE = 50;

export function AuditPage() {
  const all = useLiveQuery(() => db.audit.orderBy("at").reverse().toArray(), [], []);
  const [table, setTable] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => all.filter((a) => (!table || a.table === table) && (!query || normalizeText(`${a.summary} ${a.reason}`).includes(normalizeText(query)))), [all, table, query]);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Auditoría</h1>
      <p className="text-sm text-stone-600">Cada alta, cambio o cancelación queda aquí con la fecha, hora y el valor anterior y nuevo. No se puede borrar.</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <input aria-label="Buscar en la auditoría" placeholder="Buscar…" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} className="rounded-lg border border-stone-300 bg-white px-3 py-2.5" />
        <select aria-label="Filtrar por sección" value={table} onChange={(e) => { setTable(e.target.value); setLimit(PAGE); }} className="rounded-lg border border-stone-300 bg-white px-3 py-2.5">
          <option value="">Todas las secciones</option>
          {Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {rows.length === 0 ? <Empty>No hay movimientos que coincidan.</Empty> : (
        <ul className="flex flex-col gap-2">
          {rows.slice(0, limit).map((a) => {
            const d = new Date(a.at);
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            return (
              <li key={a.id} className="rounded-lg border border-stone-200 bg-white p-3">
                <button type="button" className="w-full text-left" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                  <span className="block text-xs text-stone-500">{formatDate(iso)} {d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · {TABLES[a.table] ?? a.table} · {ACTIONS[a.action]}</span>
                  <span className="block font-medium">{a.summary}</span>
                  {a.reason ? <span className="block text-sm text-stone-600">Motivo: {a.reason}</span> : null}
                </button>
                {open === a.id ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div><p className="text-xs font-semibold text-stone-500">ANTES</p><pre className="max-h-64 overflow-auto rounded bg-stone-100 p-2 text-xs">{a.before ? JSON.stringify(a.before, null, 1) : "—"}</pre></div>
                    <div><p className="text-xs font-semibold text-stone-500">DESPUÉS</p><pre className="max-h-64 overflow-auto rounded bg-stone-100 p-2 text-xs">{a.after ? JSON.stringify(a.after, null, 1) : "—"}</pre></div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > limit ? <button type="button" className="rounded-lg border border-stone-300 bg-white px-4 py-2.5 font-semibold" onClick={() => setLimit(limit + PAGE)}>Mostrar más ({rows.length - limit} restantes)</button> : null}
    </section>
  );
}
