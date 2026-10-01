import type { AppDb } from "./db";
import { createSchoolSetup, type SetupInput } from "./setup";
import { saveStaff } from "./staff";
import { saveGroup, saveSubject } from "./catalogs";
import { saveAssignment } from "./schedule";
import { expectedFor, registerEntry } from "./attendance";
import { saveIncident } from "./incidents";
import { assignCoverage, loadAvailability } from "./coverage";
import { addDays, nowTimeIn, todayIn, weekdayOf } from "@/domain/dates";
import { toMinutes } from "@/domain/time";
import type { WorkDayInput } from "@/domain/workSchedule";

const TZ = "America/Mexico_City";
const week = (start: string, end: string): WorkDayInput[] => [1, 2, 3, 4, 5].map((weekday) => ({ weekday, works: true, startsAt: start, endsAt: end }));
const minutesToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const TEACHERS = ["Ana Hernández", "Luis Martínez", "Carmen López", "Jorge Ramírez", "Patricia Sánchez", "Roberto Flores", "Laura Torres", "Miguel Ángel Cruz", "Sofía Morales", "Daniel Ortega"];
const SUBJECTS: [string, string][] = [["Español", "Esp"], ["Matemáticas", "Mat"], ["Ciencias", "Cie"], ["Historia", "His"], ["Inglés", "Ing"], ["Educación Física", "EdF"]];

/** Datos ficticios para probar y capacitar. Solo debe usarse en una base de datos aparte. */
export async function seedDemo(database: AppDb, now: Date = new Date()): Promise<void> {
  const today = todayIn(TZ, now);
  const y = Number(today.slice(0, 4));
  const startYear = Number(today.slice(5, 7)) >= 8 ? y : y - 1;
  const setup: SetupInput = {
    schoolName: "Escuela Demo", cct: "00XXX0000X", educationLevel: "Secundaria", address: "", schoolZone: "", directorName: "Director(a) Demo", subdirectorName: "",
    yearName: `${startYear}-${startYear + 1}`, yearStart: `${startYear}-08-25`, yearEnd: `${startYear + 1}-07-15`, timezone: TZ, toleranceMinutes: 0,
    shiftKind: "matutino", shiftName: "Matutino",
    periods: [
      { name: "1ª", startsAt: "07:30", endsAt: "08:20", kind: "class" }, { name: "2ª", startsAt: "08:20", endsAt: "09:10", kind: "class" },
      { name: "3ª", startsAt: "09:10", endsAt: "10:00", kind: "class" }, { name: "Receso", startsAt: "10:00", endsAt: "10:20", kind: "break" },
      { name: "4ª", startsAt: "10:20", endsAt: "11:10", kind: "class" }, { name: "5ª", startsAt: "11:10", endsAt: "12:00", kind: "class" },
      { name: "6ª", startsAt: "12:00", endsAt: "12:50", kind: "class" },
    ],
  };
  await createSchoolSetup(database, setup);
  const cats = await database.categories.toArray();
  const cat = (n: string) => cats.find((c) => c.name === n)!.id;
  const shift = (await database.shifts.toArray())[0].id;
  const base = { employeeNumber: "", jobTitle: "", email: "", phone: "", shiftId: shift, isActive: true, hiredOn: "", adminNotes: "" };
  const person = (full: string, category: string, teaching: boolean, w: WorkDayInput[]) => {
    const [firstName, ...rest] = full.split(" ");
    return saveStaff(database, { ...base, firstName, lastName: rest.join(" ") || "Demo", categoryId: cat(category), isTeaching: teaching, entryRule: teaching ? "first_activity" : "fixed" }, w);
  };

  const teachers: string[] = [];
  for (const t of TEACHERS) teachers.push(await person(t, "Docente", true, week("07:30", "13:00")));
  const udeei = [await person("Elena Vargas", "UDEEI", false, week("07:30", "13:30")), await person("Raúl Medina", "UDEEI", false, week("07:30", "13:30"))];
  await person("Gabriela Ríos", "Orientación", false, week("07:30", "13:30"));
  await person("Héctor Salazar", "Orientación", false, week("08:00", "14:00"));
  await person("Mónica Fuentes", "Administrativo", false, week("07:30", "14:30"));
  await person("Iván Castillo", "Administrativo", false, week("07:30", "14:30"));
  await person("Teresa Aguilar", "Trabajo Social", false, week("08:00", "14:00"));

  const groupNames = ["1A", "1B", "2A", "2B", "3A", "3B"];
  for (const g of groupNames) await saveGroup(database, { name: g, grade: g[0], shiftId: shift, isActive: true });
  for (const [name, shortName] of SUBJECTS) await saveSubject(database, { name, shortName, isActive: true });
  const groups = await database.groups.toArray();
  const subjects = await database.subjects.toArray();
  const clase = (await database.activityTypes.toArray()).find((a) => a.name === "Clase")!.id;
  const periods = (await database.periods.toArray()).filter((p) => p.kind === "class").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const year = (await database.schoolYears.toArray())[0].id;

  // Cuadro latino: en cada día y periodo, cada grupo tiene un docente distinto y nadie se repite.
  for (let d = 1; d <= 5; d++) {
    for (let k = 0; k < periods.length; k++) {
      for (let g = 0; g < groups.length; g++) {
        const t = (g + k + d) % teachers.length;
        await saveAssignment(database, { schoolYearId: year, staffId: teachers[t], weekday: d, periodId: periods[k].id, groupId: groups[g].id, subjectId: subjects[t % subjects.length].id, activityTypeId: clase, allowShared: false });
      }
    }
  }

  // Días hábiles recientes (los más nuevos primero) dentro del ciclo.
  const past: string[] = [];
  for (let i = 1; past.length < 10 && i < 40; i++) {
    const d = addDays(today, -i);
    if (d < setup.yearStart) break;
    if (weekdayOf(d) <= 5) past.push(d);
  }
  const types = await database.incidentTypes.toArray();
  const type = (n: string) => types.find((t) => t.name === n)!.id;
  const full = (staffId: string, typeName: string, start: string, end = start) => saveIncident(database, { staffId, typeId: type(typeName), startDate: start, endDate: end, scope: "full_day", periodIds: [], startTime: "", endTime: "", notes: "Dato de demostración" });
  const incidentDays = new Map<string, Set<string>>();
  const mark = (id: string, from: string, to: string) => { const s = incidentDays.get(id) ?? new Set(); for (let d = from; d <= to; d = addDays(d, 1)) s.add(d); incidentDays.set(id, s); };

  if (past.length >= 5) {
    await full(teachers[2], "Inasistencia", past[1]); mark(teachers[2], past[1], past[1]);
    await full(teachers[4], "Permiso económico", past[3]); mark(teachers[4], past[3], past[3]);
    await full(teachers[6], "Licencia médica", past[4], past[3]); mark(teachers[6], past[4], past[3]);
    // Una de las clases afectadas por la falta queda cubierta; el resto queda pendiente.
    const affected = (await database.affected.where("staffId").equals(teachers[2]).toArray()).sort((a, b) => a.periodId.localeCompare(b.periodId));
    for (const a of affected) {
      if (!a.isClass) continue;
      const c = await loadAvailability(database, a.id);
      if (c[0]) { await assignCoverage(database, a.id, c[0].staffId); break; }
    }
  }

  // Entradas: la mayoría a tiempo, algunos retardos; UDEEI llega 07:43 (13 min tarde) el día más reciente.
  const everyone = await database.staff.toArray();
  const nowTime = nowTimeIn(TZ, now);
  const days = weekdayOf(today) <= 5 ? [today, ...past] : past;
  for (let di = 0; di < days.length; di++) {
    const date = days[di];
    for (let si = 0; si < everyone.length; si++) {
      const s = everyone[si];
      if (incidentDays.get(s.id)?.has(date)) continue;
      if (date === today && si % 3 === 2) continue; // algunos quedan «sin registro» hoy
      try {
        const exp = (await expectedFor(database, s.id, date)).time;
        if (!exp || (date === today && toMinutes(exp) + 20 > toMinutes(nowTime))) continue;
        let late = (si * 7 + di * 3) % 11 === 0 ? 5 + ((si + di) % 14) : 0;
        if (date === past[0] && s.id === udeei[0]) late = 13;
        await registerEntry(database, { staffId: s.id, date, arrivedTime: minutesToTime(toMinutes(exp) + late) });
      } catch { /* sin horario ese día: se omite */ }
    }
  }
}
