import { eachDate, weekdayOf } from "./dates";
import { isValidTime, toMinutes } from "./time";

export type Scope = "full_day" | "periods" | "time_range";

export interface PeriodLite {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  kind: "class" | "break" | "activity" | "other";
}

export interface IncidentLike {
  startDate: string;
  endDate: string;
  scope: Scope;
  periodIds: readonly string[];
  startTime: string;
  endTime: string;
}

export function validateIncident(i: IncidentLike, periods: readonly PeriodLite[]): string[] {
  const errors: string[] = [];
  if (i.startDate > i.endDate) errors.push("La fecha final no puede ser anterior a la fecha inicial.");
  if (i.scope === "periods") {
    if (i.periodIds.length === 0) errors.push("Elige al menos un periodo.");
    if (i.periodIds.some((id) => !periods.some((p) => p.id === id))) errors.push("Alguno de los periodos elegidos ya no existe.");
  }
  if (i.scope === "time_range") {
    if (!isValidTime(i.startTime) || !isValidTime(i.endTime)) errors.push("Escribe la hora inicial y la hora final (por ejemplo 09:10).");
    else if (toMinutes(i.endTime) <= toMinutes(i.startTime)) errors.push("La hora final debe ser posterior a la hora inicial.");
  }
  return errors;
}

/**
 * Días laborales de una incidencia de varios días, recortados a un rango opcional.
 * Un día cuenta si la persona labora ese día de la semana y no es un día no laborable.
 */
export function workingDays(input: {
  startDate: string;
  endDate: string;
  worksOnWeekday: (weekday: number) => boolean;
  holidays: ReadonlySet<string>;
  clip?: { from: string; to: string };
}): string[] {
  const from = input.clip && input.clip.from > input.startDate ? input.clip.from : input.startDate;
  const to = input.clip && input.clip.to < input.endDate ? input.clip.to : input.endDate;
  return eachDate(from, to).filter((d) => !input.holidays.has(d) && input.worksOnWeekday(weekdayOf(d)));
}

export interface Span {
  start: number;
  end: number;
}

/** Tramos (en minutos) que cubre la incidencia cada día. Día completo = todo el día. */
export function incidentSpans(i: Pick<IncidentLike, "scope" | "periodIds" | "startTime" | "endTime">, periods: readonly PeriodLite[]): Span[] {
  if (i.scope === "full_day") return [{ start: 0, end: 24 * 60 }];
  if (i.scope === "time_range") return [{ start: toMinutes(i.startTime), end: toMinutes(i.endTime) }];
  return periods.filter((p) => i.periodIds.includes(p.id)).map((p) => ({ start: toMinutes(p.startsAt), end: toMinutes(p.endsAt) }));
}

const spansOverlap = (a: Span[], b: Span[]) => a.some((x) => b.some((y) => x.start < y.end && y.start < x.end));

/** ¿Dos incidencias de la misma persona se empalman en algún día y horario? */
export function incidentsOverlap(a: IncidentLike, b: IncidentLike, periods: readonly PeriodLite[]): boolean {
  if (a.startDate > b.endDate || b.startDate > a.endDate) return false;
  return spansOverlap(incidentSpans(a, periods), incidentSpans(b, periods));
}

export interface AssignmentLite {
  id: string;
  weekday: number;
  periodId: string;
  groupId: string;
  subjectId: string;
  activityTypeId: string;
}

export interface AffectedSlot {
  date: string;
  periodId: string;
  assignmentId: string;
  groupId: string;
  subjectId: string;
  activityTypeId: string;
}

/**
 * Cruza la incidencia con el horario del docente: devuelve cada (fecha, periodo) con actividad que quedó afectada.
 * Un traslape parcial también cuenta (decisión D-4). Los recesos nunca cuentan.
 */
export function findAffectedSlots(input: {
  incident: IncidentLike;
  days: readonly string[];
  assignments: readonly AssignmentLite[];
  periods: readonly PeriodLite[];
}): AffectedSlot[] {
  const spans = incidentSpans(input.incident, input.periods);
  const out: AffectedSlot[] = [];
  for (const date of input.days) {
    const wd = weekdayOf(date);
    for (const a of input.assignments) {
      if (a.weekday !== wd) continue;
      const p = input.periods.find((x) => x.id === a.periodId);
      if (!p || p.kind === "break") continue;
      const ps = { start: toMinutes(p.startsAt), end: toMinutes(p.endsAt) };
      if (spans.some((s) => ps.start < s.end && s.start < ps.end)) {
        out.push({ date, periodId: a.periodId, assignmentId: a.id, groupId: a.groupId, subjectId: a.subjectId, activityTypeId: a.activityTypeId });
      }
    }
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || (periods(input.periods, x.periodId) - periods(input.periods, y.periodId)));
}

function periods(list: readonly PeriodLite[], id: string): number {
  const p = list.find((x) => x.id === id);
  return p ? toMinutes(p.startsAt) : 0;
}
