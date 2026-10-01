import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { AppDb } from "./db";
import { createSchoolSetup, type SetupInput } from "./setup";
import { saveStaff } from "./staff";
import { saveGroup, saveSubject } from "./catalogs";
import { saveAssignment } from "./schedule";
import { registerEntry, correctEntry } from "./attendance";
import { cancelIncident, saveIncident } from "./incidents";
import { assignCoverage, loadAvailability, removeCoverage, setNotRequired } from "./coverage";
import { loadToday } from "./dashboard";
import { createSchoolYear, saveHoliday } from "./calendar";
import { buildReport } from "./reports";
import { reportToCsv } from "./exportReport";
import { exportBackup, parseBackup, restoreBackup } from "./backup";
import type { WorkDayInput } from "@/domain/workSchedule";

let db: AppDb;
let n = 0;
const setup: SetupInput = {
  schoolName: "Escuela Demo", cct: "", educationLevel: "", address: "", schoolZone: "", directorName: "", subdirectorName: "",
  yearName: "2026-2027", yearStart: "2026-08-31", yearEnd: "2027-07-15", timezone: "America/Mexico_City", toleranceMinutes: 0,
  shiftKind: "matutino", shiftName: "Matutino",
  periods: [
    { name: "1ª", startsAt: "07:30", endsAt: "08:20", kind: "class" },
    { name: "2ª", startsAt: "08:20", endsAt: "09:10", kind: "class" },
    { name: "3ª", startsAt: "09:10", endsAt: "10:00", kind: "class" },
    { name: "Receso", startsAt: "10:00", endsAt: "10:20", kind: "break" },
  ],
};
const week: WorkDayInput[] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, works: true, startsAt: "07:30", endsAt: "14:00" }));
const MON = "2026-09-14"; // lunes
const TUE = "2026-09-15";
let s: { maria: string; juan: string; udeei: string; year: string; p1: string; p2: string; p3: string; receso: string; g2A: string; mate: string; clase: string; absence: string; leave: string };

beforeEach(async () => {
  db = new AppDb(`inc-${++n}`);
  await createSchoolSetup(db, setup);
  const cats = await db.categories.toArray();
  const shift = (await db.shifts.toArray())[0];
  const base = { lastName: "X", employeeNumber: "", jobTitle: "", email: "", phone: "", shiftId: shift.id, isActive: true, hiredOn: "", adminNotes: "" };
  const doc = cats.find((c) => c.name === "Docente")!;
  const maria = await saveStaff(db, { ...base, firstName: "María", categoryId: doc.id, isTeaching: true, entryRule: "fixed" }, week);
  const juan = await saveStaff(db, { ...base, firstName: "Juan", categoryId: doc.id, isTeaching: true, entryRule: "fixed" }, week);
  const other = cats.find((c) => !c.isTeaching)!;
  const udeei = await saveStaff(db, { ...base, firstName: "Ana", lastName: "UDEEI", categoryId: other.id, isTeaching: false, entryRule: "fixed" }, week);
  await saveGroup(db, { name: "2A", grade: "2", shiftId: shift.id, isActive: true });
  await saveSubject(db, { name: "Matemáticas", shortName: "Mat", isActive: true });
  const periods = await db.periods.toArray();
  const pid = (name: string) => periods.find((p) => p.name === name)!.id;
  const clase = (await db.activityTypes.toArray()).find((a) => a.name === "Clase")!.id;
  const tutoria = (await db.activityTypes.toArray()).find((a) => a.name === "Tutoría")!.id;
  const year = (await db.schoolYears.toArray())[0].id;
  const g2A = (await db.groups.toArray())[0].id;
  const mate = (await db.subjects.toArray())[0].id;
  for (const w of [1, 2]) for (const p of ["1ª", "2ª"]) {
    await saveAssignment(db, { schoolYearId: year, staffId: maria, weekday: w, periodId: pid(p), groupId: g2A, subjectId: mate, activityTypeId: clase, allowShared: false });
  }
  // Juan da clase en la 1ª del lunes (otro grupo no hace falta: sin grupo).
  await saveAssignment(db, { schoolYearId: year, staffId: juan, weekday: 1, periodId: pid("1ª"), groupId: "", subjectId: "", activityTypeId: tutoria, allowShared: false });
  const types = await db.incidentTypes.toArray();
  s = { maria, juan, udeei, year, p1: pid("1ª"), p2: pid("2ª"), p3: pid("3ª"), receso: pid("Receso"), g2A, mate, clase, absence: types.find((t) => t.countsAs === "absence")!.id, leave: types.find((t) => t.countsAs === "leave")!.id };
});

const full = (staffId: string, typeId: string, start: string, end = start) => ({ staffId, typeId, startDate: start, endDate: end, scope: "full_day" as const, periodIds: [], startTime: "", endTime: "", notes: "" });

describe("entradas y retardos", () => {
  it("UDEEI 07:30 llega 07:43 = 13 min de retardo y queda en auditoría", async () => {
    const e = await registerEntry(db, { staffId: s.udeei, date: MON, arrivedTime: "07:43" });
    expect(e.status).toBe("late");
    expect(e.lateMinutes).toBe(13);
    expect((await db.audit.toArray()).some((a) => a.table === "attendance")).toBe(true);
  });
  it("no permite duplicar ni registrar en día no laborable o con falta de día completo", async () => {
    await registerEntry(db, { staffId: s.udeei, date: MON, arrivedTime: "07:30" });
    await expect(registerEntry(db, { staffId: s.udeei, date: MON, arrivedTime: "07:40" })).rejects.toThrow(/ya tiene entrada/);
    await saveHoliday(db, { date: TUE, label: "Consejo técnico" });
    await expect(registerEntry(db, { staffId: s.udeei, date: TUE, arrivedTime: "07:30" })).rejects.toThrow(/no laborable/);
    await saveIncident(db, full(s.maria, s.absence, "2026-09-16"));
    await expect(registerEntry(db, { staffId: s.maria, date: "2026-09-16", arrivedTime: "07:30" })).rejects.toThrow(/día completo/);
  });
  it("no permite falta de día completo si ya hay entrada ese día", async () => {
    await registerEntry(db, { staffId: s.maria, date: MON, arrivedTime: "07:30" });
    await expect(saveIncident(db, full(s.maria, s.absence, MON))).rejects.toThrow(/ya tiene entrada/);
  });
  it("corregir exige motivo y recalcula", async () => {
    await registerEntry(db, { staffId: s.udeei, date: MON, arrivedTime: "07:43" });
    await expect(correctEntry(db, { staffId: s.udeei, date: MON, arrivedTime: "07:35", reason: "" })).rejects.toThrow();
    const c = await correctEntry(db, { staffId: s.udeei, date: MON, arrivedTime: "07:35", reason: "Error de captura" });
    expect(c.lateMinutes).toBe(5);
  });
});

describe("incidencias, clases afectadas y coberturas", () => {
  it("falta de día completo detecta clases afectadas (no el receso ni horas libres)", async () => {
    const id = await saveIncident(db, full(s.maria, s.absence, MON));
    const rows = await db.affected.where("incidentId").equals(id).toArray();
    expect(rows.map((r) => r.periodId).sort()).toEqual([s.p1, s.p2].sort());
    expect(rows.every((r) => r.coverageStatus === "uncovered")).toBe(true);
  });
  it("varios días = un registro; solo cuenta días laborales", async () => {
    await saveIncident(db, full(s.maria, s.leave, MON, "2026-09-20")); // lunes a domingo
    expect(await db.incidents.count()).toBe(1);
    expect(await db.affected.count()).toBe(4); // lunes y martes x 2 periodos
  });
  it("bloquea incidencias empalmadas de la misma persona", async () => {
    await saveIncident(db, full(s.maria, s.absence, MON));
    await expect(saveIncident(db, full(s.maria, s.leave, MON))).rejects.toThrow(/se empalma/);
  });
  it("cobertura: lista disponibles, valida y se puede quitar", async () => {
    await saveIncident(db, full(s.maria, s.absence, MON));
    const first = (await db.affected.toArray()).find((a) => a.periodId === s.p1)!;
    const second = (await db.affected.toArray()).find((a) => a.periodId === s.p2)!;
    const avail1 = (await loadAvailability(db, first.id)).map((c) => c.staffId);
    expect(avail1).not.toContain(s.juan); // Juan tiene clase en la 1ª
    expect(avail1).not.toContain(s.maria);
    expect(avail1).toContain(s.udeei);
    const avail2 = (await loadAvailability(db, second.id)).map((c) => c.staffId);
    expect(avail2).toContain(s.juan);
    await expect(assignCoverage(db, first.id, s.juan)).rejects.toThrow(/no puede cubrir/);
    const covId = await assignCoverage(db, second.id, s.juan);
    expect((await db.affected.get(second.id))!.coverageStatus).toBe("covered");
    expect((await loadAvailability(db, second.id)).map((c) => c.staffId)).toContain(s.juan);
    await removeCoverage(db, covId, "prueba");
    expect((await db.affected.get(second.id))!.coverageStatus).toBe("uncovered");
    await setNotRequired(db, first.id, true, "Grupo en taller");
    expect((await db.affected.get(first.id))!.coverageStatus).toBe("not_required");
    await expect(setNotRequired(db, second.id, true, "")).rejects.toThrow();
  });
  it("cancelar incidencia libera clases y cancela coberturas; exige motivo", async () => {
    const id = await saveIncident(db, full(s.maria, s.absence, MON));
    const second = (await db.affected.toArray()).find((a) => a.periodId === s.p2)!;
    await assignCoverage(db, second.id, s.juan);
    await expect(cancelIncident(db, id, " ")).rejects.toThrow();
    await cancelIncident(db, id, "Captura equivocada");
    expect(await db.affected.count()).toBe(0);
    expect((await db.coverages.toArray()).every((c) => c.canceledAt)).toBe(true);
    expect((await db.incidents.get(id))!.status).toBe("cancelled");
  });
  it("modificar una incidencia deja antes/después en auditoría", async () => {
    const id = await saveIncident(db, full(s.maria, s.absence, MON));
    await saveIncident(db, { ...full(s.maria, s.leave, MON), id, reason: "Era licencia" });
    const a = (await db.audit.toArray()).filter((x) => x.table === "incidents" && x.action === "update");
    expect(a).toHaveLength(1);
    expect(a[0].reason).toBe("Era licencia");
  });
  it("por periodos solo afecta los periodos elegidos", async () => {
    const id = await saveIncident(db, { ...full(s.maria, s.absence, MON), scope: "periods", periodIds: [s.p2] });
    const rows = await db.affected.where("incidentId").equals(id).toArray();
    expect(rows.map((r) => r.periodId)).toEqual([s.p2]);
  });
});

describe("tablero Hoy, calendario y respaldo", () => {
  it("cuenta esperados, retardos, faltas y pendientes", async () => {
    await registerEntry(db, { staffId: s.udeei, date: MON, arrivedTime: "07:43" });
    await saveIncident(db, full(s.maria, s.absence, MON));
    const t = await loadToday(db, MON, "09:00");
    expect(t.counts.late).toBe(1);
    expect(t.counts.absences).toBe(1);
    expect(t.counts.pending).toBe(2);
    expect(t.counts.noRecord).toBe(1); // Juan
    expect(t.overdue.map((r) => r.staff.id)).toEqual([s.juan]);
  });
  it("día no laborable y fin de semana no esperan a nadie", async () => {
    expect((await loadToday(db, "2026-09-19", "09:00")).rows).toHaveLength(0);
  });
  it("ciclo nuevo copia horarios y no se empalma", async () => {
    await expect(createSchoolYear(db, { name: "X", startsOn: "2027-01-01", endsOn: "2027-02-01", makeCurrent: false })).rejects.toThrow(/empalman/);
    const id = await createSchoolYear(db, { name: "2027-2028", startsOn: "2027-08-30", endsOn: "2028-07-14", makeCurrent: true, copyFromYearId: s.year });
    expect(await db.assignments.where("schoolYearId").equals(id).count()).toBe(5);
    expect((await db.schoolYears.toArray()).filter((y) => y.isCurrent)).toHaveLength(1);
  });
  it("el respaldo conserva documentos adjuntos", async () => {
    const id = await saveIncident(db, full(s.maria, s.absence, MON));
    const { addDocument } = await import("./incidents");
    await addDocument(db, id, { name: "a.txt", type: "text/plain", size: 3 }, new Blob(["hola"], { type: "text/plain" }));
    const text = JSON.stringify(await exportBackup(db));
    const other = new AppDb(`inc-restore-${n}`);
    await restoreBackup(other, parseBackup(text));
    const d = (await other.documents.toArray())[0];
    expect(d.name).toBe("a.txt");
    expect(await d.blob.text()).toBe("hola");
  });
});

describe("reportes", () => {
  const base = { from: "2026-09-01", to: "2026-09-30", detailed: true };
  it("cuenta retardos con minutos, faltas en días y recorta incidencias al rango", async () => {
    await registerEntry(db, { staffId: s.udeei, date: MON, arrivedTime: "07:43" });
    await saveIncident(db, full(s.maria, s.leave, MON, "2026-10-05")); // lunes 14 a lunes 5/oct
    const r = await buildReport(db, { ...base, type: "general" });
    const row = (name: string) => r.sections[0].rows.find((x) => x[0].startsWith(name))!;
    expect(row("Ana")[2]).toBe("1");
    expect(row("Ana")[3]).toBe("13");
    expect(row("María")[5]).toBe("13"); // 14-30 sept: 13 días hábiles
    const short = await buildReport(db, { ...base, from: "2026-09-15", to: "2026-09-15", type: "persona", staffId: s.maria });
    expect(short.sections[0].rows[0][5]).toBe("1");
  });
  it("reporte por grupo y filtros combinables; CSV incluye los datos", async () => {
    await saveIncident(db, full(s.maria, s.absence, MON));
    const second = (await db.affected.toArray()).find((a) => a.periodId === s.p2)!;
    await assignCoverage(db, second.id, s.juan);
    const g = await buildReport(db, { ...base, type: "grupo", groupId: s.g2A });
    expect(g.summary.find((x) => x.label === "Clases afectadas")!.value).toBe("2");
    expect(g.summary.find((x) => x.label === "Cubiertas")!.value).toBe("1");
    const c = await buildReport(db, { ...base, type: "coberturas", staffId: s.maria });
    expect(c.sections[1].rows[0]).toContain("Juan X");
    expect(reportToCsv(g)).toContain("Escuela Demo");
    await expect(buildReport(db, { ...base, type: "persona" })).rejects.toThrow();
    await expect(buildReport(db, { ...base, from: "2026-10-01", type: "general" })).rejects.toThrow();
  });
  it("resumido oculta secciones de detalle", async () => {
    await saveIncident(db, full(s.maria, s.absence, MON));
    const { visibleSections } = await import("./reports");
    const r = await buildReport(db, { ...base, detailed: false, type: "general" });
    expect(visibleSections(r)).toHaveLength(1);
  });
});
