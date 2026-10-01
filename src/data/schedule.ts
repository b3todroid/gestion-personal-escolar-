import type { AppDb } from "./db";
import type { Assignment } from "./types";
import { logAudit } from "./audit";
import { recalcFutureForStaff } from "./incidents";
import { cellId, findConflicts, type Cell } from "@/domain/schedule";
import { WEEKDAYS } from "@/domain/time";

export interface AssignmentInput {
  schoolYearId: string;
  staffId: string;
  weekday: number;
  periodId: string;
  groupId: string;
  subjectId: string;
  activityTypeId: string;
  allowShared: boolean;
  /** El usuario confirmó que quiere asignar a alguien inactivo. */
  confirmInactive?: boolean;
}

const dayName = (n: number) => WEEKDAYS.find((d) => d.n === n)?.label ?? `día ${n}`;

function toCell(a: Assignment): Cell {
  return { id: a.id, staffId: a.staffId, weekday: a.weekday, periodId: a.periodId, groupId: a.groupId, allowShared: a.allowShared };
}

/** Guarda (crea o reemplaza) una celda del horario docente. Valida y audita en una sola transacción. */
export async function saveAssignment(database: AppDb, input: AssignmentInput): Promise<void> {
  await database.transaction("rw", [database.assignments, database.staff, database.periods, database.groups, database.subjects, database.activityTypes, database.audit], async () => {
    const [person, period, activity] = await Promise.all([
      database.staff.get(input.staffId),
      database.periods.get(input.periodId),
      database.activityTypes.get(input.activityTypeId),
    ]);
    if (!person) throw new Error("La persona ya no existe.");
    if (!period) throw new Error("El periodo ya no existe.");
    if (!activity) throw new Error("Elige el tipo de actividad.");
    if (period.kind === "break") throw new Error(`No se puede asignar actividad en «${period.name}» porque es un receso.`);
    if (!person.isActive && !input.confirmInactive) {
      throw new Error(`${person.fullName} está inactivo/a. Confirma si quieres asignarle actividad de todos modos.`);
    }
    if (activity.isClass && (!input.groupId || !input.subjectId)) throw new Error("Una clase necesita grupo y materia.");

    const group = input.groupId ? await database.groups.get(input.groupId) : undefined;
    if (input.groupId && !group) throw new Error("El grupo ya no existe.");

    const id = cellId(input.schoolYearId, input.staffId, input.weekday, input.periodId);
    const candidate: Cell = { id, staffId: input.staffId, weekday: input.weekday, periodId: input.periodId, groupId: input.groupId, allowShared: input.allowShared };

    const sameSlot = await database.assignments
      .where("schoolYearId").equals(input.schoolYearId)
      .filter((a) => a.weekday === input.weekday && a.periodId === input.periodId)
      .toArray();
    const conflicts = findConflicts(sameSlot.map(toCell), candidate);
    if (conflicts.length > 0) {
      const c = conflicts[0];
      if (c.kind === "staff_busy") {
        throw new Error(`No se puede asignar a ${person.fullName} porque ya tiene una actividad durante la ${period.name} hora del ${dayName(input.weekday).toLowerCase()}.`);
      }
      const other = await database.staff.get(c.with.staffId);
      throw new Error(`El grupo ${group?.name ?? ""} ya tiene a ${other?.fullName ?? "otro docente"} en la ${period.name} hora del ${dayName(input.weekday).toLowerCase()}. Si es una clase compartida, marca «Clase compartida».`);
    }

    const before = await database.assignments.get(id);
    const record: Assignment = { id, schoolYearId: input.schoolYearId, staffId: input.staffId, weekday: input.weekday, periodId: input.periodId, groupId: input.groupId, subjectId: input.subjectId, activityTypeId: input.activityTypeId, allowShared: input.allowShared };
    await database.assignments.put(record);
    await logAudit(database, { table: "assignments", recordId: id, action: before ? "update" : "create", summary: `Horario de ${person.fullName}: ${dayName(input.weekday)} ${period.name}${group ? ` → ${group.name}` : ""}`, before: before ?? null, after: record });
  });
  await recalcFutureForStaff(database, input.staffId);
}

export async function clearAssignment(database: AppDb, schoolYearId: string, staffId: string, weekday: number, periodId: string): Promise<void> {
  const id = cellId(schoolYearId, staffId, weekday, periodId);
  await database.transaction("rw", [database.assignments, database.staff, database.periods, database.audit], async () => {
    const before = await database.assignments.get(id);
    if (!before) return;
    const [person, period] = await Promise.all([database.staff.get(staffId), database.periods.get(periodId)]);
    await database.assignments.delete(id);
    await logAudit(database, { table: "assignments", recordId: id, action: "deactivate", summary: `Se quitó del horario de ${person?.fullName ?? "?"}: ${dayName(weekday)} ${period?.name ?? ""}`, before, after: null });
  });
  await recalcFutureForStaff(database, staffId);
}
