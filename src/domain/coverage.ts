import { toMinutes } from "./time";
import type { PeriodLite } from "./incidents";

export type CoverageStatus = "uncovered" | "covered" | "not_required";

export interface StaffForCoverage {
  id: string;
  isActive: boolean;
  isTeaching: boolean;
  entryRule: "fixed" | "first_activity";
  /** Horario laboral del día consultado (si existe). */
  work?: { works: boolean; startsAt: string; endsAt: string };
  /** Periodos que esa persona tiene ocupados ese día (con su horario y si cuentan como hora libre). */
  activities: { startsAt: string; endsAt: string; periodId: string; isFree: boolean }[];
}

export interface Candidate {
  staffId: string;
  /** «free» = tiene hora libre en su horario; «available» = está presente y sin actividad. */
  kind: "free" | "available";
}

function isPresent(s: StaffForCoverage, period: PeriodLite): boolean {
  const ps = toMinutes(period.startsAt);
  const pe = toMinutes(period.endsAt);
  if (s.isTeaching && s.entryRule === "first_activity") {
    if (s.activities.length === 0) return false;
    const start = Math.min(...s.activities.map((a) => toMinutes(a.startsAt)));
    const end = Math.max(...s.activities.map((a) => toMinutes(a.endsAt)));
    return start <= ps && pe <= end;
  }
  if (!s.work || !s.work.works) return false;
  return toMinutes(s.work.startsAt) <= ps && pe <= toMinutes(s.work.endsAt);
}

/**
 * Personal disponible para cubrir un periodo.
 * Se excluye a quien: esté inactivo, sea el ausente, no esté presente en su horario laboral,
 * tenga clase u otra actividad (salvo hora libre), tenga una incidencia que se empalme, o ya cubra ese periodo.
 */
export function findAvailableStaff(input: {
  period: PeriodLite;
  absentStaffId: string;
  staff: readonly StaffForCoverage[];
  /** Personas con una incidencia que se empalma con el periodo en esa fecha. */
  withIncident: ReadonlySet<string>;
  /** Personas que ya cubren otra clase en ese mismo periodo y fecha. */
  alreadyCovering: ReadonlySet<string>;
}): Candidate[] {
  const out: Candidate[] = [];
  for (const s of input.staff) {
    if (!s.isActive || s.id === input.absentStaffId) continue;
    if (input.withIncident.has(s.id) || input.alreadyCovering.has(s.id)) continue;
    if (!isPresent(s, input.period)) continue;
    const here = s.activities.filter((a) => a.periodId === input.period.id);
    if (here.some((a) => !a.isFree)) continue;
    out.push({ staffId: s.id, kind: here.length > 0 ? "free" : "available" });
  }
  return out;
}

/** Por qué no está disponible (para mostrar un mensaje claro si se intenta asignar a mano). */
export function unavailableReason(input: {
  staff: StaffForCoverage;
  period: PeriodLite;
  absentStaffId: string;
  hasIncident: boolean;
  alreadyCovering: boolean;
}): string | null {
  const s = input.staff;
  if (!s.isActive) return "está inactivo/a";
  if (s.id === input.absentStaffId) return "es quien se ausenta";
  if (input.hasIncident) return "tiene una incidencia en ese horario";
  if (input.alreadyCovering) return "ya cubre otra clase en ese periodo";
  if (!isPresent(s, input.period)) return "no está en su horario laboral en ese periodo";
  if (s.activities.some((a) => a.periodId === input.period.id && !a.isFree)) return "tiene otra actividad en ese periodo";
  return null;
}
