import type { AppDb } from "./db";
import type { AffectedClass, AttendanceEntry, Incident, Staff } from "./types";
import { getSettings, holidaySet, today } from "./context";
import { expectedFor } from "./attendance";
import { dayStatus, type DayStatus } from "@/domain/dayStatus";
import { nowTimeIn, weekdayOf } from "@/domain/dates";
import { toMinutes } from "@/domain/time";

export interface TodayRow {
  staff: Staff;
  expectedTime: string | null;
  status: DayStatus;
  entry?: AttendanceEntry;
  incidents: Incident[];
}

export interface TodayData {
  date: string;
  nowTime: string;
  isHoliday: boolean;
  holidayLabel: string;
  isWeekend: boolean;
  rows: TodayRow[];
  counts: { expected: number; withEntry: number; noRecord: number; late: number; absences: number; leaves: number; permits: number; certificates: number; incidents: number; affected: number; pending: number; covered: number };
  pendingClasses: AffectedClass[];
  overdue: TodayRow[];
}

export async function loadToday(database: AppDb, date?: string, nowTimeArg?: string): Promise<TodayData> {
  const settings = await getSettings(database);
  const d = date ?? (await today(database));
  const nowTime = nowTimeArg ?? nowTimeIn(settings.timezone);
  const holiday = (await database.holidays.where("date").equals(d).first());
  const isHoliday = !!holiday || (await holidaySet(database)).has(d);
  const isWeekend = weekdayOf(d) > 5;
  const staff = (await database.staff.toArray()).filter((s) => s.isActive);
  const types = new Map((await database.incidentTypes.toArray()).map((t) => [t.id, t]));
  const incidents = await database.incidents.filter((i) => i.status === "active" && i.startDate <= d && d <= i.endDate).toArray();
  const entries = new Map((await database.attendance.where("date").equals(d).filter((e) => !e.voidedAt).toArray()).map((e) => [e.staffId, e]));

  const rows: TodayRow[] = [];
  if (!isHoliday && !isWeekend) {
    for (const s of staff) {
      const exp = await expectedFor(database, s.id, d).catch(() => ({ time: null, source: "no_schedule" as const }));
      const mine = incidents.filter((i) => i.staffId === s.id);
      const fullDay = mine.find((i) => i.scope === "full_day");
      const entry = entries.get(s.id);
      const expected = !!exp.time;
      if (!expected && !entry && mine.length === 0) continue;
      const status = dayStatus({ expected, entryStatus: entry?.status, fullDayCountsAs: fullDay ? types.get(fullDay.typeId)?.countsAs : undefined });
      rows.push({ staff: s, expectedTime: exp.time ?? null, status, entry, incidents: mine });
    }
  }
  rows.sort((a, b) => a.staff.fullName.localeCompare(b.staff.fullName, "es"));

  const affected = await database.affected.where("date").equals(d).toArray();
  const pendingClasses = affected.filter((a) => a.isClass && a.coverageStatus === "uncovered");
  const nowMin = toMinutes(nowTime);
  const overdue = rows.filter((r) => r.status === "no_record" && r.expectedTime && toMinutes(r.expectedTime) + settings.toleranceMinutes < nowMin);

  const count = (s: DayStatus) => rows.filter((r) => r.status === s).length;
  return {
    date: d, nowTime, isHoliday, holidayLabel: holiday?.label ?? "", isWeekend, rows,
    counts: {
      expected: rows.filter((r) => r.status !== "not_expected").length,
      withEntry: rows.filter((r) => !!r.entry).length,
      noRecord: count("no_record"), late: count("late"), absences: count("absent"), leaves: count("leave"), permits: count("permit"), certificates: count("certificate"),
      incidents: incidents.length, affected: affected.filter((a) => a.isClass).length, pending: pendingClasses.length, covered: affected.filter((a) => a.coverageStatus === "covered").length,
    },
    pendingClasses, overdue,
  };
}
