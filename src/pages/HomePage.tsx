import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";

export function HomePage() {
  const settings = useLiveQuery(() => db.settings.get("main"));
  const staffCount = useLiveQuery(() => db.staff.filter((s) => s.isActive).count(), [], 0);
  const [now] = useState(() => new Date());
  const today = new Intl.DateTimeFormat("es-MX", { dateStyle: "full", timeZone: settings?.timezone }).format(now);
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Inicio</h1>
        <p className="text-stone-600 first-letter:uppercase">{today}</p>
      </div>
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <p className="text-sm text-stone-500">Personal activo registrado</p>
        <p className="text-3xl font-bold">{staffCount}</p>
      </div>
      <p className="rounded-lg border border-stone-200 bg-white p-4 text-stone-700">
        La pantalla «Hoy» (entradas, retardos, incidencias y coberturas) se activará en las siguientes fases. Por ahora puedes registrar a tu personal y sus horarios laborales.
      </p>
    </section>
  );
}
