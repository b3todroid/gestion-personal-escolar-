import type { AppDb } from "./db";
import type { AffectedClass, Coverage } from "./types";
import { logAudit } from "./audit";
import { assignmentsOfStaff, yearForDate } from "./context";
import { findAvailableStaff, unavailableReason, type Candidate, type StaffForCoverage } from "@/domain/coverage";
import { incidentSpans, type PeriodLite } from "@/domain/incidents";
import { weekdayOf, formatDate } from "@/domain/dates";
import { toMinutes } from "@/domain/time";

const TABLES = (d: AppDb) => [d.affected, d.coverages, d.staff, d.incidents, d.incidentTypes, d.workDays, d.assignments, d.periods, d.activityTypes, d.schoolYears, d.audit];

interface Context {
  row: AffectedClass;
  period: PeriodLite;
  staff: StaffForCoverage[];
  withIncident: Set<string>;
  alreadyCovering: Set<string>;
}

async function buildContext(database: AppDb, affectedId: string): Promise<Context> {
  const row = await database.affected.get(affectedId);
  if (!row) throw new Error("La clase afectada ya no existe.");
  const p = await database.periods.get(row.periodId);
  if (!p) throw new Error("El periodo ya no existe.");
  const period: PeriodLite = { id: p.id, name: p.name, startsAt: p.startsAt, endsAt: p.endsAt, kind: p.kind };
  const weekday = weekdayOf(row.date);
  const year = await yearForDate(database, row.date);
  const [people, activityTypes, allWork, periods] = await Promise.all([
    database.staff.toArray(), database.activityTypes.toArray(), database.workDays.toArray(), database.periods.toArray(),
  ]);
  const free = new Set(activityTypes.filter((a) => a.isFree).map((a) => a.id));
  const periodMap = new Map(periods.map((x) => [x.id, x]));
  const staff: StaffForCoverage[] = [];
  for (const s of people) {
    const cells = year ? (await assignmentsOfStaff(database, year.id, s.id)).filter((a) => a.weekday === weekday) : [];
    const w = allWork.find((x) => x.staffId === s.id && x.weekday === weekday);
    staff.push({
      id: s.id, isActive: s.isActive, isTeaching: s.isTeaching, entryRule: s.entryRule,
      work: w ? { works: w.works, startsAt: w.startsAt, endsAt: w.endsAt } : undefined,
      activities: cells.flatMap((c) => { const pp = periodMap.get(c.periodId); return pp ? [{ startsAt: pp.startsAt, endsAt: pp.endsAt, periodId: c.periodId, isFree: free.has(c.activityTypeId) }] : []; }),
    });
  }
  const litePeriods: PeriodLite[] = periods.map((x) => ({ id: x.id, name: x.name, startsAt: x.startsAt, endsAt: x.endsAt, kind: x.kind }));
  const ps = toMinutes(period.startsAt), pe = toMinutes(period.endsAt);
  const dayIncidents = await database.incidents.filter((i) => i.status === "active" && i.startDate <= row.date && row.date <= i.endDate).toArray();
  const withIncident = new Set(dayIncidents.filter((i) => incidentSpans(i, litePeriods).some((sp) => sp.start < pe && ps < sp.end)).map((i) => i.staffId));
  const covs = await database.coverages.where("[date+periodId]").equals([row.date, row.periodId]).filter((c) => !c.canceledAt).toArray();
  const alreadyCovering = new Set(covs.filter((c) => c.affectedId !== row.id).map((c) => c.coveringStaffId));
  return { row, period, staff, withIncident, alreadyCovering };
}

/** Personal que puede cubrir una clase afectada (con hora libre primero). */
export async function loadAvailability(database: AppDb, affectedId: string): Promise<Candidate[]> {
  const c = await buildContext(database, affectedId);
  const list = findAvailableStaff({ period: c.period, absentStaffId: c.row.staffId, staff: c.staff, withIncident: c.withIncident, alreadyCovering: c.alreadyCovering });
  return list.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "free" ? -1 : 1));
}

export async function assignCoverage(database: AppDb, affectedId: string, coveringStaffId: string, notes = ""): Promise<string> {
  const c = await buildContext(database, affectedId);
  const cover = c.staff.find((s) => s.id === coveringStaffId);
  if (!cover) throw new Error("Elige a quien cubre.");
  const name = (await database.staff.get(coveringStaffId))?.fullName ?? "?";
  const why = unavailableReason({ staff: cover, period: c.period, absentStaffId: c.row.staffId, hasIncident: c.withIncident.has(coveringStaffId), alreadyCovering: c.alreadyCovering.has(coveringStaffId) });
  if (why) throw new Error(`${name} no puede cubrir: ${why}.`);
  const id = crypto.randomUUID();
  await database.transaction("rw", TABLES(database), async () => {
    const row = await database.affected.get(affectedId);
    if (!row) throw new Error("La clase afectada ya no existe.");
    const now = new Date().toISOString();
    const previous = await database.coverages.where("affectedId").equals(affectedId).filter((x) => !x.canceledAt).toArray();
    for (const prev of previous) await database.coverages.put({ ...prev, canceledAt: now });
    const inc = await database.incidents.get(row.incidentId);
    const type = inc ? await database.incidentTypes.get(inc.typeId) : undefined;
    const absent = await database.staff.get(row.staffId);
    const record: Coverage = { id, affectedId, date: row.date, periodId: row.periodId, groupId: row.groupId, subjectId: row.subjectId, absentStaffId: row.staffId, coveringStaffId, reason: type?.name ?? "", notes: notes.trim(), createdAt: now, canceledAt: "" };
    await database.coverages.put(record);
    await database.affected.put({ ...row, coverageStatus: "covered" });
    await logAudit(database, { table: "coverages", recordId: id, action: "create", summary: `${name} cubre a ${absent?.fullName ?? "?"} el ${formatDate(row.date)} (${c.period.name})`, before: previous[0] ?? null, after: record });
  });
  return id;
}

export async function removeCoverage(database: AppDb, coverageId: string, reason = ""): Promise<void> {
  await database.transaction("rw", TABLES(database), async () => {
    const cov = await database.coverages.get(coverageId);
    if (!cov || cov.canceledAt) return;
    const after = { ...cov, canceledAt: new Date().toISOString() };
    await database.coverages.put(after);
    const row = await database.affected.get(cov.affectedId);
    if (row && row.isClass) await database.affected.put({ ...row, coverageStatus: "uncovered" });
    await logAudit(database, { table: "coverages", recordId: coverageId, action: "deactivate", summary: `Se quitó una cobertura del ${formatDate(cov.date)}`, before: cov, after, reason });
  });
}

/** Marca una clase como «no requiere cobertura» (o la regresa a pendiente). */
export async function setNotRequired(database: AppDb, affectedId: string, notRequired: boolean, reason = ""): Promise<void> {
  await database.transaction("rw", TABLES(database), async () => {
    const row = await database.affected.get(affectedId);
    if (!row) throw new Error("La clase afectada ya no existe.");
    if (notRequired) {
      if (!reason.trim()) throw new Error("Escribe por qué no requiere cobertura.");
      const now = new Date().toISOString();
      const active = await database.coverages.where("affectedId").equals(affectedId).filter((x) => !x.canceledAt).toArray();
      for (const c of active) await database.coverages.put({ ...c, canceledAt: now });
    }
    const after: AffectedClass = { ...row, coverageStatus: notRequired ? "not_required" : "uncovered" };
    await database.affected.put(after);
    await logAudit(database, { table: "affected", recordId: affectedId, action: "update", summary: notRequired ? `Clase del ${formatDate(row.date)} marcada «no requiere cobertura»` : `Clase del ${formatDate(row.date)} vuelve a requerir cobertura`, before: row, after, reason: reason.trim() });
  });
}
