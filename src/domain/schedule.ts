/** Una celda del horario: una persona, un día, un periodo. */
export interface Cell {
  id: string;
  staffId: string;
  weekday: number;
  periodId: string;
  groupId: string;
  allowShared: boolean;
}

export type Conflict =
  | { kind: "staff_busy"; with: Cell }
  | { kind: "group_busy"; with: Cell };

/**
 * Detecta choques de una celda candidata contra las existentes (del mismo ciclo).
 * - La misma persona no puede tener dos actividades en el mismo día y periodo.
 * - Un grupo no puede tener dos docentes a la vez, salvo que alguna de las dos celdas esté marcada como compartida.
 * La celda que se está editando (mismo id) no cuenta como choque consigo misma.
 */
export function findConflicts(existing: readonly Cell[], candidate: Cell): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const c of existing) {
    if (c.id === candidate.id) continue;
    if (c.weekday !== candidate.weekday || c.periodId !== candidate.periodId) continue;
    if (c.staffId === candidate.staffId) {
      conflicts.push({ kind: "staff_busy", with: c });
    } else if (candidate.groupId && c.groupId === candidate.groupId && !candidate.allowShared && !c.allowShared) {
      conflicts.push({ kind: "group_busy", with: c });
    }
  }
  return conflicts;
}

/** Identificador estable de una celda: una sola por persona/día/periodo dentro del ciclo. */
export function cellId(yearId: string, staffId: string, weekday: number, periodId: string): string {
  return `${yearId}:${staffId}:${weekday}:${periodId}`;
}
