import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { saveGroup, saveSubject } from "@/data/catalogs";
import { Badge, Button, ErrorBox, Field } from "@/ui/ui";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function useAction() {
  const [errors, setErrors] = useState<string[]>([]);
  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    try {
      await fn();
      setErrors([]);
      return true;
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "No se pudo guardar."]);
      return false;
    }
  };
  return { errors, run };
}

export function GroupsPage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Grupos y materias</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <GroupsCard />
        <SubjectsCard />
      </div>
    </section>
  );
}

function GroupsCard() {
  const groups = useLiveQuery(() => db.groups.orderBy("name").toArray(), [], []);
  const shifts = useLiveQuery(() => db.shifts.toArray(), [], []);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const { errors, run } = useAction();
  return (
    <Card title="Grupos">
      {groups.length === 0 ? <p className="text-sm text-stone-600">Aún no hay grupos. Agrega el primero abajo (puedes nombrarlos 1A, 2B, 101… como usen en tu escuela).</p> : null}
      <ul className="flex flex-col gap-2">
        {groups.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 p-2">
            <span className="text-sm">
              <span className="font-semibold">{g.name}</span>{g.grade ? ` · grado ${g.grade}` : ""} {!g.isActive ? <Badge tone="off">– Inactivo</Badge> : null}
            </span>
            <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => run(() => saveGroup(db, { ...g, isActive: !g.isActive }))}>{g.isActive ? "Desactivar" : "Activar"}</Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 rounded-lg bg-stone-50 p-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre del grupo" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Grado (opcional)" value={grade} onChange={(e) => setGrade(e.target.value)} />
        </div>
        <ErrorBox messages={errors} />
        <Button className="self-start" onClick={async () => { if (await run(() => saveGroup(db, { name, grade, shiftId: shifts[0]?.id ?? "", isActive: true }))) { setName(""); setGrade(""); } }}>+ Agregar grupo</Button>
      </div>
    </Card>
  );
}

function SubjectsCard() {
  const subjects = useLiveQuery(() => db.subjects.orderBy("name").toArray(), [], []);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const { errors, run } = useAction();
  return (
    <Card title="Materias">
      {subjects.length === 0 ? <p className="text-sm text-stone-600">Aún no hay materias. Agrega la primera abajo.</p> : null}
      <ul className="flex flex-col gap-2">
        {subjects.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 p-2">
            <span className="text-sm">
              <span className="font-semibold">{s.name}</span>{s.shortName ? ` (${s.shortName})` : ""} {!s.isActive ? <Badge tone="off">– Inactiva</Badge> : null}
            </span>
            <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => run(() => saveSubject(db, { ...s, isActive: !s.isActive }))}>{s.isActive ? "Desactivar" : "Activar"}</Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 rounded-lg bg-stone-50 p-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre de la materia" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Nombre corto (opcional)" value={shortName} onChange={(e) => setShortName(e.target.value)} />
        </div>
        <ErrorBox messages={errors} />
        <Button className="self-start" onClick={async () => { if (await run(() => saveSubject(db, { name, shortName, isActive: true }))) { setName(""); setShortName(""); } }}>+ Agregar materia</Button>
      </div>
    </Card>
  );
}
