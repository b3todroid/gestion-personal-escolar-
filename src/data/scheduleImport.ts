import type { AppDb } from "./db";
import { normalizeText } from "./staff";
import { parseCsv, toCsv } from "@/domain/csv";
import { findConflicts, cellId, type Cell } from "@/domain/schedule";
import { WEEKDAYS } from "@/domain/time";
import { saveAssignment } from "./schedule";

export const IMPORT_HEADERS = ["docente", "dia", "periodo", "grupo", "materia", "actividad"] as const;

/** Plantilla descargable con una fila de ejemplo. */
export function scheduleTemplateCsv(): string {
  return toCsv([
    [...IMPORT_HEADERS],
    ["María López", "Lunes", "1ª", "2A", "Matemáticas", "Clase"],
    ["María López", "Martes", "3ª", "", "", "Tutoría"],
  ]);
}

export interface ImportRow {
  line: number;
  staffId: string;
  staffName: string;
  weekday: number;
  periodId: string;
  periodName: string;
  groupId: string;
  groupName: string;
  subjectId: string;
  subjectName: string;
  activityTypeId: string;
  activityName: string;
  isClass: boolean;
}

export interface ImportPreview {
  rows: ImportRow[];
  errors: { line: number; message: string }[];
}

/** Valida todo el archivo SIN guardar nada; los errores se muestran antes de confirmar. */
export async function previewScheduleImport(database: AppDb, csvText: string, schoolYearId: string): Promise<ImportPreview> {
  const table = parseCsv(csvText);
  const errors: ImportPreview["errors"] = [];
  const rows: ImportRow[] = [];
  if (table.length === 0) return { rows, errors: [{ line: 1, message: "El archivo está vacío." }] };

  const header = table[0].map((h) => normalizeText(h));
  const col = Object.fromEntries(IMPORT_HEADERS.map((h) => [h, header.indexOf(h)])) as Record<(typeof IMPORT_HEADERS)[number], number>;
  const missing = IMPORT_HEADERS.filter((h) => col[h] === -1);
  if (missing.length > 0) return { rows, errors: [{ line: 1, message: `Faltan columnas: ${missing.join(", ")}. Descarga la plantilla para ver el formato.` }] };

  const [staff, groups, subjects, periods, activities, existing] = await Promise.all([
    database.staff.toArray(), database.groups.toArray(), database.subjects.toArray(),
    database.periods.toArray(), database.activityTypes.toArray(), database.assignments.where("schoolYearId").equals(schoolYearId).toArray(),
  ]);
  const byName = <T extends { name: string }>(list: T[], name: string) => list.filter((x) => normalizeText(x.name) === normalizeText(name));

  const seenStaffSlot = new Map<string, number>();
  const seenGroupSlot = new Map<string, number>();
  const pending: Cell[] = [];

  table.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const get = (h: (typeof IMPORT_HEADERS)[number]) => (r[col[h]] ?? "").trim();
    const fail = (message: string) => errors.push({ line, message });

    const staffMatches = staff.filter((s) => normalizeText(s.fullName) === normalizeText(get("docente")));
    if (!get("docente")) return fail("Falta el docente.");
    if (staffMatches.length === 0) return fail(`El docente «${get("docente")}» no existe en Personal.`);
    if (staffMatches.length > 1) return fail(`Hay más de una persona llamada «${get("docente")}».`);
    const person = staffMatches[0];

    const day = WEEKDAYS.find((d) => normalizeText(d.label) === normalizeText(get("dia")));
    if (!day) return fail(`El día «${get("dia")}» no es válido (usa Lunes a Viernes).`);

    const periodMatches = periods.filter((p) => normalizeText(p.name) === normalizeText(get("periodo")));
    if (periodMatches.length !== 1) return fail(`El periodo «${get("periodo")}» no existe o es ambiguo.`);
    const period = periodMatches[0];
    if (period.kind === "break") return fail(`«${period.name}» es un receso y no admite actividades.`);

    const actName = get("actividad") || (get("grupo") ? "Clase" : "");
    const act = byName(activities, actName)[0];
    if (!act) return fail(`El tipo de actividad «${actName}» no existe.`);

    let group, subject;
    if (get("grupo")) {
      group = byName(groups, get("grupo"))[0];
      if (!group) return fail(`El grupo «${get("grupo")}» no existe.`);
    }
    if (get("materia")) {
      subject = byName(subjects, get("materia"))[0];
      if (!subject) return fail(`La materia «${get("materia")}» no existe.`);
    }
    if (act.isClass && (!group || !subject)) return fail("Una clase necesita grupo y materia.");

    const slot = `${person.id}:${day.n}:${period.id}`;
    if (seenStaffSlot.has(slot)) return fail(`${person.fullName} ya aparece en la línea ${seenStaffSlot.get(slot)} para ${day.label} ${period.name}.`);
    const gSlot = group ? `${group.id}:${day.n}:${period.id}` : "";
    if (gSlot && seenGroupSlot.has(gSlot)) return fail(`El grupo ${group!.name} ya tiene docente en la línea ${seenGroupSlot.get(gSlot)} para ${day.label} ${period.name}.`);

    const cell: Cell = { id: cellId(schoolYearId, person.id, day.n, period.id), staffId: person.id, weekday: day.n, periodId: period.id, groupId: group?.id ?? "", allowShared: false };
    // Choques contra lo que ya está guardado, ignorando las celdas de esta misma persona que el archivo reemplaza.
    const conflict = findConflicts(existing.filter((e) => e.weekday === day.n && e.periodId === period.id).map((e) => ({ id: e.id, staffId: e.staffId, weekday: e.weekday, periodId: e.periodId, groupId: e.groupId, allowShared: e.allowShared })), cell)
      .find((c) => c.kind === "group_busy");
    if (conflict) {
      const other = staff.find((s) => s.id === conflict.with.staffId);
      return fail(`El grupo ${group!.name} ya tiene a ${other?.fullName ?? "otro docente"} en ${day.label} ${period.name}.`);
    }

    seenStaffSlot.set(slot, line);
    if (gSlot) seenGroupSlot.set(gSlot, line);
    pending.push(cell);
    rows.push({ line, staffId: person.id, staffName: person.fullName, weekday: day.n, periodId: period.id, periodName: period.name, groupId: group?.id ?? "", groupName: group?.name ?? "", subjectId: subject?.id ?? "", subjectName: subject?.name ?? "", activityTypeId: act.id, activityName: act.name, isClass: act.isClass });
  });

  if (rows.length === 0 && errors.length === 0) errors.push({ line: 2, message: "El archivo no tiene filas de horario." });
  return { rows, errors };
}

/** Aplica un archivo ya validado (todo o nada). */
export async function applyScheduleImport(database: AppDb, preview: ImportPreview, schoolYearId: string): Promise<number> {
  if (preview.errors.length > 0) throw new Error("Corrige los errores del archivo antes de importar.");
  await database.transaction("rw", [database.assignments, database.staff, database.periods, database.groups, database.subjects, database.activityTypes, database.audit], async () => {
    for (const r of preview.rows) {
      await saveAssignment(database, { schoolYearId, staffId: r.staffId, weekday: r.weekday, periodId: r.periodId, groupId: r.groupId, subjectId: r.subjectId, activityTypeId: r.activityTypeId, allowShared: false, confirmInactive: true });
    }
  });
  return preview.rows.length;
}
