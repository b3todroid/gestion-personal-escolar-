import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { AppDb } from "./db";
import { seedDemo } from "./demo";
import { buildReport } from "./reports";

it("el modo demo genera datos coherentes y reportes", async () => {
  const db = new AppDb("demo-test");
  await seedDemo(db, new Date("2026-09-30T18:00:00Z"));
  expect(await db.staff.count()).toBe(17);
  expect((await db.categories.toArray()).length).toBeGreaterThan(5);
  expect(await db.groups.count()).toBe(6);
  expect(await db.assignments.count()).toBe(5 * 6 * 6);
  expect(await db.incidents.count()).toBe(3);
  expect(await db.attendance.count()).toBeGreaterThan(50);
  const r = await buildReport(db, { type: "general", from: "2026-09-01", to: "2026-09-30", detailed: false });
  expect(r.summary[0].value).toMatch(/^\d+ \(\d+ min\)$/);
  expect((await db.attendance.filter((a) => a.lateMinutes === 13).count())).toBeGreaterThan(0);
  expect((await db.affected.filter((a) => a.coverageStatus === "covered").count())).toBe(1);
});
