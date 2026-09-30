import { isValidTime, toMinutes } from "./time";

export type PeriodKind = "class" | "break" | "activity" | "other";

export interface PeriodInput {
  /** Presente cuando el periodo ya existe (conserva su identidad al reordenar o editar). */
  id?: string;
  name: string;
  startsAt: string;
  endsAt: string;
  kind: PeriodKind;
}

export const PERIOD_KIND_LABELS: Record<PeriodKind, string> = {
  class: "Clase",
  break: "Receso",
  activity: "Actividad",
  other: "Otro",
};

/**
 * Valida los periodos de un turno. Devuelve mensajes en español (lista vacía = todo bien).
 * Reglas: nombre, horas válidas, fin posterior al inicio y sin traslapes.
 */
export function validatePeriods(periods: readonly PeriodInput[]): string[] {
  if (periods.length === 0) return ["Agrega al menos un periodo."];
  const errors: string[] = [];
  const valid: { label: string; start: number; end: number }[] = [];

  periods.forEach((p, i) => {
    const label = p.name.trim() || `Periodo ${i + 1}`;
    if (!p.name.trim()) errors.push(`${label}: escribe un nombre.`);
    if (!isValidTime(p.startsAt) || !isValidTime(p.endsAt)) {
      errors.push(`${label}: escribe horas válidas (por ejemplo 07:30).`);
      return;
    }
    const start = toMinutes(p.startsAt);
    const end = toMinutes(p.endsAt);
    if (end <= start) {
      errors.push(`${label}: la hora de término debe ser posterior a la de inicio.`);
      return;
    }
    valid.push({ label, start, end });
  });

  const sorted = [...valid].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) {
      errors.push(`${sorted[i - 1].label} y ${sorted[i].label} se traslapan.`);
    }
  }
  return errors;
}

/** Fila vacía para capturar un periodo nuevo (sin horas predeterminadas). */
export const BLANK_PERIOD: PeriodInput = { name: "", startsAt: "", endsAt: "", kind: "class" };
