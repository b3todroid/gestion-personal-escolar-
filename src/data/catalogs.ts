import type { AppDb } from "./db";
import { logAudit } from "./audit";
import type { Group, Subject, ActivityType, IncidentType, CountsAs } from "./types";
import { normalizeText } from "./staff";

function assertUniqueName(all: { id: string; name: string }[], id: string | undefined, name: string, what: string) {
  const n = normalizeText(name);
  if (all.some((x) => x.id !== id && normalizeText(x.name) === n)) throw new Error(`Ya existe ${what} «${name.trim()}».`);
}

export async function saveGroup(database: AppDb, input: { id?: string; name: string; grade: string; shiftId: string; isActive: boolean }): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error("Escribe el nombre del grupo.");
  assertUniqueName(await database.groups.toArray(), input.id, name, "el grupo");
  const before = input.id ? await database.groups.get(input.id) : undefined;
  const record: Group = { id: input.id ?? crypto.randomUUID(), name, grade: input.grade.trim(), shiftId: input.shiftId, isActive: input.isActive };
  await database.groups.put(record);
  await logAudit(database, { table: "groups", recordId: record.id, action: before ? (before.isActive !== record.isActive ? (record.isActive ? "activate" : "deactivate") : "update") : "create", summary: `Grupo «${name}»`, before: before ?? null, after: record });
}

export async function saveSubject(database: AppDb, input: { id?: string; name: string; shortName: string; isActive: boolean }): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error("Escribe el nombre de la materia.");
  assertUniqueName(await database.subjects.toArray(), input.id, name, "la materia");
  const before = input.id ? await database.subjects.get(input.id) : undefined;
  const record: Subject = { id: input.id ?? crypto.randomUUID(), name, shortName: input.shortName.trim(), isActive: input.isActive };
  await database.subjects.put(record);
  await logAudit(database, { table: "subjects", recordId: record.id, action: before ? (before.isActive !== record.isActive ? (record.isActive ? "activate" : "deactivate") : "update") : "create", summary: `Materia «${name}»`, before: before ?? null, after: record });
}

export async function saveActivityType(database: AppDb, input: { id?: string; name: string; isClass: boolean; isFree?: boolean; isActive: boolean }): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error("Escribe el nombre del tipo de actividad.");
  assertUniqueName(await database.activityTypes.toArray(), input.id, name, "el tipo de actividad");
  const before = input.id ? await database.activityTypes.get(input.id) : undefined;
  const record: ActivityType = { id: input.id ?? crypto.randomUUID(), name, isClass: input.isClass, isFree: input.isFree ?? false, isActive: input.isActive };
  await database.activityTypes.put(record);
  await logAudit(database, { table: "activityTypes", recordId: record.id, action: before ? "update" : "create", summary: `Tipo de actividad «${name}»`, before: before ?? null, after: record });
}
// Grupos, materias y tipos de actividad nunca se borran: se desactivan para conservar el historial.

export async function saveIncidentType(database: AppDb, input: { id?: string; name: string; countsAs: CountsAs; isActive: boolean }): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error("Escribe el nombre de la incidencia.");
  assertUniqueName(await database.incidentTypes.toArray(), input.id, name, "la incidencia");
  const before = input.id ? await database.incidentTypes.get(input.id) : undefined;
  const record: IncidentType = { id: input.id ?? crypto.randomUUID(), name, countsAs: input.countsAs, isActive: input.isActive };
  await database.incidentTypes.put(record);
  await logAudit(database, { table: "incidentTypes", recordId: record.id, action: before ? (before.isActive !== record.isActive ? (record.isActive ? "activate" : "deactivate") : "update") : "create", summary: `Tipo de incidencia «${name}»`, before: before ?? null, after: record });
}
