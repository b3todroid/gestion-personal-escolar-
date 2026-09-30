import Dexie, { type Table } from "dexie";
import { defaultActivityTypes } from "./defaults";
import type { ActivityType, Assignment, AuditEntry, Group, Period, SchoolSettings, SchoolYear, Shift, Staff, StaffCategory, Subject, WorkDay } from "./types";

export class AppDb extends Dexie {
  declare settings: Table<SchoolSettings, string>;
  declare schoolYears: Table<SchoolYear, string>;
  declare shifts: Table<Shift, string>;
  declare periods: Table<Period, string>;
  declare categories: Table<StaffCategory, string>;
  declare staff: Table<Staff, string>;
  declare workDays: Table<WorkDay, string>;
  declare audit: Table<AuditEntry, string>;
  declare groups: Table<Group, string>;
  declare subjects: Table<Subject, string>;
  declare activityTypes: Table<ActivityType, string>;
  declare assignments: Table<Assignment, string>;

  constructor(name = "gestion-personal-escolar") {
    super(name);
    // Cada cambio de estructura se agrega como una nueva versión (migración local); nunca se edita una anterior.
    this.version(1).stores({
      settings: "id",
      schoolYears: "id, isCurrent",
      shifts: "id",
      periods: "id, shiftId, [shiftId+position]",
      categories: "id, name",
      staff: "id, categoryId, fullName, employeeNumber, isActive",
      workDays: "id, staffId",
      audit: "id, recordId, table, at",
    });
    this.version(2)
      .stores({
        groups: "id, name",
        subjects: "id, name",
        activityTypes: "id, name",
        assignments: "id, schoolYearId, staffId, groupId, [schoolYearId+staffId], [schoolYearId+groupId]",
      })
      .upgrade(async (tx) => {
        // Instalaciones que ya existían reciben el catálogo inicial de actividades.
        if ((await tx.table("settings").count()) > 0 && (await tx.table("activityTypes").count()) === 0) {
          await tx.table("activityTypes").bulkAdd(defaultActivityTypes());
        }
      });
  }
}

export const db = new AppDb();

/** Nombres de las tablas incluidas en respaldos. */
export const BACKUP_TABLES = ["settings", "schoolYears", "shifts", "periods", "categories", "staff", "workDays", "audit", "groups", "subjects", "activityTypes", "assignments"] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];
