import { describe, expect, it } from "vitest";
import { validatePeriods, type PeriodInput } from "./periods";
import { copyDayToAll, emptyWeek, validateWorkWeek } from "./workSchedule";
import { isValidTime, toMinutes } from "./time";

const p = (name: string, startsAt: string, endsAt: string): PeriodInput => ({ name, startsAt, endsAt, kind: "class" });

describe("time", () => {
  it("valida formato HH:MM", () => {
    expect(isValidTime("07:30")).toBe(true);
    expect(isValidTime("7:30")).toBe(false);
    expect(isValidTime("24:00")).toBe(false);
    expect(toMinutes("07:47")).toBe(467);
  });
});

describe("validatePeriods", () => {
  it("acepta periodos consecutivos", () => {
    expect(validatePeriods([p("1ª", "07:30", "08:20"), p("2ª", "08:20", "09:10")])).toEqual([]);
  });
  it("rechaza lista vacía, nombre vacío, fin <= inicio y horas inválidas", () => {
    expect(validatePeriods([])).toEqual(["Agrega al menos un periodo."]);
    expect(validatePeriods([p("", "07:30", "08:20")])[0]).toContain("nombre");
    expect(validatePeriods([p("1ª", "08:20", "08:20")])[0]).toContain("posterior");
    expect(validatePeriods([p("1ª", "25:00", "26:00")])[0]).toContain("horas válidas");
  });
  it("detecta traslapes aunque vengan desordenados", () => {
    expect(validatePeriods([p("2ª", "08:00", "09:00"), p("1ª", "07:30", "08:20")])).toEqual(["1ª y 2ª se traslapan."]);
  });
});

describe("workSchedule", () => {
  it("una semana en blanco no es válida (no se asume horario)", () => {
    expect(validateWorkWeek(emptyWeek()).length).toBe(5);
  });
  it("«No labora» no exige horas", () => {
    const week = emptyWeek().map((d) => ({ ...d, works: false }));
    expect(validateWorkWeek(week)).toEqual([]);
  });
  it("rechaza salida anterior a la entrada", () => {
    const week = emptyWeek().map((d) => ({ ...d, works: d.weekday === 1, startsAt: "14:00", endsAt: "07:30" }));
    expect(validateWorkWeek(week)[0]).toContain("Lunes");
  });
  it("copiar un día a todos respeta el horario fuente", () => {
    const week = emptyWeek().map((d) => (d.weekday === 1 ? { ...d, startsAt: "07:30", endsAt: "14:00" } : d));
    const copied = copyDayToAll(week, 1);
    expect(copied.every((d) => d.startsAt === "07:30" && d.endsAt === "14:00")).toBe(true);
    expect(validateWorkWeek(copied)).toEqual([]);
  });
});
