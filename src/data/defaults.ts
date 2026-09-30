import type { ActivityType } from "./types";

/** Tipos de actividad iniciales (datos editables, la lista puede ampliarse). */
export const DEFAULT_ACTIVITY_TYPES: ReadonlyArray<{ name: string; isClass: boolean }> = [
  { name: "Clase", isClass: true },
  { name: "Servicio", isClass: false },
  { name: "Tutoría", isClass: false },
  { name: "Reunión", isClass: false },
  { name: "Actividad administrativa", isClass: false },
  { name: "Libre", isClass: false },
  { name: "Otro", isClass: false },
];

export function defaultActivityTypes(): ActivityType[] {
  return DEFAULT_ACTIVITY_TYPES.map((a) => ({ id: crypto.randomUUID(), name: a.name, isClass: a.isClass, isActive: true }));
}
