import { WEEKDAYS } from "@/domain/time";
import { copyDayToAll, type WorkDayInput } from "@/domain/workSchedule";

export function WorkWeekEditor({ week, onChange }: { week: WorkDayInput[]; onChange: (next: WorkDayInput[]) => void }) {
  const update = (weekday: number, patch: Partial<WorkDayInput>) => onChange(week.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  const control = "min-w-0 rounded-lg border border-stone-300 bg-white px-1.5 py-2 text-base disabled:bg-stone-100";
  return (
    <div className="flex flex-col gap-2">
      {WEEKDAYS.map(({ n, label }) => {
        const day = week.find((d) => d.weekday === n)!;
        return (
          <div key={n} className="grid grid-cols-[4.75rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-lg border border-stone-200 bg-white p-2">
            <span className="text-sm font-medium">{label}</span>
            <input aria-label={`${label}: entrada`} type="time" disabled={!day.works} value={day.startsAt} onChange={(e) => update(n, { startsAt: e.target.value })} className={control} />
            <input aria-label={`${label}: salida`} type="time" disabled={!day.works} value={day.endsAt} onChange={(e) => update(n, { endsAt: e.target.value })} className={control} />
            <label className="col-span-3 flex items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" className="h-4 w-4 accent-emerald-700" checked={!day.works} onChange={(e) => update(n, { works: !e.target.checked })} />
              No labora este día
              <button type="button" className="ml-auto whitespace-nowrap text-emerald-800 underline" onClick={() => onChange(copyDayToAll(week, n))}>
                Copiar a todos los días
              </button>
            </label>
          </div>
        );
      })}
      <p className="text-xs text-stone-500">
        Escribe el horario de un día y usa «Copiar a todos los días» para ahorrar captura.
      </p>
    </div>
  );
}
