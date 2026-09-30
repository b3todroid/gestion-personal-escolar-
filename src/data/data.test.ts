import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { AppDb } from "./db";
import { createSchoolSetup, type SetupInput } from "./setup";
import { loadWorkWeek, matchesQuery, saveStaff, type StaffInput } from "./staff";
import { saveCategory } from "./categories";
import { exportBackup, parseBackup, restoreBackup } from "./backup";
import type { WorkDayInput } from "@/domain/workSchedule";

let database: AppDb;
let n = 0;

const setup: SetupInput = {
  schoolName: "Escuela Demo", cct: "", educationLevel: "", address: "", schoolZone: "", directorName: "", subdirectorName: "",
  yearName: "2026-2027", yearStart: "2026-08-31", yearEnd: "2027-07-15", timezone: "America/Mexico_City", toleranceMinutes: 0,
  shiftKind: "matutino", shiftName: "Matutino",
  periods: [
    { name: "1ª", startsAt: "07:30", endsAt: "08:20", kind: "class" },
    { name: "2ª", startsAt: "08:20", endsAt: "09:10", kind: "class" },
  ],
};

const week: WorkDayInput[] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, works: weekday !== 5, startsAt: weekday === 5 ? "" : "07:30", endsAt: weekday === 5 ? "" : "14:00" }));

async function staffInput(overrides: Partial<StaffInput> = {}): Promise<StaffInput> {
  const cat = (await database.categories.toArray()).find((c) => c.name === "UDEEI")!;
  const shift = (await database.shifts.toArray())[0];
  return { firstName: "María", lastName: "López", employeeNumber: "", categoryId: cat.id, jobTitle: "", email: "", phone: "", shiftId: shift.id, isTeaching: false, entryRule: "fixed", isActive: true, hiredOn: "", adminNotes: "", ...overrides };
}

beforeEach(async () => {
  database = new AppDb(`test-${++n}`);
  await createSchoolSetup(database, setup);
});

describe("setup", () => {
  it("crea escuela, ciclo, turno, periodos y categorías", async () => {
    expect((await database.settings.get("main"))?.schoolName).toBe("Escuela Demo");
    expect(await database.periods.count()).toBe(2);
    expect(await database.categories.count()).toBe(12);
    expect((await database.schoolYears.toArray())[0].isCurrent).toBe(true);
  });
  it("no permite configurar dos veces ni datos inválidos", async () => {
    await expect(createSchoolSetup(database, setup)).rejects.toThrow("ya fue configurada");
    const other = new AppDb(`test-bad-${n}`);
    await expect(createSchoolSetup(other, { ...setup, toleranceMinutes: -1 })).rejects.toThrow("tolerancia");
    expect(await other.settings.count()).toBe(0);
  });
});

describe("personal", () => {
  it("guarda persona con horario laboral, incluido un día «No labora», y audita el alta", async () => {
    const id = await saveStaff(database, await staffInput(), week);
    const saved = await loadWorkWeek(database, id);
    expect(saved?.find((d) => d.weekday === 5)?.works).toBe(false);
    expect(saved?.find((d) => d.weekday === 1)).toMatchObject({ startsAt: "07:30", endsAt: "14:00" });
    const audit = await database.audit.where("recordId").equals(id).toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("create");
  });

  it("modificar deja historial con antes y después; desactivar se registra como tal", async () => {
    const id = await saveStaff(database, await staffInput(), week);
    await saveStaff(database, { ...(await staffInput()), id, jobTitle: "Titular" }, week);
    await saveStaff(database, { ...(await staffInput()), id, jobTitle: "Titular", isActive: false }, week);
    const audit = (await database.audit.where("recordId").equals(id).toArray()).sort((a, b) => a.at.localeCompare(b.at));
    expect(audit.map((a) => a.action)).toEqual(["create", "update", "deactivate"]);
    expect((audit[1].before as { jobTitle: string }).jobTitle).toBe("");
    expect((audit[1].after as { jobTitle: string }).jobTitle).toBe("Titular");
  });

  it("rechaza número de empleado repetido con mensaje claro", async () => {
    await saveStaff(database, await staffInput({ employeeNumber: "123" }), week);
    await expect(saveStaff(database, await staffInput({ firstName: "Juan", employeeNumber: "123" }), week)).rejects.toThrow("María López");
  });

  it("exige horario laboral completo salvo docentes que entran con su primera actividad", async () => {
    await expect(saveStaff(database, await staffInput(), week.map((d) => ({ ...d, startsAt: "", endsAt: "" })))).rejects.toThrow();
    const blank = week.map((d) => ({ ...d, startsAt: "", endsAt: "" }));
    const id = await saveStaff(database, await staffInput({ isTeaching: true, entryRule: "first_activity" }), blank);
    expect(await loadWorkWeek(database, id)).toBeNull();
  });

  it("búsqueda tolerante a acentos, mayúsculas y orden de palabras", () => {
    expect(matchesQuery("María López Hernández", "lopez maria")).toBe(true);
    expect(matchesQuery("María López Hernández", "MARI")).toBe(true);
    expect(matchesQuery("María López Hernández", "pérez")).toBe(false);
  });
});

describe("categorías", () => {
  it("no permite nombres repetidos (sin importar mayúsculas)", async () => {
    await expect(saveCategory(database, { name: "udeei", isTeaching: false, isActive: true })).rejects.toThrow("Ya existe");
    await saveCategory(database, { name: "Laboratorio", isTeaching: false, isActive: true });
    expect(await database.categories.count()).toBe(13);
  });
});

describe("respaldo", () => {
  it("exporta y restaura exactamente los mismos datos", async () => {
    const id = await saveStaff(database, await staffInput(), week);
    const backup = await exportBackup(database);
    const other = new AppDb(`test-restore-${n}`);
    await restoreBackup(other, parseBackup(JSON.stringify(backup)));
    expect((await other.staff.get(id))?.fullName).toBe("María López");
    expect(await other.workDays.count()).toBe(5);
    expect(await other.periods.count()).toBe(2);
  });
  it("rechaza archivos que no son respaldos", () => {
    expect(() => parseBackup("hola")).toThrow("no es un respaldo");
    expect(() => parseBackup(JSON.stringify({ app: "otra" }))).toThrow("no es un respaldo de esta aplicación");
  });
});

describe("configuración", () => {
  it("editar periodos conserva el id de los existentes, respeta el nuevo orden y audita", async () => {
    const shift = (await database.shifts.toArray())[0];
    const before = await database.periods.where("shiftId").equals(shift.id).sortBy("position");
    const [p1, p2] = before;
    const { savePeriods } = await import("./settings");
    await savePeriods(database, shift.id, [
      { id: p2.id, name: "2ª", startsAt: "08:20", endsAt: "09:10", kind: "class" },
      { id: p1.id, name: "1ª", startsAt: "07:30", endsAt: "08:20", kind: "class" },
      { name: "Receso", startsAt: "09:10", endsAt: "09:30", kind: "break" },
    ]);
    const after = await database.periods.where("shiftId").equals(shift.id).sortBy("position");
    expect(after.map((p) => p.name)).toEqual(["2ª", "1ª", "Receso"]);
    expect(after[0].id).toBe(p2.id);
    expect((await database.audit.where("table").equals("periods").toArray()).length).toBe(1);
  });
  it("no guarda periodos traslapados ni tolerancia negativa", async () => {
    const { savePeriods, saveSettings } = await import("./settings");
    const shift = (await database.shifts.toArray())[0];
    await expect(savePeriods(database, shift.id, [
      { name: "A", startsAt: "07:30", endsAt: "08:30", kind: "class" },
      { name: "B", startsAt: "08:00", endsAt: "09:00", kind: "class" },
    ])).rejects.toThrow("se traslapan");
    const s = (await database.settings.get("main"))!;
    await expect(saveSettings(database, { ...s, toleranceMinutes: -3 })).rejects.toThrow("tolerancia");
    expect((await database.periods.count())).toBe(2);
  });
});
