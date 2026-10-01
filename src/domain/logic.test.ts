import { describe, expect, it } from "vitest";
import { addDays, eachDate, formatDate, formatLongDate, isValidIsoDate, nowTimeIn, presetRange, todayIn, validateRange, weekdayOf } from "./dates";
import { computeLateness, expectedEntry } from "./attendance";
import { findAffectedSlots, incidentsOverlap, incidentSpans, validateIncident, workingDays, type IncidentLike, type PeriodLite } from "./incidents";
import { findAvailableStaff, unavailableReason, type StaffForCoverage } from "./coverage";
import { dayStatus } from "./dayStatus";

describe("fechas", () => {
  it("valida fechas reales (no 31 de febrero)", () => {
    expect(isValidIsoDate("2026-09-30")).toBe(true);
    expect(isValidIsoDate("2026-02-31")).toBe(false);
    expect(isValidIsoDate("2026-9-3")).toBe(false);
  });
  it("día de la semana y sumas de días cruzando mes y año", () => {
    expect(weekdayOf("2026-09-29")).toBe(2); // martes
    expect(weekdayOf("2026-10-04")).toBe(7); // domingo
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });
  it("eachDate incluye ambos extremos y rechaza rangos inválidos", () => {
    expect(eachDate("2026-10-01", "2026-10-05")).toHaveLength(5);
    expect(eachDate("2026-10-05", "2026-10-01")).toEqual([]);
    expect(validateRange("2026-10-05", "2026-10-01")).toContain("no puede ser anterior");
    expect(validateRange("2026-10-01", "2026-10-05")).toBeNull();
  });
  it("hoy y hora en la zona horaria de la escuela (no la del aparato)", () => {
    const d = new Date("2026-09-30T03:30:00Z"); // 29/sep 21:30 en Ciudad de México
    expect(todayIn("America/Mexico_City", d)).toBe("2026-09-29");
    expect(nowTimeIn("America/Mexico_City", d)).toBe("21:30");
    expect(todayIn("UTC", d)).toBe("2026-09-30");
  });
  it("formatos en español", () => {
    expect(formatDate("2026-09-01")).toBe("01/09/2026");
    expect(formatLongDate("2026-09-29")).toBe("martes 29 de septiembre de 2026");
  });
  it("los accesos rápidos se convierten a fechaDesde/fechaHasta", () => {
    expect(presetRange("hoy", "2026-09-29")).toEqual({ from: "2026-09-29", to: "2026-09-29" });
    expect(presetRange("semana", "2026-09-29")).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(presetRange("mes", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetRange("mes", "2028-02-10").to).toBe("2028-02-29");
    expect(presetRange("ciclo", "2026-09-29", { startsOn: "2026-08-31", endsOn: "2027-07-15" })).toEqual({ from: "2026-08-31", to: "2027-07-15" });
  });
});

describe("retardos", () => {
  it("criterio 9-10: esperada 07:30, llegó 07:43 → 13 minutos; 07:47 → 17", () => {
    expect(computeLateness("07:30", "07:43", 0)).toEqual({ status: "late", lateMinutes: 13 });
    expect(computeLateness("07:30", "07:47", 0)).toEqual({ status: "late", lateMinutes: 17 });
  });
  it("a tiempo, antes de tiempo y justo en la hora", () => {
    expect(computeLateness("07:30", "07:30", 0)).toEqual({ status: "on_time", lateMinutes: 0 });
    expect(computeLateness("07:30", "07:10", 0)).toEqual({ status: "on_time", lateMinutes: 0 });
  });
  it("tolerancia: dentro es a tiempo; al excederla se cuenta desde la hora esperada", () => {
    expect(computeLateness("07:30", "07:35", 5).status).toBe("on_time");
    expect(computeLateness("07:30", "07:36", 5)).toEqual({ status: "late", lateMinutes: 6 });
  });
  it("nunca minutos negativos y rechaza entradas inválidas", () => {
    expect(computeLateness("07:30", "06:00", 0).lateMinutes).toBe(0);
    expect(() => computeLateness("07:30", "7:5", 0)).toThrow();
    expect(() => computeLateness("07:30", "07:40", -1)).toThrow();
  });
  it("hora esperada: fija, primera actividad o no labora", () => {
    const workDays = [{ weekday: 1, works: true, startsAt: "07:30" }, { weekday: 2, works: false, startsAt: "" }];
    expect(expectedEntry({ weekday: 1, isTeaching: false, entryRule: "fixed", workDays, activityStarts: [] })).toEqual({ time: "07:30", source: "fixed" });
    expect(expectedEntry({ weekday: 2, isTeaching: false, entryRule: "fixed", workDays, activityStarts: [] }).source).toBe("no_work");
    expect(expectedEntry({ weekday: 3, isTeaching: false, entryRule: "fixed", workDays, activityStarts: [] }).source).toBe("no_schedule");
    expect(expectedEntry({ weekday: 1, isTeaching: true, entryRule: "first_activity", workDays: [], activityStarts: ["09:10", "08:20", "10:20"] })).toEqual({ time: "08:20", source: "first_activity" });
    expect(expectedEntry({ weekday: 1, isTeaching: true, entryRule: "first_activity", workDays: [], activityStarts: [] }).time).toBeNull();
  });
});

const periods: PeriodLite[] = [
  { id: "p1", name: "1ª", startsAt: "07:30", endsAt: "08:20", kind: "class" },
  { id: "p2", name: "2ª", startsAt: "08:20", endsAt: "09:10", kind: "class" },
  { id: "p3", name: "3ª", startsAt: "09:10", endsAt: "10:00", kind: "class" },
  { id: "p4", name: "4ª", startsAt: "10:00", endsAt: "10:50", kind: "class" },
  { id: "rec", name: "Receso", startsAt: "10:50", endsAt: "11:10", kind: "break" },
  { id: "p5", name: "5ª", startsAt: "11:10", endsAt: "12:00", kind: "class" },
  { id: "p6", name: "6ª", startsAt: "12:00", endsAt: "12:50", kind: "class" },
];
const inc = (o: Partial<IncidentLike> = {}): IncidentLike => ({ startDate: "2026-10-06", endDate: "2026-10-06", scope: "full_day", periodIds: [], startTime: "", endTime: "", ...o });

describe("incidencias de varios días", () => {
  const workMonToFri = (wd: number) => wd >= 1 && wd <= 5;
  it("criterio 18: licencia del 1 al 5 de octubre de 2026 (jue a lun) = 3 días laborales, salta fin de semana", () => {
    // 1 oct 2026 = jueves; 2 vie; 3 sáb; 4 dom; 5 lun
    const days = workingDays({ startDate: "2026-10-01", endDate: "2026-10-05", worksOnWeekday: workMonToFri, holidays: new Set() });
    expect(days).toEqual(["2026-10-01", "2026-10-02", "2026-10-05"]);
  });
  it("excluye días no laborables y respeta el horario de la persona", () => {
    const days = workingDays({ startDate: "2026-10-05", endDate: "2026-10-09", worksOnWeekday: (w) => w !== 3, holidays: new Set(["2026-10-08"]) });
    expect(days).toEqual(["2026-10-05", "2026-10-06", "2026-10-09"]);
  });
  it("se recorta al rango del reporte", () => {
    const days = workingDays({ startDate: "2026-09-28", endDate: "2026-10-02", worksOnWeekday: workMonToFri, holidays: new Set(), clip: { from: "2026-10-01", to: "2026-10-31" } });
    expect(days).toEqual(["2026-10-01", "2026-10-02"]);
  });
  it("valida rangos y horas", () => {
    expect(validateIncident(inc({ startDate: "2026-10-07", endDate: "2026-10-06" }), periods)[0]).toContain("fecha final");
    expect(validateIncident(inc({ scope: "periods" }), periods)[0]).toContain("al menos un periodo");
    expect(validateIncident(inc({ scope: "time_range", startTime: "10:00", endTime: "09:00" }), periods)[0]).toContain("hora final");
    expect(validateIncident(inc({ scope: "time_range", startTime: "9", endTime: "10:00" }), periods)[0]).toContain("hora inicial");
    expect(validateIncident(inc(), periods)).toEqual([]);
  });
});

describe("clases afectadas", () => {
  const assignments = [
    { id: "a3", weekday: 2, periodId: "p3", groupId: "2A", subjectId: "mat", activityTypeId: "clase" },
    { id: "a4", weekday: 2, periodId: "p4", groupId: "1B", subjectId: "mat", activityTypeId: "clase" },
    { id: "a5", weekday: 2, periodId: "p5", groupId: "3A", subjectId: "mat", activityTypeId: "clase" },
    { id: "a6", weekday: 2, periodId: "p6", groupId: "3B", subjectId: "mat", activityTypeId: "clase" },
    { id: "m1", weekday: 3, periodId: "p1", groupId: "2A", subjectId: "mat", activityTypeId: "clase" },
  ];
  const tue = "2026-10-06"; // martes
  it("ejemplo del documento: 09:10 a 11:30 afecta 3ª, 4ª y 5ª (no la 6ª)", () => {
    const r = findAffectedSlots({ incident: inc({ scope: "time_range", startTime: "09:10", endTime: "11:30" }), days: [tue], assignments, periods });
    expect(r.map((s) => s.periodId)).toEqual(["p3", "p4", "p5"]);
  });
  it("día completo afecta todas las actividades de ese día y ninguna de otros días", () => {
    const r = findAffectedSlots({ incident: inc(), days: [tue], assignments, periods });
    expect(r.map((s) => s.periodId)).toEqual(["p3", "p4", "p5", "p6"]);
  });
  it("periodos elegidos y traslape parcial (hora que cae a la mitad de una clase)", () => {
    expect(findAffectedSlots({ incident: inc({ scope: "periods", periodIds: ["p4"] }), days: [tue], assignments, periods }).map((s) => s.groupId)).toEqual(["1B"]);
    expect(findAffectedSlots({ incident: inc({ scope: "time_range", startTime: "09:50", endTime: "10:05" }), days: [tue], assignments, periods }).map((s) => s.periodId)).toEqual(["p3", "p4"]);
    // justo al terminar una clase no la afecta
    expect(findAffectedSlots({ incident: inc({ scope: "time_range", startTime: "10:00", endTime: "10:30" }), days: [tue], assignments, periods }).map((s) => s.periodId)).toEqual(["p4"]);
  });
  it("varios días usan el horario de cada día de la semana", () => {
    const r = findAffectedSlots({ incident: inc({ startDate: tue, endDate: "2026-10-07" }), days: [tue, "2026-10-07"], assignments, periods });
    expect(r.filter((s) => s.date === "2026-10-07").map((s) => s.periodId)).toEqual(["p1"]);
    expect(r).toHaveLength(5);
  });
  it("un receso nunca cuenta como clase afectada", () => {
    const withBreak = [...assignments, { id: "r", weekday: 2, periodId: "rec", groupId: "", subjectId: "", activityTypeId: "otro" }];
    expect(findAffectedSlots({ incident: inc(), days: [tue], assignments: withBreak, periods }).some((s) => s.periodId === "rec")).toBe(false);
  });
});

describe("incidencias que se empalman", () => {
  it("mismo día completo se empalma; días distintos no", () => {
    expect(incidentsOverlap(inc(), inc(), periods)).toBe(true);
    expect(incidentsOverlap(inc(), inc({ startDate: "2026-10-07", endDate: "2026-10-07" }), periods)).toBe(false);
  });
  it("rangos de horas distintos el mismo día no se empalman; solapados sí", () => {
    const a = inc({ scope: "time_range", startTime: "08:00", endTime: "09:00" });
    expect(incidentsOverlap(a, inc({ scope: "time_range", startTime: "09:00", endTime: "10:00" }), periods)).toBe(false);
    expect(incidentsOverlap(a, inc({ scope: "time_range", startTime: "08:30", endTime: "10:00" }), periods)).toBe(true);
    expect(incidentsOverlap(a, inc({ scope: "periods", periodIds: ["p2"] }), periods)).toBe(true);
    expect(incidentSpans(inc({ scope: "periods", periodIds: ["p1", "p2"] }), periods)).toHaveLength(2);
  });
});

describe("disponibles para cubrir", () => {
  const p3 = periods[2];
  const person = (id: string, o: Partial<StaffForCoverage> = {}): StaffForCoverage => ({
    id, isActive: true, isTeaching: false, entryRule: "fixed", work: { works: true, startsAt: "07:30", endsAt: "14:00" }, activities: [], ...o,
  });
  const find = (staff: StaffForCoverage[], withIncident: string[] = [], covering: string[] = []) =>
    findAvailableStaff({ period: p3, absentStaffId: "ausente", staff, withIncident: new Set(withIncident), alreadyCovering: new Set(covering) });

  it("incluye presentes sin actividad; marca hora libre", () => {
    const r = find([person("a"), person("b", { activities: [{ startsAt: "09:10", endsAt: "10:00", periodId: "p3", isFree: true }] })]);
    expect(r).toEqual([{ staffId: "a", kind: "available" }, { staffId: "b", kind: "free" }]);
  });
  it("excluye: con clase, con otra actividad, con incidencia, ya cubriendo, ausente, inactivo y fuera de horario", () => {
    const busy = [{ startsAt: "09:10", endsAt: "10:00", periodId: "p3", isFree: false }];
    const r = find(
      [person("clase", { activities: busy }), person("inc"), person("cub"), person("ausente"), person("off", { isActive: false }),
       person("tarde", { work: { works: true, startsAt: "10:30", endsAt: "14:00" } }), person("nolabora", { work: { works: false, startsAt: "", endsAt: "" } }), person("ok")],
      ["inc"], ["cub"],
    );
    expect(r.map((c) => c.staffId)).toEqual(["ok"]);
  });
  it("docente con primera actividad está presente entre su primera y última actividad", () => {
    const t = (id: string, acts: [string, string, string][]) => person(id, { isTeaching: true, entryRule: "first_activity", work: undefined, activities: acts.map(([s, e, p]) => ({ startsAt: s, endsAt: e, periodId: p, isFree: false })) });
    expect(find([t("a", [["07:30", "08:20", "p1"], ["11:10", "12:00", "p5"]])]).map((c) => c.staffId)).toEqual(["a"]);
    expect(find([t("b", [["10:00", "10:50", "p4"]])])).toEqual([]);
    expect(find([t("c", [["07:30", "08:20", "p1"]])])).toEqual([]);
  });
  it("explica por qué no está disponible", () => {
    const s = person("x", { activities: [{ startsAt: "09:10", endsAt: "10:00", periodId: "p3", isFree: false }] });
    expect(unavailableReason({ staff: s, period: p3, absentStaffId: "a", hasIncident: false, alreadyCovering: false })).toContain("otra actividad");
    expect(unavailableReason({ staff: person("y"), period: p3, absentStaffId: "a", hasIncident: true, alreadyCovering: false })).toContain("incidencia");
    expect(unavailableReason({ staff: person("z"), period: p3, absentStaffId: "a", hasIncident: false, alreadyCovering: false })).toBeNull();
  });
});

describe("estado del día", () => {
  it("la incidencia de día completo manda sobre la entrada", () => {
    expect(dayStatus({ expected: true, entryStatus: "on_time", fullDayCountsAs: "absence" })).toBe("absent");
    expect(dayStatus({ expected: true, fullDayCountsAs: "leave" })).toBe("leave");
  });
  it("entrada a tiempo, retardo, sin registro y no labora", () => {
    expect(dayStatus({ expected: true, entryStatus: "on_time" })).toBe("present");
    expect(dayStatus({ expected: true, entryStatus: "late" })).toBe("late");
    expect(dayStatus({ expected: true })).toBe("no_record");
    expect(dayStatus({ expected: false })).toBe("not_expected");
  });
});
