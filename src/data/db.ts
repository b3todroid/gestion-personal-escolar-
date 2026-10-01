import Dexie, { type Table } from "dexie";
import { DEMO_DB_NAME, REAL_DB_NAME, isDemo } from "./mode";
import { defaultActivityTypes, defaultIncidentTypes } from "./defaults";
import type { ActivityType, AffectedClass, Assignment, AttendanceEntry, AuditEntry, Coverage, DocumentRecord, Group, Holiday, Incident, IncidentType, Period, SchoolSettings, SchoolYear, Shift, Staff, StaffCategory, Subject, WorkDay } from "./types";

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
  declare incidentTypes: Table<IncidentType, string>;
  declare incidents: Table<Incident, string>;
  declare affected: Table<AffectedClass, string>;
  declare attendance: Table<AttendanceEntry, string>;
  declare coverages: Table<Coverage, string>;
  declare documents: Table<DocumentRecord, string>;
  declare holidays: Table<Holiday, string>;

  constructor(name = REAL_DB_NAME) {
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
    this.version(3)
      .stores({
        incidentTypes: "id, name",
        incidents: "id, staffId, startDate, endDate, typeId, status, [staffId+startDate]",
        affected: "id, incidentId, staffId, date, groupId, coverageStatus, [date+periodId]",
        attendance: "id, staffId, date",
        coverages: "id, affectedId, date, coveringStaffId, [date+periodId]",
        documents: "id, incidentId",
        holidays: "id, &date",
      })
      .upgrade(async (tx) => {
        if ((await tx.table("settings").count()) > 0) {
          if ((await tx.table("incidentTypes").count()) === 0) await tx.table("incidentTypes").bulkAdd(defaultIncidentTypes());
          // La actividad «Libre» del catálogo inicial cuenta como hora libre para coberturas.
          await tx.table("activityTypes").filter((a: ActivityType) => a.name === "Libre").modify({ isFree: true });
        }
      });
  }
}

export const db = new AppDb(isDemo() ? DEMO_DB_NAME : REAL_DB_NAME);

/** Nombres de las tablas incluidas en respaldos. */
export const BACKUP_TABLES = ["settings", "schoolYears", "shifts", "periods", "categories", "staff", "workDays", "audit", "groups", "subjects", "activityTypes", "assignments", "incidentTypes", "incidents", "affected", "attendance", "coverages", "documents", "holidays"] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];
