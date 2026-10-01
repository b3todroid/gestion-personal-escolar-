import { isValidTime, toMinutes } from "./time";

export interface Lateness {
  status: "on_time" | "late";
  /** Minutos contados desde la hora esperada (nunca negativos). */
  lateMinutes: number;
}

/**
 * Calcula el retardo.
 * - Llegar hasta la hora esperada + tolerancia es «a tiempo» (0 minutos).
 * - Al excederla es retardo, y los minutos se cuentan desde la hora esperada
 *   (07:30 esperada, 07:47 real, tolerancia 0 → 17 min).
 */
export function computeLateness(expected: string, arrived: string, toleranceMinutes: number): Lateness {
  if (!isValidTime(expected) || !isValidTime(arrived)) throw new Error("Las horas deben tener formato HH:MM.");
  if (!Number.isFinite(toleranceMinutes) || toleranceMinutes < 0) throw new Error("La tolerancia no puede ser negativa.");
  const diff = toMinutes(arrived) - toMinutes(expected);
  if (diff <= toleranceMinutes) return { status: "on_time", lateMinutes: 0 };
  return { status: "late", lateMinutes: diff };
}

export interface DayWork {
  weekday: number;
  works: boolean;
  startsAt: string;
}

export interface ExpectedEntry {
  time: string | null;
  source: "fixed" | "first_activity" | "no_work" | "no_schedule";
}

/**
 * Hora de entrada esperada de una persona en un día.
 * - Docente con «primera actividad»: el inicio de su primer periodo con actividad ese día.
 * - El resto: el horario laboral del día; «No labora» → sin hora.
 */
export function expectedEntry(input: {
  weekday: number;
  isTeaching: boolean;
  entryRule: "fixed" | "first_activity";
  workDays: readonly DayWork[];
  /** Horas de inicio de los periodos que el docente tiene ocupados ese día. */
  activityStarts: readonly string[];
}): ExpectedEntry {
  if (input.isTeaching && input.entryRule === "first_activity") {
    const first = [...input.activityStarts].filter(isValidTime).sort()[0];
    return first ? { time: first, source: "first_activity" } : { time: null, source: "no_work" };
  }
  const day = input.workDays.find((d) => d.weekday === input.weekday);
  if (!day) return { time: null, source: "no_schedule" };
  if (!day.works || !isValidTime(day.startsAt)) return { time: null, source: "no_work" };
  return { time: day.startsAt, source: "fixed" };
}
