import type { ActivityType, IncidentType } from "./types";

/** Tipos de actividad iniciales (datos editables, la lista puede ampliarse). */
export const DEFAULT_ACTIVITY_TYPES: ReadonlyArray<{ name: string; isClass: boolean; isFree?: boolean }> = [
  { name: "Clase", isClass: true },
  { name: "Servicio", isClass: false },
  { name: "Tutoría", isClass: false },
  { name: "Reunión", isClass: false },
  { name: "Actividad administrativa", isClass: false },
  { name: "Libre", isClass: false, isFree: true },
  { name: "Otro", isClass: false },
];

export function defaultActivityTypes(): ActivityType[] {
  return DEFAULT_ACTIVITY_TYPES.map((a) => ({ id: crypto.randomUUID(), name: a.name, isClass: a.isClass, isFree: a.isFree ?? false, isActive: true }));
}

/** Catálogo inicial de incidencias (editable; las categorías usadas nunca se borran). */
export const DEFAULT_INCIDENT_TYPES: ReadonlyArray<{ name: string; countsAs: IncidentType["countsAs"] }> = [
  { name: "Inasistencia", countsAs: "absence" },
  { name: "Retardo", countsAs: "late" },
  { name: "Licencia médica", countsAs: "leave" },
  { name: "Licencia médica por cuidados familiares", countsAs: "leave" },
  { name: "Permiso económico", countsAs: "permit" },
  { name: "Permiso económico sindical", countsAs: "permit" },
  { name: "Constancia de tiempo", countsAs: "certificate" },
  { name: "Comisión", countsAs: "other" },
  { name: "Incapacidad", countsAs: "leave" },
  { name: "Otra", countsAs: "other" },
];

export function defaultIncidentTypes(): IncidentType[] {
  return DEFAULT_INCIDENT_TYPES.map((t) => ({ id: crypto.randomUUID(), name: t.name, countsAs: t.countsAs, isActive: true }));
}
