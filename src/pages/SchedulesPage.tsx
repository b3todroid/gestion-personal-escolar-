import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { clearAssignment, saveAssignment } from "@/data/schedule";
import { toCsv } from "@/domain/csv";
import { applyScheduleImport, previewScheduleImport, scheduleTemplateCsv, type ImportPreview } from "@/data/scheduleImport";
import type { Assignment, Period } from "@/data/types";
import { WEEKDAYS } from "@/domain/time";
import { ScheduleGrid } from "@/ui/ScheduleGrid";
import { downloadText } from "@/ui/download";
import { Button, CheckField, ErrorBox, SelectField, Sheet } from "@/ui/ui";

type Tab = "docente" | "grupo" | "importar";

export function SchedulesPage() {
  const [tab, setTab] = useState<Tab>("docente");
  const tabs: { id: Tab; label: string }[] = [
    { id: "docente", label: "Por docente" },
    { id: "grupo", label: "Por grupo" },
    { id: "importar", label: "Importar" },
  ];
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Horarios</h1>
      <div role="tablist" aria-label="Vista de horarios" className="flex gap-1 rounded-lg bg-stone-200 p-1">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${tab === t.id ? "bg-white text-emerald-900 shadow-sm" : "text-stone-700"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "docente" ? <TeacherView /> : tab === "grupo" ? <GroupView /> : <ImportView />}
    </section>
  );
}

function useBase() {
  const year = useLiveQuery(async () => (await db.schoolYears.toArray()).find((y) => y.isCurrent) ?? null);
  const periods = useLiveQuery(async () => (await db.periods.toArray()).sort((a, b) => a.position - b.position), [], [] as Period[]);
  return { year, periods };
}

function TeacherView() {
  const { year, periods } = useBase();
  const staff = useLiveQuery(() => db.staff.toArray(), [], []);
  const groups = useLiveQuery(() => db.groups.toArray(), [], []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);
  const [staffId, setStaffId] = useState("");
  const [editing, setEditing] = useState<{ weekday: number; period: Period } | null>(null);

  const people = useMemo(() => staff.filter((s) => s.isActive || s.id === staffId).sort((a, b) => Number(b.isTeaching) - Number(a.isTeaching) || a.fullName.localeCompare(b.fullName, "es")), [staff, staffId]);
  const cells = useLiveQuery(async () => (year && staffId ? db.assignments.where("[schoolYearId+staffId]").equals([year.id, staffId]).toArray() : []), [year?.id, staffId], [] as Assignment[]);
  const activities = useLiveQuery(() => db.activityTypes.toArray(), [], []);
  const find = (weekday: number, periodId: string) => cells.find((c) => c.weekday === weekday && c.periodId === periodId);

  if (year === null) return <p className="text-stone-600">Falta configurar el ciclo escolar.</p>;
  return (
    <div className="flex flex-col gap-4">
      <SelectField label="Persona" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
        <option value="">Elige a quién capturar su horario…</option>
        {people.map((s) => (
          <option key={s.id} value={s.id}>{s.fullName}{s.isTeaching ? "" : " (sin grupo)"}</option>
        ))}
      </SelectField>
      {staff.length === 0 ? <p className="rounded-lg border border-dashed border-stone-300 bg-white p-4 text-sm text-stone-600">Primero agrega personal en la sección Personal.</p> : null}
      {staffId ? (
        <>
          <ScheduleGrid
            periods={periods}
            onCellClick={(weekday, period) => setEditing({ weekday, period })}
            renderCell={(weekday, period) => {
              const c = find(weekday, period.id);
              if (!c) return <span className="text-xl text-stone-300" aria-hidden="true">+</span>;
              const g = groups.find((x) => x.id === c.groupId);
              const s = subjects.find((x) => x.id === c.subjectId);
              const a = activities.find((x) => x.id === c.activityTypeId);
              return (
                <span className="block leading-tight">
                  <span className="block font-semibold">{g?.name ?? a?.name ?? "—"}</span>
                  <span className="block text-xs text-stone-600">{s ? (s.shortName || s.name) : g ? a?.name : ""}</span>
                  {c.allowShared ? <span className="block text-[11px] text-sky-800">Compartida</span> : null}
                </span>
              );
            }}
          />
          <p className="text-xs text-stone-500">Toca una celda para capturar o cambiar la actividad. El horario del grupo se genera solo a partir de este.</p>
        </>
      ) : null}
      {editing && year && staffId ? <CellSheet key={`${editing.weekday}-${editing.period.id}`} yearId={year.id} staffId={staffId} weekday={editing.weekday} period={editing.period} current={find(editing.weekday, editing.period.id)} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function CellSheet({ yearId, staffId, weekday, period, current, onClose }: { yearId: string; staffId: string; weekday: number; period: Period; current?: Assignment; onClose: () => void }) {
  const groups = useLiveQuery(() => db.groups.toArray(), [], []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);
  const activities = useLiveQuery(() => db.activityTypes.toArray(), [], []);
  const person = useLiveQuery(() => db.staff.get(staffId), [staffId]);
  const [activityId, setActivityId] = useState(current?.activityTypeId ?? "");
  const [groupId, setGroupId] = useState(current?.groupId ?? "");
  const [subjectId, setSubjectId] = useState(current?.subjectId ?? "");
  const [shared, setShared] = useState(current?.allowShared ?? false);
  const [errors, setErrors] = useState<string[]>([]);

  const defaultClass = activities.find((a) => a.isClass && a.isActive);
  const effectiveActivity = activityId || defaultClass?.id || "";
  const isClass = activities.find((a) => a.id === effectiveActivity)?.isClass ?? false;
  const day = WEEKDAYS.find((d) => d.n === weekday)?.label;

  const save = async () => {
    try {
      let confirmInactive = false;
      if (person && !person.isActive) {
        confirmInactive = window.confirm(`${person.fullName} está inactivo/a. ¿Asignarle actividad de todos modos?`);
        if (!confirmInactive) return;
      }
      await saveAssignment(db, { schoolYearId: yearId, staffId, weekday, periodId: period.id, groupId, subjectId, activityTypeId: effectiveActivity, allowShared: shared, confirmInactive });
      onClose();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "No se pudo guardar."]);
    }
  };
  const remove = async () => {
    await clearAssignment(db, yearId, staffId, weekday, period.id);
    onClose();
  };

  return (
    <Sheet title={`${day} · ${period.name} (${period.startsAt}–${period.endsAt})`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <SelectField label="Tipo de actividad" value={effectiveActivity} onChange={(e) => setActivityId(e.target.value)}>
          {activities.filter((a) => a.isActive || a.id === effectiveActivity).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </SelectField>
        <SelectField label={isClass ? "Grupo" : "Grupo (opcional)"} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">{groups.length === 0 ? "No hay grupos: créalos en Grupos" : "Sin grupo"}</option>
          {groups.filter((g) => g.isActive || g.id === groupId).map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </SelectField>
        <SelectField label={isClass ? "Materia" : "Materia (opcional)"} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">{subjects.length === 0 ? "No hay materias: créalas en Grupos" : "Sin materia"}</option>
          {subjects.filter((s) => s.isActive || s.id === subjectId).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </SelectField>
        {groupId ? <CheckField label="Clase compartida" hint="Actívalo solo si otro docente atiende este grupo al mismo tiempo." checked={shared} onChange={(e) => setShared(e.target.checked)} /> : null}
        <ErrorBox messages={errors} />
        <Button onClick={save}>Guardar</Button>
        {current ? <Button variant="danger" onClick={remove}>Quitar de este periodo</Button> : null}
      </div>
    </Sheet>
  );
}

function GroupView() {
  const { year, periods } = useBase();
  const groups = useLiveQuery(() => db.groups.orderBy("name").toArray(), [], []);
  const staff = useLiveQuery(() => db.staff.toArray(), [], []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);
  const [groupId, setGroupId] = useState("");
  const cells = useLiveQuery(async () => (year && groupId ? db.assignments.where("[schoolYearId+groupId]").equals([year.id, groupId]).toArray() : []), [year?.id, groupId], [] as Assignment[]);

  return (
    <div className="flex flex-col gap-4">
      <SelectField label="Grupo" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
        <option value="">Elige un grupo…</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>{g.name}{g.isActive ? "" : " (inactivo)"}</option>
        ))}
      </SelectField>
      {groupId ? (
        <>
          <ScheduleGrid
            periods={periods}
            renderCell={(weekday, period) => {
              const here = cells.filter((c) => c.weekday === weekday && c.periodId === period.id);
              if (here.length === 0) return <span className="text-xs text-amber-800">⚠ Sin docente</span>;
              return (
                <span className="flex flex-col gap-1">
                  {here.map((c) => {
                    const s = subjects.find((x) => x.id === c.subjectId);
                    return (
                      <span key={c.id} className="block leading-tight">
                        <span className="block font-semibold">{s ? (s.shortName || s.name) : "Actividad"}</span>
                        <span className="block text-xs text-stone-600">{staff.find((x) => x.id === c.staffId)?.fullName ?? "—"}</span>
                      </span>
                    );
                  })}
                </span>
              );
            }}
          />
          <p className="text-xs text-stone-500">Esta vista es de solo lectura: se genera automáticamente del horario de cada docente.</p>
        </>
      ) : null}
    </div>
  );
}

function ImportView() {
  const { year } = useBase();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState<string[]>([]);

  const onFile = async (file: File) => {
    if (!year) return;
    setMessage("");
    setFailure([]);
    try {
      let text: string;
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        const table = await readSheet(file);
        text = toCsv(table.map((row) => row.map((c) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c)))));
      } else text = await file.text();
      setPreview(await previewScheduleImport(db, text, year.id));
    } catch {
      setPreview(null);
      setFailure(["No se pudo leer el archivo. Usa la plantilla en CSV o un Excel (.xlsx) con las mismas columnas."]);
    }
  };
  const confirm = async () => {
    if (!year || !preview) return;
    try {
      const count = await applyScheduleImport(db, preview, year.id);
      setMessage(`✓ Se importaron ${count} celdas de horario.`);
      setPreview(null);
    } catch (e) {
      setFailure([e instanceof Error ? e.message : "No se pudo importar."]);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-sm text-stone-700">Carga horarios desde un archivo Excel (.xlsx) o CSV. Primero se revisa todo y se muestran los errores; no se guarda nada hasta que confirmes. Cada fila reemplaza la celda de ese docente en ese día y periodo. Antes de importar, el personal, los grupos y las materias ya deben existir.</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => downloadText("plantilla-horarios.csv", scheduleTemplateCsv(), "text/csv")}>Descargar plantilla</Button>
        <Button onClick={() => fileRef.current?.click()}>Elegir archivo (.xlsx o .csv)…</Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
      </div>
      {message ? <p role="status" className="text-sm text-emerald-800">{message}</p> : null}
      <ErrorBox messages={failure} />
      {preview ? (
        <div className="flex flex-col gap-3">
          {preview.errors.length > 0 ? (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <p className="mb-2 font-semibold">⚠ {preview.errors.length} {preview.errors.length === 1 ? "error" : "errores"}: corrige el archivo y vuelve a cargarlo.</p>
              <ul className="list-disc pl-5">
                {preview.errors.slice(0, 50).map((e) => (
                  <li key={`${e.line}-${e.message}`}>Línea {e.line}: {e.message}</li>
                ))}
              </ul>
              {preview.errors.length > 50 ? <p className="mt-1">…y {preview.errors.length - 50} más.</p> : null}
            </div>
          ) : null}
          <p className="text-sm text-stone-700">{preview.rows.length} {preview.rows.length === 1 ? "fila válida" : "filas válidas"}.</p>
          {preview.rows.length > 0 ? (
            <div className="max-h-64 overflow-auto rounded-lg border border-stone-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-stone-100"><tr><th className="px-2 py-1">Docente</th><th className="px-2 py-1">Día</th><th className="px-2 py-1">Periodo</th><th className="px-2 py-1">Grupo</th><th className="px-2 py-1">Materia</th><th className="px-2 py-1">Actividad</th></tr></thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line} className="border-t border-stone-100"><td className="px-2 py-1">{r.staffName}</td><td className="px-2 py-1">{WEEKDAYS.find((d) => d.n === r.weekday)?.label}</td><td className="px-2 py-1">{r.periodName}</td><td className="px-2 py-1">{r.groupName}</td><td className="px-2 py-1">{r.subjectName}</td><td className="px-2 py-1">{r.activityName}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <Button disabled={preview.errors.length > 0 || preview.rows.length === 0} onClick={confirm}>Confirmar importación</Button>
        </div>
      ) : null}
    </div>
  );
}
