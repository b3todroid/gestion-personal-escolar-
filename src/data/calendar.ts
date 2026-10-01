import type { AppDb } from "./db";
import type { Holiday, SchoolYear } from "./types";
import { logAudit } from "./audit";
import { formatDate, isValidIsoDate } from "@/domain/dates";

export async function saveHoliday(database: AppDb, input: { date: string; label: string }): Promise<void> {
  if (!isValidIsoDate(input.date)) throw new Error("Elige la fecha.");
  if (!input.label.trim()) throw new Error("Escribe el motivo (por ejemplo «Consejo técnico»).");
  await database.transaction("rw", [database.holidays, database.audit], async () => {
    if (await database.holidays.where("date").equals(input.date).first()) throw new Error(`El ${formatDate(input.date)} ya está marcado como no laborable.`);
    const rec: Holiday = { id: crypto.randomUUID(), date: input.date, label: input.label.trim() };
    await database.holidays.put(rec);
    await logAudit(database, { table: "holidays", recordId: rec.id, action: "create", summary: `Día no laborable: ${formatDate(rec.date)} (${rec.label})`, before: null, after: rec });
  });
}

export async function removeHoliday(database: AppDb, id: string): Promise<void> {
  await database.transaction("rw", [database.holidays, database.audit], async () => {
    const before = await database.holidays.get(id);
    if (!before) return;
    await database.holidays.delete(id);
    await logAudit(database, { table: "holidays", recordId: id, action: "deactivate", summary: `Ya no es día no laborable: ${formatDate(before.date)}`, before, after: null });
  });
}

/** Crea un ciclo escolar; opcionalmente copia los horarios del ciclo indicado. */
export async function createSchoolYear(database: AppDb, input: { name: string; startsOn: string; endsOn: string; makeCurrent: boolean; copyFromYearId?: string }): Promise<string> {
  if (!input.name.trim()) throw new Error("Escribe el nombre del ciclo (por ejemplo 2026-2027).");
  if (!isValidIsoDate(input.startsOn) || !isValidIsoDate(input.endsOn) || input.startsOn > input.endsOn) throw new Error("Las fechas del ciclo no son válidas.");
  const id = crypto.randomUUID();
  await database.transaction("rw", [database.schoolYears, database.assignments, database.audit], async () => {
    const years = await database.schoolYears.toArray();
    if (years.some((y) => y.startsOn <= input.endsOn && input.startsOn <= y.endsOn)) throw new Error("Las fechas se empalman con otro ciclo escolar.");
    if (input.makeCurrent) for (const y of years) if (y.isCurrent) await database.schoolYears.put({ ...y, isCurrent: false });
    const rec: SchoolYear = { id, name: input.name.trim(), startsOn: input.startsOn, endsOn: input.endsOn, isCurrent: input.makeCurrent || years.length === 0 };
    await database.schoolYears.put(rec);
    let copied = 0;
    if (input.copyFromYearId) {
      const src = await database.assignments.where("schoolYearId").equals(input.copyFromYearId).toArray();
      await database.assignments.bulkPut(src.map((a) => ({ ...a, schoolYearId: id, id: `${id}:${a.staffId}:${a.weekday}:${a.periodId}` })));
      copied = src.length;
    }
    await logAudit(database, { table: "schoolYears", recordId: id, action: "create", summary: `Ciclo escolar ${rec.name}${copied ? ` (se copiaron ${copied} celdas de horario)` : ""}`, before: null, after: rec });
  });
  return id;
}

export async function setCurrentSchoolYear(database: AppDb, id: string): Promise<void> {
  await database.transaction("rw", [database.schoolYears, database.audit], async () => {
    const years = await database.schoolYears.toArray();
    const target = years.find((y) => y.id === id);
    if (!target) throw new Error("El ciclo ya no existe.");
    for (const y of years) await database.schoolYears.put({ ...y, isCurrent: y.id === id });
    await logAudit(database, { table: "schoolYears", recordId: id, action: "update", summary: `Ciclo vigente: ${target.name}`, before: years.find((y) => y.isCurrent) ?? null, after: { ...target, isCurrent: true } });
  });
}

