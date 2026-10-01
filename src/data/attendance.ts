import type { AppDb } from "./db";
import type { AttendanceEntry } from "./types";
import { logAudit } from "./audit";
import { getSettings, holidaySet, yearForDate, assignmentsOfStaff } from "./context";
import { computeLateness, expectedEntry, type ExpectedEntry } from "@/domain/attendance";
import { isValidIsoDate, weekdayOf, formatDate } from "@/domain/dates";
import { isValidTime } from "@/domain/time";

/** Hora esperada de una persona en una fecha, según su horario laboral o su primera actividad. */
export async function expectedFor(database: AppDb, staffId: string, date: string): Promise<ExpectedEntry> {
  const person = await database.staff.get(staffId);
  if (!person) throw new Error("La persona ya no existe.");
  const weekday = weekdayOf(date);
  const workDays = await database.workDays.where("staffId").equals(staffId).toArray();
  let activityStarts: string[] = [];
  if (person.isTeaching && person.entryRule === "first_activity") {
    const year = await yearForDate(database, date);
    const cells = year ? (await assignmentsOfStaff(database, year.id, staffId)).filter((a) => a.weekday === weekday) : [];
    const periods = await database.periods.bulkGet(cells.map((c) => c.periodId));
    activityStarts = periods.filter((p): p is NonNullable<typeof p> => !!p).map((p) => p.startsAt);
  }
  return expectedEntry({ weekday, isTeaching: person.isTeaching, entryRule: person.entryRule, workDays, activityStarts });
}

export const entryId = (staffId: string, date: string) => `${staffId}:${date}`;

async function assertCanRecord(database: AppDb, staffId: string, date: string) {
  if (!isValidIsoDate(date)) throw new Error("La fecha no es válida.");
  const person = await database.staff.get(staffId);
  if (!person) throw new Error("La persona ya no existe.");
  if (!person.isActive) throw new Error(`${person.fullName} está inactivo/a.`);
  if ((await holidaySet(database)).has(date)) throw new Error(`El ${formatDate(date)} está marcado como día no laborable.`);
  const fullDay = await database.incidents.where("staffId").equals(staffId).filter((i) => i.status === "active" && i.scope === "full_day" && i.startDate <= date && date <= i.endDate).toArray();
  if (fullDay.length > 0) {
    const t = await database.incidentTypes.get(fullDay[0].typeId);
    throw new Error(`${person.fullName} tiene registrada la incidencia «${t?.name ?? "incidencia"}» de día completo el ${formatDate(date)}; no se puede registrar entrada.`);
  }
  return person;
}

/** Registra la llegada y calcula automáticamente a tiempo / retardo / minutos. */
export async function registerEntry(database: AppDb, input: { staffId: string; date: string; arrivedTime: string; note?: string }): Promise<AttendanceEntry> {
  if (!isValidTime(input.arrivedTime)) throw new Error("Escribe la hora de llegada (por ejemplo 07:43).");
  const settings = await getSettings(database);
  const person = await assertCanRecord(database, input.staffId, input.date);
  const expected = await expectedFor(database, input.staffId, input.date);
  if (!expected.time) {
    throw new Error(expected.source === "no_work" ? `${person.fullName} no labora el ${formatDate(input.date)} según su horario.` : `${person.fullName} no tiene horario laboral para ese día. Captúralo en Personal.`);
  }
  const { status, lateMinutes } = computeLateness(expected.time, input.arrivedTime, settings.toleranceMinutes);
  const now = new Date().toISOString();
  const id = entryId(input.staffId, input.date);

  return database.transaction("rw", [database.attendance, database.audit], async () => {
    const existing = await database.attendance.get(id);
    if (existing && !existing.voidedAt) throw new Error(`${person.fullName} ya tiene entrada registrada ese día (${existing.arrivedTime}). Usa «Corregir» si hay un error.`);
    const record: AttendanceEntry = { id, staffId: input.staffId, date: input.date, expectedTime: expected.time!, arrivedTime: input.arrivedTime, toleranceApplied: settings.toleranceMinutes, status, lateMinutes, note: (input.note ?? "").trim(), voidedAt: "", createdAt: existing?.createdAt ?? now, updatedAt: now };
    await database.attendance.put(record);
    await logAudit(database, { table: "attendance", recordId: id, action: "create", summary: `Entrada de ${person.fullName} (${formatDate(input.date)}): ${input.arrivedTime} — ${status === "late" ? `retardo de ${lateMinutes} min` : "a tiempo"}`, before: existing ?? null, after: record });
    return record;
  });
}

/** Corrige una entrada ya registrada. Exige motivo (queda en la auditoría). */
export async function correctEntry(database: AppDb, input: { staffId: string; date: string; arrivedTime: string; expectedTime?: string; reason: string }): Promise<AttendanceEntry> {
  if (!input.reason.trim()) throw new Error("Escribe el motivo de la corrección.");
  if (!isValidTime(input.arrivedTime)) throw new Error("Escribe la hora de llegada (por ejemplo 07:43).");
  if (input.expectedTime !== undefined && !isValidTime(input.expectedTime)) throw new Error("La hora esperada no es válida.");
  const id = entryId(input.staffId, input.date);
  return database.transaction("rw", [database.attendance, database.staff, database.audit], async () => {
    const existing = await database.attendance.get(id);
    if (!existing || existing.voidedAt) throw new Error("No hay una entrada registrada para corregir.");
    const person = await database.staff.get(input.staffId);
    const expected = input.expectedTime ?? existing.expectedTime;
    const { status, lateMinutes } = computeLateness(expected, input.arrivedTime, existing.toleranceApplied);
    const record: AttendanceEntry = { ...existing, expectedTime: expected, arrivedTime: input.arrivedTime, status, lateMinutes, updatedAt: new Date().toISOString() };
    await database.attendance.put(record);
    await logAudit(database, { table: "attendance", recordId: id, action: "update", summary: `Corrección de entrada de ${person?.fullName ?? "?"} (${formatDate(input.date)}): ${existing.arrivedTime} → ${input.arrivedTime}`, before: existing, after: record, reason: input.reason.trim() });
    return record;
  });
}

/** Anula una entrada (borrado lógico) con motivo. */
export async function voidEntry(database: AppDb, staffId: string, date: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error("Escribe el motivo para anular la entrada.");
  const id = entryId(staffId, date);
  await database.transaction("rw", [database.attendance, database.staff, database.audit], async () => {
    const existing = await database.attendance.get(id);
    if (!existing || existing.voidedAt) throw new Error("No hay una entrada vigente que anular.");
    const person = await database.staff.get(staffId);
    const record = { ...existing, voidedAt: new Date().toISOString() };
    await database.attendance.put(record);
    await logAudit(database, { table: "attendance", recordId: id, action: "deactivate", summary: `Se anuló la entrada de ${person?.fullName ?? "?"} (${formatDate(date)})`, before: existing, after: record, reason: reason.trim() });
  });
}
