import { isValidTime, toMinutes, WEEKDAYS } from "./time";

export interface WorkDayInput {
  weekday: number;
  works: boolean;
  startsAt: string;
  endsAt: string;
}

/** Semana vacía: todos los días laborales con horas en blanco (no se asume ningún horario). */
export function emptyWeek(): WorkDayInput[] {
  return WEEKDAYS.map((d) => ({ weekday: d.n, works: true, startsAt: "", endsAt: "" }));
}

/** Copia el horario de un día al resto de los días que laboran. */
export function copyDayToAll(week: readonly WorkDayInput[], weekday: number): WorkDayInput[] {
  const source = week.find((d) => d.weekday === weekday);
  if (!source) return [...week];
  return week.map((d) => (d.weekday === weekday ? d : { ...d, works: source.works, startsAt: source.startsAt, endsAt: source.endsAt }));
}

export function validateWorkWeek(week: readonly WorkDayInput[]): string[] {
  const errors: string[] = [];
  for (const day of week) {
    if (!day.works) continue;
    const label = WEEKDAYS.find((d) => d.n === day.weekday)?.label ?? `Día ${day.weekday}`;
    if (!isValidTime(day.startsAt) || !isValidTime(day.endsAt)) {
      errors.push(`${label}: escribe hora de entrada y de salida, o marca «No labora».`);
    } else if (toMinutes(day.endsAt) <= toMinutes(day.startsAt)) {
      errors.push(`${label}: la salida debe ser posterior a la entrada.`);
    }
  }
  return errors;
}
