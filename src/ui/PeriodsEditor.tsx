import { BLANK_PERIOD, PERIOD_KIND_LABELS, type PeriodInput, type PeriodKind } from "@/domain/periods";
import { Button } from "./ui";

/** Editor de la lista de periodos (asistente y configuración). Sin horarios predeterminados. */
export function PeriodsEditor({ periods, onChange }: { periods: PeriodInput[]; onChange: (next: PeriodInput[]) => void }) {
  const update = (i: number, patch: Partial<PeriodInput>) => onChange(periods.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= periods.length) return;
    const next = [...periods];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const control = "rounded-lg border border-stone-300 bg-white px-3 py-2 text-base";

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {periods.map((p, i) => (
          <li key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-stone-200 bg-white p-3 sm:grid-cols-[1fr_6.5rem_6.5rem_7rem]">
            <input aria-label={`Nombre del periodo ${i + 1}`} placeholder="Ej. 1ª" value={p.name} onChange={(e) => update(i, { name: e.target.value })} className={`${control} col-span-2 sm:col-span-1`} />
            <input aria-label={`Inicio del periodo ${i + 1}`} type="time" value={p.startsAt} onChange={(e) => update(i, { startsAt: e.target.value })} className={control} />
            <input aria-label={`Término del periodo ${i + 1}`} type="time" value={p.endsAt} onChange={(e) => update(i, { endsAt: e.target.value })} className={control} />
            <select aria-label={`Tipo del periodo ${i + 1}`} value={p.kind} onChange={(e) => update(i, { kind: e.target.value as PeriodKind })} className={control}>
              {Object.entries(PERIOD_KIND_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <div className="col-span-2 flex gap-2 sm:col-span-4">
              <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir periodo ${i + 1}`}>↑ Subir</Button>
              <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => move(i, 1)} disabled={i === periods.length - 1} aria-label={`Bajar periodo ${i + 1}`}>↓ Bajar</Button>
              <Button variant="danger" className="ml-auto px-3 py-1.5 text-sm" onClick={() => onChange(periods.filter((_, idx) => idx !== i))} disabled={periods.length === 1}>Quitar</Button>
            </div>
          </li>
        ))}
      </ul>
      <Button variant="secondary" className="self-start" onClick={() => onChange([...periods, { ...BLANK_PERIOD }])}>+ Agregar periodo</Button>
    </div>
  );
}
