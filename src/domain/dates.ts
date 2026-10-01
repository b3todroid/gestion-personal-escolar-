/** Fechas como texto ISO «AAAA-MM-DD». Se calcula en UTC para no depender de la zona horaria del aparato. */

export function isValidIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toUtc(v: string): Date {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 1 = lunes … 7 = domingo. */
export function weekdayOf(iso: string): number {
  const w = toUtc(iso).getUTCDay();
  return w === 0 ? 7 : w;
}

export function addDays(iso: string, n: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

/** Todas las fechas de `from` a `to`, ambas incluidas. Vacío si el rango es inválido. */
export function eachDate(from: string, to: string): string[] {
  if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) return [];
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Fecha de hoy en la zona horaria de la escuela. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // en-CA => AAAA-MM-DD
}

/** Hora actual «HH:MM» (24 h) en la zona horaria de la escuela. */
export function nowTimeIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

/** «dd/mm/aaaa» */
export function formatDate(iso: string): string {
  if (!isValidIsoDate(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DAYS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** «martes 29 de septiembre de 2026» */
export function formatLongDate(iso: string): string {
  if (!isValidIsoDate(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  return `${DAYS[weekdayOf(iso)]} ${d} de ${MONTHS[m - 1]} de ${y}`;
}

export type RangePreset = "hoy" | "semana" | "mes" | "ciclo" | "personalizado";

export interface DateRange {
  from: string;
  to: string;
}

/**
 * Todos los accesos rápidos se convierten a fechaDesde / fechaHasta.
 * Semana = lunes a domingo de la semana de `today`. Ciclo = fechas del ciclo escolar vigente.
 */
export function presetRange(preset: Exclude<RangePreset, "personalizado">, today: string, schoolYear?: { startsOn: string; endsOn: string }): DateRange {
  if (preset === "hoy") return { from: today, to: today };
  if (preset === "semana") {
    const monday = addDays(today, -(weekdayOf(today) - 1));
    return { from: monday, to: addDays(monday, 6) };
  }
  if (preset === "mes") {
    const [y, m] = today.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, "0");
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
  }
  if (!schoolYear) return { from: today, to: today };
  return { from: schoolYear.startsOn, to: schoolYear.endsOn };
}

export function validateRange(from: string, to: string): string | null {
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) return "Escribe la fecha inicial y la fecha final.";
  if (from > to) return "La fecha final no puede ser anterior a la fecha inicial.";
  return null;
}
