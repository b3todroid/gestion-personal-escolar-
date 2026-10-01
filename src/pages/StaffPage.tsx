import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { loadWorkWeek, matchesQuery, needsWorkSchedule, saveStaff, ValidationError, type StaffInput } from "@/data/staff";
import type { Staff } from "@/data/types";
import { emptyWeek, type WorkDayInput } from "@/domain/workSchedule";
import { WEEKDAYS } from "@/domain/time";
import { WorkWeekEditor } from "@/ui/WorkWeekEditor";
import { Badge, Button, CheckField, ErrorBox, Field, SelectField, Sheet, TextAreaField } from "@/ui/ui";

export function StaffPage() {
  const staff = useLiveQuery(() => db.staff.orderBy("fullName").toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const workDays = useLiveQuery(() => db.workDays.toArray(), [], []);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Staff | "new" | null>(null);

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const visible = staff.filter((s) => (showInactive || s.isActive) && (!categoryFilter || s.categoryId === categoryFilter) && matchesQuery(s.fullName, query));

  const scheduleSummary = (s: Staff): string => {
    if (!needsWorkSchedule(s)) return "Entrada según su primera actividad";
    const days = workDays.filter((d) => d.staffId === s.id && d.works).sort((a, b) => a.weekday - b.weekday);
    if (days.length === 0) return "Sin horario";
    const same = days.every((d) => d.startsAt === days[0].startsAt && d.endsAt === days[0].endsAt);
    return same && days.length === 5 ? `L–V ${days[0].startsAt}–${days[0].endsAt}` : `${days.length} días laborables`;
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Personal</h1>
        <Button onClick={() => setEditing("new")}>+ Agregar persona</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <input aria-label="Buscar persona" placeholder="Buscar por nombre…" value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base" />
        <select aria-label="Filtrar por categoría" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base">
          <option value="">Todas las categorías</option>
          {categories.filter((c) => c.isActive).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input type="checkbox" className="h-4 w-4 accent-emerald-700" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        Mostrar personal inactivo
      </label>

      {staff.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-center text-stone-600">Aún no hay personal. Usa «+ Agregar persona» para empezar.</p>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-stone-200 bg-white p-6 text-center text-stone-600">Nadie coincide con la búsqueda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => setEditing(s)} className="flex w-full flex-col gap-1 rounded-lg border border-stone-200 bg-white p-3 text-left hover:bg-stone-50">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{s.fullName}</span>
                  <Badge tone={s.isActive ? "ok" : "off"}>{s.isActive ? "✓ Activo" : "– Inactivo"}</Badge>
                </span>
                <span className="text-sm text-stone-600">
                  {categoryName.get(s.categoryId) ?? "Sin categoría"}
                  {s.jobTitle ? ` · ${s.jobTitle}` : ""} · {s.isTeaching ? "Con grupos" : "Sin grupo"}
                </span>
                <span className="text-xs text-stone-500">{scheduleSummary(s)}</span>
              </button>
              <a href={`#/ficha/${s.id}`} className="mt-1 inline-block px-1 text-sm font-medium text-emerald-800 underline">Ver ficha y resumen</a>
            </li>
          ))}
        </ul>
      )}

      {editing ? <StaffSheet key={editing === "new" ? "new" : editing.id} person={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

function StaffSheet({ person, onClose }: { person: Staff | null; onClose: () => void }) {
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const shifts = useLiveQuery(() => db.shifts.toArray(), [], []);
  const defaultShift = shifts[0]?.id ?? "";
  const [form, setForm] = useState<StaffInput>(() => ({
    id: person?.id, firstName: person?.firstName ?? "", lastName: person?.lastName ?? "", employeeNumber: person?.employeeNumber ?? "",
    categoryId: person?.categoryId ?? "", jobTitle: person?.jobTitle ?? "", email: person?.email ?? "", phone: person?.phone ?? "",
    shiftId: person?.shiftId ?? "", isTeaching: person?.isTeaching ?? false, entryRule: person?.entryRule ?? "fixed",
    isActive: person?.isActive ?? true, hiredOn: person?.hiredOn ?? "", adminNotes: person?.adminNotes ?? "",
  }));
  const [week, setWeek] = useState<WorkDayInput[]>(emptyWeek());
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const personId = person?.id;
  useEffect(() => {
    if (!personId) return;
    let cancelled = false;
    loadWorkWeek(db, personId).then((w) => {
      if (!cancelled && w) setWeek(WEEKDAYS.map((d) => w.find((x) => x.weekday === d.n) ?? { weekday: d.n, works: true, startsAt: "", endsAt: "" }));
    });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  const set = <K extends keyof StaffInput>(key: K, value: StaffInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const activeCategories = categories.filter((c) => c.isActive || c.id === form.categoryId);

  const pickCategory = (id: string) => {
    const cat = categories.find((c) => c.id === id);
    setForm((f) => ({ ...f, categoryId: id, isTeaching: person ? f.isTeaching : (cat?.isTeaching ?? false), entryRule: cat?.isTeaching || f.isTeaching ? f.entryRule : "fixed" }));
  };

  const submit = async () => {
    setSaving(true);
    try {
      await saveStaff(db, { ...form, shiftId: form.shiftId || defaultShift }, week);
      onClose();
    } catch (e) {
      setErrors(e instanceof ValidationError ? e.messages : [e instanceof Error ? e.message : "No se pudo guardar."]);
      setSaving(false);
    }
  };

  return (
    <Sheet title={person ? person.fullName : "Nueva persona"} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre(s)" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
          <Field label="Apellidos" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </div>
        <SelectField label="Categoría" value={form.categoryId} onChange={(e) => pickCategory(e.target.value)}>
          <option value="">Elige una categoría…</option>
          {activeCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </SelectField>
        <Field label="Cargo o función (opcional)" value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Número de empleado (opcional)" value={form.employeeNumber} onChange={(e) => set("employeeNumber", e.target.value)} />
          <Field label="Fecha de ingreso (opcional)" type="date" value={form.hiredOn} onChange={(e) => set("hiredOn", e.target.value)} />
          <Field label="Correo (opcional)" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          <Field label="Teléfono (opcional)" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>

        <CheckField label="Es docente (atiende grupos)" hint="Si no, se maneja como personal sin grupo." checked={form.isTeaching} onChange={(e) => setForm((f) => ({ ...f, isTeaching: e.target.checked, entryRule: e.target.checked ? f.entryRule : "fixed" }))} />
        {form.isTeaching ? (
          <SelectField label="¿Cómo se define su hora de entrada?" value={form.entryRule} onChange={(e) => set("entryRule", e.target.value as StaffInput["entryRule"])}>
            <option value="fixed">Horario laboral fijo</option>
            <option value="first_activity">Su primera actividad del día</option>
          </SelectField>
        ) : null}

        <div>
          <h3 className="mb-2 text-base font-semibold">Horario laboral</h3>
          {needsWorkSchedule(form) ? (
            <WorkWeekEditor week={week} onChange={setWeek} />
          ) : (
            <p className="rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-600">Su entrada se calculará con la primera actividad de su horario docente (Fase 3).</p>
          )}
        </div>

        <TextAreaField label="Notas administrativas (opcional)" value={form.adminNotes} onChange={(e) => set("adminNotes", e.target.value)} />
        <p className="text-xs text-stone-500">No captures diagnósticos ni datos médicos.</p>
        <CheckField label="Personal activo" hint="Desmárcalo para dar de baja sin perder su historial." checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />

        <ErrorBox messages={errors} />
        <Button onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
      </div>
    </Sheet>
  );
}
