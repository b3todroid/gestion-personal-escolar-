import type { AppDb } from "./db";
import type { Period, SchoolSettings, SchoolYear, Shift, ShiftKind, StaffCategory } from "./types";
import { defaultActivityTypes, defaultIncidentTypes } from "./defaults";
import { validatePeriods, type PeriodInput } from "@/domain/periods";

/** Categorías iniciales (son datos editables, no reglas del código). */
export const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; isTeaching: boolean }> = [
  { name: "Docente", isTeaching: true },
  { name: "UDEEI", isTeaching: false },
  { name: "Orientación", isTeaching: false },
  { name: "Trabajo Social", isTeaching: false },
  { name: "Secretaría", isTeaching: false },
  { name: "Prefectura", isTeaching: false },
  { name: "Asistencia educativa", isTeaching: false },
  { name: "Directivo", isTeaching: false },
  { name: "Administrativo", isTeaching: false },
  { name: "Biblioteca", isTeaching: false },
  { name: "Intendencia", isTeaching: false },
  { name: "Otro", isTeaching: false },
];

export interface SetupInput {
  schoolName: string;
  cct: string;
  educationLevel: string;
  address: string;
  schoolZone: string;
  directorName: string;
  subdirectorName: string;
  yearName: string;
  yearStart: string;
  yearEnd: string;
  timezone: string;
  toleranceMinutes: number;
  shiftKind: ShiftKind;
  shiftName: string;
  periods: PeriodInput[];
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("es-MX", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Todos los mensajes de error en español; lista vacía = datos válidos. */
export function validateSetup(input: SetupInput): string[] {
  const errors: string[] = [];
  if (!input.schoolName.trim()) errors.push("Escribe el nombre de la escuela.");
  if (!input.yearName.trim()) errors.push("Escribe el ciclo escolar (por ejemplo 2026-2027).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.yearStart) || !/^\d{4}-\d{2}-\d{2}$/.test(input.yearEnd)) {
    errors.push("Escribe las fechas de inicio y fin del ciclo.");
  } else if (input.yearStart >= input.yearEnd) {
    errors.push("La fecha de fin del ciclo debe ser posterior a la de inicio.");
  }
  if (!isValidTimeZone(input.timezone)) errors.push("La zona horaria no es válida.");
  if (!Number.isInteger(input.toleranceMinutes) || input.toleranceMinutes < 0) {
    errors.push("La tolerancia debe ser un número entero de minutos, 0 o mayor.");
  }
  if (!input.shiftName.trim()) errors.push("Escribe el nombre del turno.");
  errors.push(...validatePeriods(input.periods));
  return errors;
}

/** Crea la configuración inicial en una sola transacción. Falla si ya existe una escuela. */
export async function createSchoolSetup(database: AppDb, input: SetupInput): Promise<void> {
  const errors = validateSetup(input);
  if (errors.length > 0) throw new Error(errors[0]);

  await database.transaction("rw", [database.settings, database.schoolYears, database.shifts, database.periods, database.categories, database.activityTypes, database.incidentTypes], async () => {
    if ((await database.settings.count()) > 0) throw new Error("La escuela ya fue configurada.");

    const settings: SchoolSettings = {
      id: "main",
      schoolName: input.schoolName.trim(),
      cct: input.cct.trim(),
      educationLevel: input.educationLevel.trim(),
      address: input.address.trim(),
      schoolZone: input.schoolZone.trim(),
      directorName: input.directorName.trim(),
      subdirectorName: input.subdirectorName.trim(),
      timezone: input.timezone,
      toleranceMinutes: input.toleranceMinutes,
      signatures: [
        { label: "Elaboró", name: "", enabled: true },
        { label: "Subdirección", name: input.subdirectorName.trim(), enabled: true },
        { label: "Dirección", name: input.directorName.trim(), enabled: true },
      ],
    };
    const year: SchoolYear = { id: crypto.randomUUID(), name: input.yearName.trim(), startsOn: input.yearStart, endsOn: input.yearEnd, isCurrent: true };
    const shift: Shift = { id: crypto.randomUUID(), name: input.shiftName.trim(), kind: input.shiftKind, isActive: true };
    const periods: Period[] = input.periods.map((p, i) => ({
      id: crypto.randomUUID(),
      shiftId: shift.id,
      name: p.name.trim(),
      position: i + 1,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      kind: p.kind,
    }));
    const categories: StaffCategory[] = DEFAULT_CATEGORIES.map((c) => ({ id: crypto.randomUUID(), name: c.name, isTeaching: c.isTeaching, isActive: true }));

    await database.settings.add(settings);
    await database.schoolYears.add(year);
    await database.shifts.add(shift);
    await database.periods.bulkAdd(periods);
    await database.categories.bulkAdd(categories);
    await database.activityTypes.bulkAdd(defaultActivityTypes());
    await database.incidentTypes.bulkAdd(defaultIncidentTypes());
  });
}
