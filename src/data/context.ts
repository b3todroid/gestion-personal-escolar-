import type { AppDb } from "./db";
import type { Assignment, SchoolSettings, SchoolYear, Staff, WorkDay } from "./types";
import { todayIn } from "@/domain/dates";

export async function getSettings(database: AppDb): Promise<SchoolSettings> {
  const s = await database.settings.get("main");
  if (!s) throw new Error("Falta configurar la escuela.");
  return s;
}

export async function today(database: AppDb): Promise<string> {
  return todayIn((await getSettings(database)).timezone);
}

/** Ciclo al que pertenece una fecha; si ninguno la contiene, el vigente. */
export async function yearForDate(database: AppDb, date: string): Promise<SchoolYear | undefined> {
  const years = await database.schoolYears.toArray();
  return years.find((y) => y.startsOn <= date && date <= y.endsOn) ?? years.find((y) => y.isCurrent) ?? years[0];
}

export async function holidaySet(database: AppDb): Promise<Set<string>> {
  return new Set((await database.holidays.toArray()).map((h) => h.date));
}

/** Días de la semana en que la persona trabaja (para expandir incidencias de varios días). */
export function workingWeekdays(person: Pick<Staff, "isTeaching" | "entryRule">, workDays: readonly WorkDay[], assignments: readonly Assignment[]): Set<number> {
  if (person.isTeaching && person.entryRule === "first_activity") {
    const days = new Set(assignments.map((a) => a.weekday));
    return days.size > 0 ? days : new Set([1, 2, 3, 4, 5]);
  }
  if (workDays.length === 0) return new Set([1, 2, 3, 4, 5]);
  return new Set(workDays.filter((d) => d.works).map((d) => d.weekday));
}

export async function assignmentsOfStaff(database: AppDb, yearId: string, staffId: string): Promise<Assignment[]> {
  return database.assignments.where("[schoolYearId+staffId]").equals([yearId, staffId]).toArray();
}

import { workingDays } from "@/domain/incidents";

/** Días laborales de una incidencia para una persona (recortados a `clip` si se indica). */
export function incidentDays(
  incident: { startDate: string; endDate: string },
  person: Pick<Staff, "isTeaching" | "entryRule">,
  workDays: readonly WorkDay[],
  assignments: readonly Assignment[],
  holidays: ReadonlySet<string>,
  clip?: { from: string; to: string },
): string[] {
  const weekdays = workingWeekdays(person, workDays, assignments);
  return workingDays({ startDate: incident.startDate, endDate: incident.endDate, worksOnWeekday: (w) => weekdays.has(w), holidays, clip });
}
