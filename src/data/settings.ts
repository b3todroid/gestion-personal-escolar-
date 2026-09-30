import type { AppDb } from "./db";
import type { Period, SchoolSettings } from "./types";
import { logAudit } from "./audit";
import { validatePeriods, type PeriodInput } from "@/domain/periods";

export type SettingsInput = Omit<SchoolSettings, "id">;

export function validateSettings(input: SettingsInput): string[] {
  const errors: string[] = [];
  if (!input.schoolName.trim()) errors.push("Escribe el nombre de la escuela.");
  if (!Number.isInteger(input.toleranceMinutes) || input.toleranceMinutes < 0) errors.push("La tolerancia debe ser un número entero de minutos, 0 o mayor.");
  try {
    new Intl.DateTimeFormat("es-MX", { timeZone: input.timezone });
  } catch {
    errors.push("La zona horaria no es válida.");
  }
  return errors;
}

export async function saveSettings(database: AppDb, input: SettingsInput): Promise<void> {
  const errors = validateSettings(input);
  if (errors.length > 0) throw new Error(errors[0]);
  const before = await database.settings.get("main");
  const after: SchoolSettings = { ...input, id: "main", schoolName: input.schoolName.trim() };
  await database.settings.put(after);
  await logAudit(database, { table: "settings", recordId: "main", action: "update", summary: "Se modificó la configuración de la escuela", before: before ?? null, after });
}

/** Reemplaza los periodos del turno conservando el id de los que ya existían (para no romper horarios futuros). */
export async function savePeriods(database: AppDb, shiftId: string, periods: readonly PeriodInput[]): Promise<void> {
  const errors = validatePeriods(periods);
  if (errors.length > 0) throw new Error(errors[0]);
  await database.transaction("rw", [database.periods, database.audit], async () => {
    const before = await database.periods.where("shiftId").equals(shiftId).toArray();
    const keepIds = new Set(periods.map((p) => p.id).filter(Boolean));
    const removed = before.filter((p) => !keepIds.has(p.id));
    await database.periods.bulkDelete(removed.map((p) => p.id));
    const after: Period[] = periods.map((p, i) => ({
      id: p.id ?? crypto.randomUUID(),
      shiftId,
      name: p.name.trim(),
      position: i + 1,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      kind: p.kind,
    }));
    await database.periods.bulkPut(after);
    await logAudit(database, { table: "periods", recordId: shiftId, action: "update", summary: "Se modificaron los periodos del turno", before, after });
  });
}
