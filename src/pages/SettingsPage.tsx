import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { saveSettings, savePeriods } from "@/data/settings";
import { saveCategory } from "@/data/categories";
import { saveActivityType } from "@/data/catalogs";
import { exportBackup, parseBackup, restoreBackup } from "@/data/backup";
import type { SchoolSettings } from "@/data/types";
import type { PeriodInput } from "@/domain/periods";
import { downloadText } from "@/ui/download";
import { PeriodsEditor } from "@/ui/PeriodsEditor";
import { Badge, Button, CheckField, ErrorBox, Field } from "@/ui/ui";

export function SettingsPage() {
  return (
    <section className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Configuración</h1>
      <SchoolSection />
      <PeriodsSection />
      <CategoriesSection />
      <ActivityTypesSection />
      <BackupSection />
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function useSaved() {
  const [state, setState] = useState<{ errors: string[]; ok: boolean }>({ errors: [], ok: false });
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      setState({ errors: [], ok: true });
    } catch (e) {
      setState({ errors: [e instanceof Error ? e.message : "No se pudo guardar."], ok: false });
    }
  };
  return { ...state, run };
}

function Saved({ ok }: { ok: boolean }) {
  return ok ? <p role="status" className="text-sm text-emerald-800">✓ Cambios guardados.</p> : null;
}

function SchoolSection() {
  const settings = useLiveQuery(() => db.settings.get("main"));
  if (!settings) return null;
  return <SchoolForm key={JSON.stringify(settings)} initial={settings} />;
}

function SchoolForm({ initial }: { initial: SchoolSettings }) {
  const [form, setForm] = useState(initial);
  const { errors, ok, run } = useSaved();
  const set = <K extends keyof SchoolSettings>(k: K, v: SchoolSettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Card title="Escuela y reglas">
      <Field label="Nombre de la escuela" value={form.schoolName} onChange={(e) => set("schoolName", e.target.value)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="CCT" value={form.cct} onChange={(e) => set("cct", e.target.value)} />
        <Field label="Nivel educativo" value={form.educationLevel} onChange={(e) => set("educationLevel", e.target.value)} />
        <Field label="Zona escolar" value={form.schoolZone} onChange={(e) => set("schoolZone", e.target.value)} />
        <Field label="Dirección" value={form.address} onChange={(e) => set("address", e.target.value)} />
        <Field label="Director(a)" value={form.directorName} onChange={(e) => set("directorName", e.target.value)} />
        <Field label="Subdirector(a)" value={form.subdirectorName} onChange={(e) => set("subdirectorName", e.target.value)} />
        <Field label="Zona horaria" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
        <Field label="Tolerancia de entrada (minutos)" type="number" min={0} value={form.toleranceMinutes} onChange={(e) => set("toleranceMinutes", e.target.value === "" ? NaN : Number(e.target.value))} hint="0 = sin tolerancia." />
      </div>
      <ErrorBox messages={errors} />
      <Saved ok={ok} />
      <Button className="self-start" onClick={() => run(() => saveSettings(db, form))}>Guardar</Button>
    </Card>
  );
}

function PeriodsSection() {
  const shifts = useLiveQuery(() => db.shifts.toArray());
  const periods = useLiveQuery(async () => (await db.periods.toArray()).sort((a, b) => a.position - b.position));
  if (!shifts || !periods || shifts.length === 0) return null;
  const shift = shifts[0];
  const rows = periods.filter((p) => p.shiftId === shift.id).map((p) => ({ id: p.id, name: p.name, startsAt: p.startsAt, endsAt: p.endsAt, kind: p.kind }));
  return <PeriodsForm key={JSON.stringify(rows)} shiftId={shift.id} shiftName={shift.name} initial={rows} />;
}

function PeriodsForm({ shiftId, shiftName, initial }: { shiftId: string; shiftName: string; initial: PeriodInput[] }) {
  const [rows, setRows] = useState(initial);
  const { errors, ok, run } = useSaved();
  return (
    <Card title={`Periodos del turno «${shiftName}»`}>
      <PeriodsEditor periods={rows} onChange={setRows} />
      <ErrorBox messages={errors} />
      <Saved ok={ok} />
      <Button className="self-start" onClick={() => run(() => savePeriods(db, shiftId, rows))}>Guardar periodos</Button>
    </Card>
  );
}

function CategoriesSection() {
  const categories = useLiveQuery(() => db.categories.orderBy("name").toArray(), [], []);
  const [name, setName] = useState("");
  const [isTeaching, setIsTeaching] = useState(false);
  const { errors, run } = useSaved();
  return (
    <Card title="Categorías de personal">
      <ul className="flex flex-col gap-2">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 p-2">
            <span className="text-sm">
              {c.name} {c.isTeaching ? <Badge tone="info">Con grupos</Badge> : null} {!c.isActive ? <Badge tone="off">– Desactivada</Badge> : null}
            </span>
            <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => run(() => saveCategory(db, { ...c, isActive: !c.isActive }))}>
              {c.isActive ? "Desactivar" : "Activar"}
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 rounded-lg bg-stone-50 p-3">
        <Field label="Nueva categoría" value={name} onChange={(e) => setName(e.target.value)} />
        <CheckField label="Suele atender grupos" checked={isTeaching} onChange={(e) => setIsTeaching(e.target.checked)} />
        <ErrorBox messages={errors} />
        <Button
          className="self-start"
          onClick={() => run(async () => {
            await saveCategory(db, { name, isTeaching, isActive: true });
            setName("");
            setIsTeaching(false);
          })}
        >
          + Agregar categoría
        </Button>
      </div>
      <p className="text-xs text-stone-500">Las categorías no se borran: se desactivan, para conservar el historial.</p>
    </Card>
  );
}

function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const { errors, ok, run } = useSaved();
  const download = () =>
    run(async () => {
      const data = await exportBackup(db);
      downloadText(`respaldo-personal-escolar-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
    });
  const restore = (file: File) =>
    run(async () => {
      const backup = parseBackup(await file.text());
      if (!window.confirm("Esto REEMPLAZA todos los datos actuales por los del respaldo. ¿Continuar?")) return;
      await restoreBackup(db, backup);
    });
  return (
    <Card title="Respaldo de datos">
      <p className="text-sm text-stone-600">Tus datos viven solo en este dispositivo. Descarga un respaldo con frecuencia y guárdalo en tu nube o correo; también sirve para pasar la información a otro aparato.</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={download}>Descargar respaldo</Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>Restaurar desde archivo…</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = ""; }} />
      </div>
      <ErrorBox messages={errors} />
      <Saved ok={ok} />
    </Card>
  );
}

function ActivityTypesSection() {
  const types = useLiveQuery(() => db.activityTypes.orderBy("name").toArray(), [], []);
  const [name, setName] = useState("");
  const [isClass, setIsClass] = useState(false);
  const { errors, run } = useSaved();
  return (
    <Card title="Tipos de actividad del horario">
      <ul className="flex flex-col gap-2">
        {types.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 p-2">
            <span className="text-sm">
              {t.name} {t.isClass ? <Badge tone="info">Exige grupo y materia</Badge> : null} {!t.isActive ? <Badge tone="off">– Desactivado</Badge> : null}
            </span>
            <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => run(() => saveActivityType(db, { ...t, isActive: !t.isActive }))}>
              {t.isActive ? "Desactivar" : "Activar"}
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 rounded-lg bg-stone-50 p-3">
        <Field label="Nuevo tipo de actividad" value={name} onChange={(e) => setName(e.target.value)} />
        <CheckField label="Es una clase (exige grupo y materia)" checked={isClass} onChange={(e) => setIsClass(e.target.checked)} />
        <ErrorBox messages={errors} />
        <Button className="self-start" onClick={() => run(async () => { await saveActivityType(db, { name, isClass, isActive: true }); setName(""); setIsClass(false); })}>+ Agregar tipo</Button>
      </div>
    </Card>
  );
}
