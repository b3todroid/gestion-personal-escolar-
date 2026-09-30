import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { AppDb } from "./db";
import { createSchoolSetup, type SetupInput } from "./setup";
import { saveStaff } from "./staff";
import { saveGroup, saveSubject } from "./catalogs";
import { clearAssignment, saveAssignment } from "./schedule";
import { applyScheduleImport, previewScheduleImport, scheduleTemplateCsv } from "./scheduleImport";
import { exportBackup, parseBackup, restoreBackup } from "./backup";
import type { WorkDayInput } from "@/domain/workSchedule";

let db: AppDb;
let n = 0;
let ids: { year: string; maria: string; juan: string; g2A: string; g1B: string; mate: string; espa: string; clase: string; tutoria: string; p1: string; p3: string; receso: string };

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

beforeEach(async () => {
  db = new AppDb(`sched-${++n}`);
  await createSchoolSetup(db, setup);
  const cat = (await db.categories.toArray()).find((c) => c.name === "Docente")!;
  const shift = (await db.shifts.toArray())[0];
  const base = { lastName: "X", employeeNumber: "", categoryId: cat.id, jobTitle: "", email: "", phone: "", shiftId: shift.id, isTeaching: true, entryRule: "fixed" as const, isActive: true, hiredOn: "", adminNotes: "" };
  const maria = await saveStaff(db, { ...base, firstName: "María", lastName: "López" }, week);
  const juan = await saveStaff(db, { ...base, firstName: "Juan", lastName: "Pérez" }, week);
  await saveGroup(db, { name: "2A", grade: "2", shiftId: shift.id, isActive: true });
  await saveGroup(db, { name: "1B", grade: "1", shiftId: shift.id, isActive: true });
  await saveSubject(db, { name: "Matemáticas", shortName: "Mat", isActive: true });
  await saveSubject(db, { name: "Español", shortName: "Esp", isActive: true });
  const groups = await db.groups.toArray();
  const subjects = await db.subjects.toArray();
  const acts = await db.activityTypes.toArray();
  const periods = await db.periods.toArray();
  ids = {
    year: (await db.schoolYears.toArray())[0].id, maria, juan,
    g2A: groups.find((g) => g.name === "2A")!.id, g1B: groups.find((g) => g.name === "1B")!.id,
    mate: subjects.find((s) => s.name === "Matemáticas")!.id, espa: subjects.find((s) => s.name === "Español")!.id,
    clase: acts.find((a) => a.name === "Clase")!.id, tutoria: acts.find((a) => a.name === "Tutoría")!.id,
    p1: periods.find((p) => p.name === "1ª")!.id, p3: periods.find((p) => p.name === "3ª")!.id, receso: periods.find((p) => p.name === "Receso")!.id,
  };
});

const clase = (o: Partial<Parameters<typeof saveAssignment>[1]> = {}): Parameters<typeof saveAssignment>[1] => ({
  schoolYearId: ids.year, staffId: ids.maria, weekday: 2, periodId: ids.p3, groupId: ids.g2A, subjectId: ids.mate, activityTypeId: ids.clase, allowShared: false, ...o,
});

describe("horario docente", () => {
  it("guarda una clase y deriva el horario por grupo consultando la misma tabla", async () => {
    await saveAssignment(db, clase());
    const del2A = await db.assignments.where("groupId").equals(ids.g2A).toArray();
    expect(del2A).toHaveLength(1);
    expect(del2A[0]).toMatchObject({ staffId: ids.maria, weekday: 2, periodId: ids.p3, subjectId: ids.mate });
    expect(await db.assignments.count()).toBe(1); // una sola fuente, sin copia por grupo
  });

  it("una clase exige grupo y materia; una tutoría no", async () => {
    await expect(saveAssignment(db, clase({ groupId: "", subjectId: "" }))).rejects.toThrow("grupo y materia");
    await saveAssignment(db, clase({ groupId: "", subjectId: "", activityTypeId: ids.tutoria }));
    expect(await db.assignments.count()).toBe(1);
  });

  it("mismo docente en el mismo periodo: mensaje claro, reemplazar su misma celda sí se permite", async () => {
    await saveAssignment(db, clase());
    await saveAssignment(db, clase({ groupId: ids.g1B, subjectId: ids.espa })); // editar la misma celda
    expect(await db.assignments.count()).toBe(1);
    expect((await db.assignments.toArray())[0].groupId).toBe(ids.g1B);
  });

  it("dos docentes en el mismo grupo y periodo: rechaza salvo clase compartida", async () => {
    await saveAssignment(db, clase());
    await expect(saveAssignment(db, clase({ staffId: ids.juan, subjectId: ids.espa }))).rejects.toThrow("ya tiene a María López en la 3ª hora del martes");
    await saveAssignment(db, clase({ staffId: ids.juan, subjectId: ids.espa, allowShared: true }));
    expect(await db.assignments.count()).toBe(2);
  });

  it("rechaza receso y personal inactivo sin confirmación", async () => {
    await expect(saveAssignment(db, clase({ periodId: ids.receso }))).rejects.toThrow("receso");
    const p = (await db.staff.get(ids.juan))!;
    await db.staff.put({ ...p, isActive: false });
    await expect(saveAssignment(db, clase({ staffId: ids.juan }))).rejects.toThrow("inactivo");
    await saveAssignment(db, clase({ staffId: ids.juan, confirmInactive: true }));
  });

  it("quitar una celda la elimina y deja auditoría", async () => {
    await saveAssignment(db, clase());
    await clearAssignment(db, ids.year, ids.maria, 2, ids.p3);
    expect(await db.assignments.count()).toBe(0);
    const audit = await db.audit.where("table").equals("assignments").toArray();
    expect(audit.map((a) => a.action).sort()).toEqual(["create", "deactivate"]);
  });

  it("grupos y materias no se repiten ni con otro uso de acentos o mayúsculas", async () => {
    await expect(saveSubject(db, { name: "matematicas", shortName: "", isActive: true })).rejects.toThrow("Ya existe");
    await expect(saveGroup(db, { name: "2a", grade: "", shiftId: "", isActive: true })).rejects.toThrow("Ya existe");
  });
});

describe("importación de horarios", () => {
  const header = "docente,dia,periodo,grupo,materia,actividad\n";

  it("la plantilla descargable es un archivo válido en cuanto a columnas", async () => {
    const preview = await previewScheduleImport(db, scheduleTemplateCsv(), ids.year);
    // la plantilla de ejemplo usa datos que sí existen (María, 2A, Matemáticas): debe pasar
    expect(preview.errors).toEqual([]);
    expect(preview.rows).toHaveLength(2);
  });

  it("valida y reporta por línea, sin guardar nada", async () => {
    const csv = header + [
      "María López,Lunes,1ª,2A,Matemáticas,Clase",
      "Nadie Existe,Lunes,1ª,2A,Matemáticas,Clase",
      "María López,Sábado,1ª,2A,Matemáticas,Clase",
      "María López,Lunes,9ª,2A,Matemáticas,Clase",
      "María López,Lunes,Receso,,,Tutoría",
      "María López,Martes,1ª,5Z,Matemáticas,Clase",
      "María López,Martes,2ª,2A,Física,Clase",
      "María López,Martes,2ª,2A,,Clase",
      "María López,Lunes,1ª,1B,Español,Clase",
      "Juan Pérez,Lunes,1ª,2A,Español,Clase",
    ].join("\n");
    const p = await previewScheduleImport(db, csv, ids.year);
    const msgs = p.errors.map((e) => `${e.line}:${e.message}`);
    expect(msgs[0]).toContain("3:El docente «Nadie Existe» no existe");
    expect(msgs.some((m) => m.startsWith("4:") && m.includes("día"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("5:") && m.includes("periodo"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("6:") && m.includes("receso"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("7:") && m.includes("grupo «5Z»"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("8:") && m.includes("materia «Física»"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("9:") && m.includes("grupo y materia"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("10:") && m.includes("ya aparece en la línea 2"))).toBe(true);
    expect(msgs.some((m) => m.startsWith("11:") && m.includes("grupo 2A ya tiene docente en la línea 2"))).toBe(true);
    expect(await db.assignments.count()).toBe(0);
    await expect(applyScheduleImport(db, p, ids.year)).rejects.toThrow("Corrige");
  });

  it("detecta columnas faltantes y choques con lo ya guardado", async () => {
    expect((await previewScheduleImport(db, "a,b\n1,2", ids.year)).errors[0].message).toContain("Faltan columnas");
    await saveAssignment(db, clase({ weekday: 1, periodId: ids.p1 }));
    const p = await previewScheduleImport(db, header + "Juan Pérez,Lunes,1ª,2A,Español,Clase", ids.year);
    expect(p.errors[0].message).toContain("ya tiene a María López");
  });

  it("aplica un archivo válido, tolera acentos/mayúsculas/punto y coma y reemplaza la celda existente", async () => {
    await saveAssignment(db, clase({ weekday: 1, periodId: ids.p1 }));
    const csv = "docente;dia;periodo;grupo;materia;actividad\nmaria lopez;lunes;1ª;1b;ESPAÑOL;\nMaría López;Martes;3ª;;;Tutoría";
    const p = await previewScheduleImport(db, csv, ids.year);
    expect(p.errors).toEqual([]);
    expect(await applyScheduleImport(db, p, ids.year)).toBe(2);
    const all = await db.assignments.toArray();
    expect(all).toHaveLength(2);
    expect(all.find((a) => a.weekday === 1)?.groupId).toBe(ids.g1B);
  });
});

describe("respaldo con horarios", () => {
  it("restaura horarios y acepta respaldos antiguos sin las tablas nuevas", async () => {
    await saveAssignment(db, clase());
    const backup = await exportBackup(db);
    const other = new AppDb(`sched-restore-${n}`);
    await restoreBackup(other, parseBackup(JSON.stringify(backup)));
    expect(await other.assignments.count()).toBe(1);
    expect(await other.groups.count()).toBe(2);

    const old = JSON.parse(JSON.stringify(backup));
    for (const t of ["groups", "subjects", "activityTypes", "assignments"]) delete old.tables[t];
    const third = new AppDb(`sched-old-${n}`);
    await restoreBackup(third, parseBackup(JSON.stringify(old)));
    expect(await third.staff.count()).toBe(2);
    expect(await third.assignments.count()).toBe(0);
  });
});
