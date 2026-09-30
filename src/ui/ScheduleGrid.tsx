import type { ReactNode } from "react";
import type { Period } from "@/data/types";
import { WEEKDAYS } from "@/domain/time";

/** Cuadrícula días × periodos. Se desplaza en horizontal en celulares verticales y se ve completa en horizontal. */
export function ScheduleGrid({ periods, renderCell, onCellClick }: { periods: Period[]; renderCell: (weekday: number, period: Period) => ReactNode; onCellClick?: (weekday: number, period: Period) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead>
          <tr className="bg-stone-100 text-stone-700">
            <th scope="col" className="sticky left-0 z-10 w-24 bg-stone-100 px-2 py-2 text-left">Periodo</th>
            {WEEKDAYS.map((d) => (
              <th key={d.n} scope="col" className="px-2 py-2 text-left">{d.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p.id} className="border-t border-stone-100">
              <th scope="row" className="sticky left-0 z-10 bg-white px-2 py-2 text-left align-top">
                <span className="block font-semibold">{p.name}</span>
                <span className="block text-xs font-normal text-stone-500">{p.startsAt}–{p.endsAt}</span>
              </th>
              {WEEKDAYS.map((d) =>
                p.kind === "break" ? (
                  <td key={d.n} className="bg-stone-100 px-2 py-2 text-center text-xs text-stone-500">Receso</td>
                ) : (
                  <td key={d.n} className="p-1 align-top">
                    {onCellClick ? (
                      <button type="button" aria-label={`${d.label}, ${p.name}`} onClick={() => onCellClick(d.n, p)} className="h-full min-h-14 w-full rounded-md border border-stone-200 p-1.5 text-left hover:bg-emerald-50">
                        {renderCell(d.n, p)}
                      </button>
                    ) : (
                      <div className="min-h-14 rounded-md border border-stone-100 p-1.5">{renderCell(d.n, p)}</div>
                    )}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
