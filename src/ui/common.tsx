import { useState } from "react";
import { STATUS_INFO, type DayStatus } from "@/domain/dayStatus";
import { presetRange, type RangePreset } from "@/domain/dates";
import { Field } from "./ui";

const TONES = { ok: "bg-emerald-100 text-emerald-900", warn: "bg-amber-100 text-amber-900", bad: "bg-red-100 text-red-800", info: "bg-sky-100 text-sky-900", off: "bg-stone-200 text-stone-700" };

/** Estado con icono y texto (nunca solo color). */
export function StatusPill({ status }: { status: DayStatus }) {
  const i = STATUS_INFO[status];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[i.tone]}`}><span aria-hidden="true">{i.icon}</span>{i.label}</span>;
}

export function Tile({ label, value, tone = "off", onClick }: { label: string; value: number | string; tone?: keyof typeof TONES; onClick?: () => void }) {
  const cls = `rounded-lg border border-stone-200 p-3 text-left ${TONES[tone]} ${onClick ? "hover:brightness-95" : ""}`;
  const inner = <><span className="block text-2xl font-bold">{value}</span><span className="block text-xs font-medium">{label}</span></>;
  return onClick ? <button type="button" className={cls} onClick={onClick}>{inner}</button> : <div className={cls}>{inner}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-center text-stone-600">{children}</p>;
}

/** Rango de fechas con atajos Hoy / Semana / Mes / Ciclo / Personalizado. */
export function RangePicker({ from, to, today, year, onChange }: { from: string; to: string; today: string; year?: { startsOn: string; endsOn: string }; onChange: (from: string, to: string) => void }) {
  const [preset, setPreset] = useState<RangePreset>("mes");
  const pick = (p: RangePreset) => {
    setPreset(p);
    if (p !== "personalizado") { const r = presetRange(p, today, year); onChange(r.from, r.to); }
  };
  const labels: [RangePreset, string][] = [["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"], ["ciclo", "Ciclo"], ["personalizado", "Personalizado"]];
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Periodo" className="flex flex-wrap gap-1.5">
        {labels.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={preset === k} onClick={() => pick(k)} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${preset === k ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-300 bg-white text-stone-700"}`}>{l}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde" type="date" value={from} onChange={(e) => { setPreset("personalizado"); onChange(e.target.value, to); }} />
        <Field label="Hasta" type="date" value={to} onChange={(e) => { setPreset("personalizado"); onChange(from, e.target.value); }} />
      </div>
    </div>
  );
}
