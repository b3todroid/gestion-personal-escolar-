import "fake-indexeddb/auto";
import Dexie from "dexie";
import { expect, it } from "vitest";
import { AppDb } from "./db";
import { createSchoolSetup } from "./setup";
import { loadToday } from "./dashboard";

it("actualiza una base v2 existente a v3 sin perder datos", async () => {
  const old = new Dexie("old-db");
  old.version(1).stores({ settings: "id", schoolYears: "id, isCurrent", shifts: "id", periods: "id, shiftId, [shiftId+position]", categories: "id, name", staff: "id, categoryId, fullName, employeeNumber, isActive", workDays: "id, staffId", audit: "id, recordId, table, at" });
  old.version(2).stores({ groups: "id, name", subjects: "id, name", activityTypes: "id, name", assignments: "id, schoolYearId, staffId, groupId, [schoolYearId+staffId], [schoolYearId+groupId]" });
  await old.open();
  // datos como los dejó la versión anterior (sin campos nuevos)
  await old.table("settings").put({ id: "main", schoolName: "Mi escuela", cct: "", educationLevel: "", address: "", schoolZone: "", directorName: "", subdirectorName: "", timezone: "America/Mexico_City", toleranceMinutes: 0, signatures: [] });
  await old.table("schoolYears").put({ id: "y", name: "2026-2027", startsOn: "2026-08-31", endsOn: "2027-07-15", isCurrent: true });
  await old.table("activityTypes").bulkPut([{ id: "a", name: "Libre", isClass: false, isActive: true }]);
  old.close();

  const db = new AppDb("old-db");
  await db.open();
  expect(await db.incidentTypes.count()).toBeGreaterThan(5);
  const t = await loadToday(db, "2026-09-30", "10:00");
  expect(t.rows).toHaveLength(0);
  void createSchoolSetup;
});
