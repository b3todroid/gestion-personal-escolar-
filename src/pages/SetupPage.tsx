import { enterDemo } from "@/data/mode";
import { useState } from "react";
import { db } from "@/data/db";
import { createSchoolSetup, validateSetup, type SetupInput } from "@/data/setup";
import type { ShiftKind } from "@/data/types";
import { BLANK_PERIOD } from "@/domain/periods";
import { PeriodsEditor } from "@/ui/PeriodsEditor";
import { Button, ErrorBox, Field, SelectField } from "@/ui/ui";

const SHIFT_NAMES: Record<ShiftKind, string> = { matutino: "Matutino", vespertino: "Vespertino", ampliada: "Jornada ampliada", personalizado: "" };

export function SetupPage() {
  const [form, setForm] = useState<SetupInput>({
    schoolName: "", cct: "", educationLevel: "", address: "", schoolZone: "", directorName: "", subdirectorName: "",
    yearName: "", yearStart: "", yearEnd: "", timezone: "America/Mexico_City", toleranceMinutes: 0,
    shiftKind: "matutino", shiftName: "Matutino", periods: [{ ...BLANK_PERIOD }],
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof SetupInput>(key: K, value: SetupInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    const found = validateSetup(form);
    setErrors(found);
    if (found.length > 0) return;
    setSaving(true);
    try {
      await createSchoolSetup(db, form);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "No se pudo guardar la configuración."]);
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">Configuración inicial</h1>
      <p className="mb-6 mt-1 text-sm text-stone-600">Se llena una sola vez. Todo se puede cambiar después en Configuración. Los datos se guardan en este dispositivo.</p>

      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">1. La escuela</h2>
          <Field label="Nombre de la escuela" value={form.schoolName} onChange={(e) => set("schoolName", e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CCT (opcional)" value={form.cct} onChange={(e) => set("cct", e.target.value)} />
            <Field label="Nivel educativo (opcional)" value={form.educationLevel} onChange={(e) => set("educationLevel", e.target.value)} />
            <Field label="Zona escolar (opcional)" value={form.schoolZone} onChange={(e) => set("schoolZone", e.target.value)} />
            <Field label="Dirección (opcional)" value={form.address} onChange={(e) => set("address", e.target.value)} />
            <Field label="Director(a) (opcional)" value={form.directorName} onChange={(e) => set("directorName", e.target.value)} />
            <Field label="Subdirector(a) (opcional)" value={form.subdirectorName} onChange={(e) => set("subdirectorName", e.target.value)} />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">2. Ciclo escolar y reglas</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Ciclo escolar" placeholder="2026-2027" value={form.yearName} onChange={(e) => set("yearName", e.target.value)} />
            <Field label="Inicio del ciclo" type="date" value={form.yearStart} onChange={(e) => set("yearStart", e.target.value)} />
            <Field label="Fin del ciclo" type="date" value={form.yearEnd} onChange={(e) => set("yearEnd", e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Zona horaria" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
            <Field
              label="Tolerancia de entrada (minutos)"
              type="number"
              min={0}
              value={form.toleranceMinutes}
              onChange={(e) => set("toleranceMinutes", e.target.value === "" ? NaN : Number(e.target.value))}
              hint="0 = sin tolerancia."
            />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">3. Turno y periodos</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Tipo de turno"
              value={form.shiftKind}
              onChange={(e) => {
                const kind = e.target.value as ShiftKind;
                setForm((f) => ({ ...f, shiftKind: kind, shiftName: SHIFT_NAMES[kind] }));
              }}
            >
              <option value="matutino">Matutino</option>
              <option value="vespertino">Vespertino</option>
              <option value="ampliada">Jornada ampliada</option>
              <option value="personalizado">Personalizado</option>
            </SelectField>
            <Field label="Nombre del turno" value={form.shiftName} onChange={(e) => set("shiftName", e.target.value)} />
          </div>
          <p className="text-sm text-stone-600">Agrega los periodos de tu escuela (clases, receso, etc.) con su hora de inicio y término. Puedes tener los que necesites.</p>
          <PeriodsEditor periods={form.periods} onChange={(p) => set("periods", p)} />
        </section>

        <ErrorBox messages={errors} />
        <Button onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Guardar y comenzar"}</Button>
        <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-700">
          <p className="mb-2">¿Solo quieres probar la aplicación? Abre el modo demostración con datos ficticios; tus datos reales no se mezclan.</p>
          <Button variant="secondary" onClick={() => enterDemo()}>Probar con datos de demostración</Button>
        </div>
      </div>
    </main>
  );
}
