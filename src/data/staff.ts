import type { AppDb } from "./db";
import type { EntryRule, Staff, WorkDay } from "./types";
import { logAudit } from "./audit";
import { validateWorkWeek, type WorkDayInput } from "@/domain/workSchedule";

/** Error de validación con todos los mensajes, para mostrarlos juntos. */
export class ValidationError extends Error {
  readonly messages: string[];
  constructor(messages: string[]) {
    super(messages.join(" "));
    this.name = "ValidationError";
    this.messages = messages;
  }
}

export interface StaffInput {
  id?: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  categoryId: string;
  jobTitle: string;
  email: string;
  phone: string;
  shiftId: string;
  isTeaching: boolean;
  entryRule: EntryRule;
  isActive: boolean;
  hiredOn: string;
  adminNotes: string;
}

/** Normaliza para búsqueda: sin acentos, minúsculas. */
export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/** Búsqueda tolerante: cada palabra escrita debe aparecer en el nombre (en cualquier orden). */
export function matchesQuery(fullName: string, query: string): boolean {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const target = normalizeText(fullName);
  return words.every((w) => target.includes(w));
}

export function buildFullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

/** Los horarios laborales solo se exigen a quien usa horario fijo. */
export function needsWorkSchedule(input: Pick<StaffInput, "isTeaching" | "entryRule">): boolean {
  return !(input.isTeaching && input.entryRule === "first_activity");
}

export async function validateStaff(database: AppDb, input: StaffInput, week: readonly WorkDayInput[]): Promise<string[]> {
  const errors: string[] = [];
  if (!input.firstName.trim()) errors.push("Escribe el nombre.");
  if (!input.lastName.trim()) errors.push("Escribe los apellidos.");
  if (!input.categoryId) errors.push("Elige una categoría.");
  if (input.email.trim() && !/^\S+@\S+\.\S+$/.test(input.email.trim())) errors.push("El correo no es válido.");

  const number = input.employeeNumber.trim();
  if (number) {
    const same = await database.staff.where("employeeNumber").equals(number).toArray();
    const other = same.find((s) => s.id !== input.id);
    if (other) errors.push(`El número de empleado ${number} ya lo tiene ${other.fullName}.`);
  }
  if (needsWorkSchedule(input)) errors.push(...validateWorkWeek(week));
  return errors;
}

/** Crea o actualiza a una persona junto con su horario laboral, y deja constancia en la auditoría. */
export async function saveStaff(database: AppDb, input: StaffInput, week: readonly WorkDayInput[]): Promise<string> {
  const errors = await validateStaff(database, input, week);
  if (errors.length > 0) throw new ValidationError(errors);

  const now = new Date().toISOString();
  const id = input.id ?? crypto.randomUUID();

  await database.transaction("rw", [database.staff, database.workDays, database.audit], async () => {
    const before = input.id ? await database.staff.get(input.id) : undefined;
    const record: Staff = {
      id,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      fullName: buildFullName(input.firstName, input.lastName),
      employeeNumber: input.employeeNumber.trim(),
      categoryId: input.categoryId,
      jobTitle: input.jobTitle.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      shiftId: input.shiftId,
      isTeaching: input.isTeaching,
      entryRule: input.isTeaching ? input.entryRule : "fixed",
      isActive: input.isActive,
      hiredOn: input.hiredOn,
      adminNotes: input.adminNotes.trim(),
      createdAt: before?.createdAt ?? now,
      updatedAt: now,
    };
    await database.staff.put(record);

    const days: WorkDay[] = week.map((d) => ({ id: `${id}:${d.weekday}`, staffId: id, weekday: d.weekday, works: d.works, startsAt: d.works ? d.startsAt : "", endsAt: d.works ? d.endsAt : "" }));
    await database.workDays.where("staffId").equals(id).delete();
    if (needsWorkSchedule(record)) await database.workDays.bulkAdd(days);

    await logAudit(database, {
      table: "staff",
      recordId: id,
      action: before ? (before.isActive !== record.isActive ? (record.isActive ? "activate" : "deactivate") : "update") : "create",
      summary: before ? `Se modificó a ${record.fullName}` : `Se dio de alta a ${record.fullName}`,
      before: before ?? null,
      after: record,
    });
  });
  return id;
}

export async function loadWorkWeek(database: AppDb, staffId: string): Promise<WorkDayInput[] | null> {
  const days = await database.workDays.where("staffId").equals(staffId).toArray();
  if (days.length === 0) return null;
  return days.sort((a, b) => a.weekday - b.weekday).map((d) => ({ weekday: d.weekday, works: d.works, startsAt: d.startsAt, endsAt: d.endsAt }));
}
