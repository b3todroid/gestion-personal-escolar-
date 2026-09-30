import Dexie, { type Table } from "dexie";
import type { AuditEntry, Period, SchoolSettings, SchoolYear, Shift, Staff, StaffCategory, WorkDay } from "./types";

export class AppDb extends Dexie {
  declare settings: Table<SchoolSettings, string>;
  declare schoolYears: Table<SchoolYear, string>;
  declare shifts: Table<Shift, string>;
  declare periods: Table<Period, string>;
  declare categories: Table<StaffCategory, string>;
  declare staff: Table<Staff, string>;
  declare workDays: Table<WorkDay, string>;
  declare audit: Table<AuditEntry, string>;

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
  }
}

export const db = new AppDb();

/** Nombres de las tablas incluidas en respaldos. */
export const BACKUP_TABLES = ["settings", "schoolYears", "shifts", "periods", "categories", "staff", "workDays", "audit"] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];
