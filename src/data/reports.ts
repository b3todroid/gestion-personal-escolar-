import type { AppDb } from "./db";
import type { AttendanceEntry, Incident, IncidentType, Staff } from "./types";
import { getSettings, holidaySet, assignmentsOfStaff, incidentDays } from "./context";
import { formatDate, validateRange } from "@/domain/dates";

export type ReportType = "general" | "persona" | "categoria" | "grupo" | "tipo" | "retardos" | "inasistencias" | "coberturas";

export const REPORT_TYPES: { id: ReportType; label: string; hint: string }[] = [
  { id: "general", label: "General del plantel", hint: "Resumen de todo el personal" },
  { id: "persona", label: "Por persona", hint: "Un solo integrante del personal" },
  { id: "categoria", label: "Por categoría", hint: "Docentes, UDEEI, orientación…" },
  { id: "grupo", label: "Por grupo", hint: "Clases afectadas y coberturas de un grupo" },
  { id: "tipo", label: "Por tipo de incidencia", hint: "Licencias, permisos, etc." },
  { id: "retardos", label: "Retardos", hint: "Llegadas tarde y minutos" },
  { id: "inasistencias", label: "Inasistencias", hint: "Faltas y días" },
  { id: "coberturas", label: "Coberturas", hint: "Quién cubrió a quién" },
];

export interface ReportParams {
  type: ReportType;
  from: string;
  to: string;
  staffId?: string;
  categoryId?: string;
  groupId?: string;
  incidentTypeId?: string;
  detailed: boolean;
}

export interface ReportSection { heading: string; columns: string[]; rows: string[][]; detailOnly?: boolean }
export interface Report {
  title: string;
  schoolName: string;
  filters: string[];
  generatedAt: string;
  summary: { label: string; value: string }[];
  sections: ReportSection[];
  detailed: boolean;
}

interface PersonTotals { lates: number; lateMin: number; absence: number; leave: number; permit: number; certificate: number; other: number; affected: number; covered: number }
const zero = (): PersonTotals => ({ lates: 0, lateMin: 0, absence: 0, leave: 0, permit: 0, certificate: 0, other: 0, affected: 0, covered: 0 });
const byName = <T,>(f: (x: T) => string) => (a: T, b: T) => f(a).localeCompare(f(b), "es");
const TOTAL_COLS = ["Retardos", "Min. de retardo", "Faltas (días)", "Licencias (días)", "Permisos (días)", "Constancias (días)", "Otras (días)", "Clases afectadas", "Cubiertas"];
const totalCells = (t: PersonTotals) => [t.lates, t.lateMin, t.absence, t.leave, t.permit, t.certificate, t.other, t.affected, t.covered].map(String);

export async function buildReport(database: AppDb, p: ReportParams): Promise<Report> {
  const err = validateRange(p.from, p.to);
  if (err) throw new Error(err);
  const settings = await getSettings(database);
  const [people, categories, groups, subjects, periods, itypes, holidays] = await Promise.all([
    database.staff.toArray(), database.categories.toArray(), database.groups.toArray(), database.subjects.toArray(), database.periods.toArray(), database.incidentTypes.toArray(), holidaySet(database),
  ]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const periodName = new Map(periods.map((x) => [x.id, x.name]));
  const typeById = new Map<string, IncidentType>(itypes.map((t) => [t.id, t]));
  const staffById = new Map(people.map((s) => [s.id, s]));
  const nameOf = (id: string) => staffById.get(id)?.fullName ?? "(eliminado)";

  const inScope = (s: Staff) => (!p.staffId || s.id === p.staffId) && (!p.categoryId || s.categoryId === p.categoryId);
  const scopeIds = new Set(people.filter(inScope).map((s) => s.id));

  const incidents = (await database.incidents.filter((i) => i.status === "active" && i.startDate <= p.to && i.endDate >= p.from && scopeIds.has(i.staffId) && (!p.incidentTypeId || i.typeId === p.incidentTypeId)).toArray());
  const entries = (await database.attendance.where("date").between(p.from, p.to, true, true).filter((e) => !e.voidedAt && scopeIds.has(e.staffId)).toArray());
  let affected = await database.affected.where("date").between(p.from, p.to, true, true).filter((a) => a.isClass && scopeIds.has(a.staffId)).toArray();
  let coverages = await database.coverages.where("date").between(p.from, p.to, true, true).filter((c) => !c.canceledAt).toArray();
  if (p.groupId) {
    affected = affected.filter((a) => a.groupId === p.groupId);
    coverages = coverages.filter((c) => c.groupId === p.groupId);
  }
  if (p.incidentTypeId) {
    const incIds = new Set(incidents.map((i) => i.id));
    affected = affected.filter((a) => incIds.has(a.incidentId));
  }
  const affectedById = new Map(affected.map((a) => [a.id, a]));
  coverages = coverages.filter((c) => (affectedById.has(c.affectedId) || (!p.groupId && !p.incidentTypeId && scopeIds.has(c.absentStaffId))));

  // Días por incidencia (recortados al rango, sin fines de semana, festivos ni días que no labora).
  const years = await database.schoolYears.toArray();
  const dayCache = new Map<string, string[]>();
  for (const inc of incidents) {
    const person = staffById.get(inc.staffId)!;
    const workDays = await database.workDays.where("staffId").equals(person.id).toArray();
    const cells = (await Promise.all(years.map((y) => assignmentsOfStaff(database, y.id, person.id)))).flat();
    dayCache.set(inc.id, incidentDays(inc, person, workDays, cells, holidays, { from: p.from, to: p.to }));
  }

  const totals = new Map<string, PersonTotals>();
  const tot = (id: string) => { let t = totals.get(id); if (!t) { t = zero(); totals.set(id, t); } return t; };
  for (const inc of incidents) {
    const t = tot(inc.staffId);
    const n = dayCache.get(inc.id)!.length;
    switch (typeById.get(inc.typeId)?.countsAs) {
      case "absence": t.absence += n; break;
      case "leave": t.leave += n; break;
      case "permit": t.permit += n; break;
      case "certificate": t.certificate += n; break;
      case "late": t.lates += n; break;
      default: t.other += n;
    }
  }
  const lateEntries = p.incidentTypeId ? [] : entries.filter((e) => e.status === "late");
  for (const e of lateEntries) { const t = tot(e.staffId); t.lates += 1; t.lateMin += e.lateMinutes; }
  for (const a of affected) { const t = tot(a.staffId); t.affected += 1; if (a.coverageStatus === "covered") t.covered += 1; }

  const incLabel = (i: Incident) => typeById.get(i.typeId)?.name ?? "Incidencia";
  const rangeText = (i: Incident) => (i.startDate === i.endDate ? formatDate(i.startDate) : `${formatDate(i.startDate)} al ${formatDate(i.endDate)}`);
  const scopeText = (i: Incident) => i.scope === "full_day" ? "Día completo" : i.scope === "time_range" ? `${i.startTime}–${i.endTime}` : i.periodIds.map((id) => periodName.get(id) ?? "?").join(", ");
  const coverOf = (affectedId: string) => coverages.find((c) => c.affectedId === affectedId);

  const incidentRows = (list: Incident[]) => list.slice().sort((a, b) => a.startDate.localeCompare(b.startDate) || nameOf(a.staffId).localeCompare(nameOf(b.staffId), "es"))
    .map((i) => [nameOf(i.staffId), incLabel(i), rangeText(i), scopeText(i), String(dayCache.get(i.id)!.length), i.notes]);
  const INC_COLS = ["Persona", "Tipo", "Fechas", "Alcance", "Días en el periodo", "Observaciones"];
  const lateRows = (list: AttendanceEntry[]) => list.slice().sort((a, b) => a.date.localeCompare(b.date) || nameOf(a.staffId).localeCompare(nameOf(b.staffId), "es"))
    .map((e) => [formatDate(e.date), nameOf(e.staffId), e.expectedTime, e.arrivedTime, String(e.lateMinutes), e.note]);
  const LATE_COLS = ["Fecha", "Persona", "Hora esperada", "Llegada", "Minutos", "Nota"];
  const affectedRows = (list: typeof affected) => list.slice().sort((a, b) => a.date.localeCompare(b.date) || (periods.find((x) => x.id === a.periodId)?.startsAt ?? "").localeCompare(periods.find((x) => x.id === b.periodId)?.startsAt ?? ""))
    .map((a) => { const c = coverOf(a.id); return [formatDate(a.date), periodName.get(a.periodId) ?? "?", groupName.get(a.groupId) ?? "—", subjectName.get(a.subjectId) ?? "—", nameOf(a.staffId), a.coverageStatus === "covered" ? `Cubre: ${nameOf(c?.coveringStaffId ?? "")}` : a.coverageStatus === "not_required" ? "No requiere" : "Sin cubrir"]; });
  const AFF_COLS = ["Fecha", "Periodo", "Grupo", "Materia", "Docente ausente", "Cobertura"];
  const sumTotals = (ids: Iterable<string>) => { const t = zero(); for (const id of ids) { const x = totals.get(id); if (!x) continue; (Object.keys(t) as (keyof PersonTotals)[]).forEach((k) => { t[k] += x[k]; }); } return t; };
  const headline = (t: PersonTotals) => [
    { label: "Retardos", value: `${t.lates} (${t.lateMin} min)` }, { label: "Faltas (días)", value: String(t.absence) },
    { label: "Licencias (días)", value: String(t.leave) }, { label: "Permisos (días)", value: String(t.permit) },
    { label: "Constancias (días)", value: String(t.certificate) }, { label: "Clases afectadas", value: String(t.affected) },
    { label: "Cubiertas / sin cubrir", value: `${t.covered} / ${affected.filter((a) => a.coverageStatus === "uncovered").length}` },
  ];
  const perPerson = (): ReportSection => {
    const list = people.filter((s) => scopeIds.has(s.id)).filter((s) => totals.has(s.id) || p.detailed).sort(byName((s: Staff) => s.fullName));
    return { heading: "Resumen por persona", columns: ["Persona", "Categoría", ...TOTAL_COLS], rows: list.map((s) => [s.fullName, catName.get(s.categoryId) ?? "—", ...totalCells(totals.get(s.id) ?? zero())]) };
  };

  const filters: string[] = [`Periodo: ${formatDate(p.from)} al ${formatDate(p.to)}`];
  if (p.staffId) filters.push(`Persona: ${nameOf(p.staffId)}`);
  if (p.categoryId) filters.push(`Categoría: ${catName.get(p.categoryId) ?? "?"}`);
  if (p.groupId) filters.push(`Grupo: ${groupName.get(p.groupId) ?? "?"}`);
  if (p.incidentTypeId) filters.push(`Tipo: ${typeById.get(p.incidentTypeId)?.name ?? "?"}`);

  const sections: ReportSection[] = [];
  let title = REPORT_TYPES.find((r) => r.id === p.type)!.label;
  let summary = headline(sumTotals(scopeIds));

  switch (p.type) {
    case "general":
    case "persona": {
      if (p.type === "persona" && !p.staffId) throw new Error("Elige a la persona para este reporte.");
      sections.push(perPerson());
      sections.push({ heading: "Incidencias", columns: INC_COLS, rows: incidentRows(incidents), detailOnly: true });
      sections.push({ heading: "Retardos registrados", columns: LATE_COLS, rows: lateRows(lateEntries), detailOnly: true });
      sections.push({ heading: "Clases afectadas", columns: AFF_COLS, rows: affectedRows(affected), detailOnly: true });
      if (p.type === "persona") title = `Reporte de ${nameOf(p.staffId!)}`;
      break;
    }
    case "categoria": {
      const rows = categories.filter((c) => !p.categoryId || c.id === p.categoryId).map((c) => [c.name, ...totalCells(sumTotals(people.filter((s) => s.categoryId === c.id && scopeIds.has(s.id)).map((s) => s.id)))]);
      sections.push({ heading: "Resumen por categoría", columns: ["Categoría", ...TOTAL_COLS], rows });
      sections.push({ ...perPerson(), heading: "Detalle por persona", detailOnly: true });
      break;
    }
    case "grupo": {
      if (!p.groupId) throw new Error("Elige el grupo para este reporte.");
      title = `Reporte del grupo ${groupName.get(p.groupId) ?? ""}`;
      const pending = affected.filter((a) => a.coverageStatus === "uncovered").length;
      summary = [{ label: "Clases afectadas", value: String(affected.length) }, { label: "Cubiertas", value: String(affected.filter((a) => a.coverageStatus === "covered").length) }, { label: "Sin cubrir", value: String(pending) }, { label: "No requieren", value: String(affected.filter((a) => a.coverageStatus === "not_required").length) }];
      const perSubject = new Map<string, number>();
      for (const a of affected) perSubject.set(subjectName.get(a.subjectId) ?? "—", (perSubject.get(subjectName.get(a.subjectId) ?? "—") ?? 0) + 1);
      sections.push({ heading: "Clases afectadas por materia", columns: ["Materia", "Clases afectadas"], rows: [...perSubject].sort(byName((x) => x[0])).map(([k, v]) => [k, String(v)]) });
      sections.push({ heading: "Detalle de clases afectadas", columns: AFF_COLS, rows: affectedRows(affected) });
      break;
    }
    case "tipo": {
      const rows = itypes.filter((t) => !p.incidentTypeId || t.id === p.incidentTypeId).map((t) => {
        const list = incidents.filter((i) => i.typeId === t.id);
        return [t.name, String(list.length), String(list.reduce((n, i) => n + dayCache.get(i.id)!.length, 0)), String(new Set(list.map((i) => i.staffId)).size)];
      }).filter((r) => r[1] !== "0");
      sections.push({ heading: "Resumen por tipo", columns: ["Tipo", "Incidencias", "Días", "Personas"], rows });
      sections.push({ heading: "Incidencias", columns: INC_COLS, rows: incidentRows(incidents) });
      summary = [{ label: "Incidencias", value: String(incidents.length) }, { label: "Días", value: String([...dayCache.values()].reduce((n, d) => n + d.length, 0)) }];
      break;
    }
    case "retardos": {
      const t = sumTotals(scopeIds);
      const manual = incidents.filter((i) => typeById.get(i.typeId)?.countsAs === "late");
      summary = [{ label: "Retardos", value: String(t.lates) }, { label: "Minutos acumulados", value: String(t.lateMin) }, { label: "Promedio por retardo", value: lateEntries.length ? (t.lateMin / lateEntries.length).toFixed(1) : "0" }];
      sections.push({ heading: "Retardos por persona", columns: ["Persona", "Categoría", "Retardos", "Minutos"], rows: people.filter((s) => (totals.get(s.id)?.lates ?? 0) > 0).sort(byName((s: Staff) => s.fullName)).map((s) => [s.fullName, catName.get(s.categoryId) ?? "—", String(totals.get(s.id)!.lates), String(totals.get(s.id)!.lateMin)]) });
      sections.push({ heading: "Detalle de retardos", columns: LATE_COLS, rows: lateRows(lateEntries) });
      if (manual.length) sections.push({ heading: "Retardos capturados como incidencia (sin minutos)", columns: INC_COLS, rows: incidentRows(manual), detailOnly: true });
      break;
    }
    case "inasistencias": {
      const list = incidents.filter((i) => typeById.get(i.typeId)?.countsAs === "absence");
      const t = sumTotals(scopeIds);
      summary = [{ label: "Faltas (días)", value: String(t.absence) }, { label: "Personas con falta", value: String(new Set(list.map((i) => i.staffId)).size) }, { label: "Clases afectadas", value: String(t.affected) }];
      sections.push({ heading: "Faltas por persona", columns: ["Persona", "Categoría", "Faltas (días)", "Clases afectadas"], rows: people.filter((s) => (totals.get(s.id)?.absence ?? 0) > 0).sort(byName((s: Staff) => s.fullName)).map((s) => [s.fullName, catName.get(s.categoryId) ?? "—", String(totals.get(s.id)!.absence), String(totals.get(s.id)!.affected)]) });
      sections.push({ heading: "Detalle de faltas", columns: INC_COLS, rows: incidentRows(list) });
      break;
    }
    case "coberturas": {
      const count = new Map<string, number>();
      for (const c of coverages) count.set(c.coveringStaffId, (count.get(c.coveringStaffId) ?? 0) + 1);
      summary = [{ label: "Coberturas", value: String(coverages.length) }, { label: "Quienes cubrieron", value: String(count.size) }, { label: "Clases sin cubrir", value: String(affected.filter((a) => a.coverageStatus === "uncovered").length) }];
      sections.push({ heading: "Coberturas por persona que cubre", columns: ["Persona", "Coberturas"], rows: [...count].sort((a, b) => b[1] - a[1]).map(([id, n]) => [nameOf(id), String(n)]) });
      sections.push({ heading: "Detalle de coberturas", columns: ["Fecha", "Periodo", "Grupo", "Materia", "Ausente", "Cubre", "Motivo"], rows: coverages.slice().sort((a, b) => a.date.localeCompare(b.date)).map((c) => [formatDate(c.date), periodName.get(c.periodId) ?? "?", groupName.get(c.groupId) ?? "—", subjectName.get(c.subjectId) ?? "—", nameOf(c.absentStaffId), nameOf(c.coveringStaffId), c.reason]) });
      break;
    }
  }
  return { title, schoolName: settings.schoolName, filters, generatedAt: new Date().toISOString(), summary, sections: sections.filter((s) => s.rows.length > 0 || !s.detailOnly), detailed: p.detailed };
}

/** Secciones visibles según el modo (resumido oculta el detalle). */
export function visibleSections(r: Report): ReportSection[] {
  return r.sections.filter((s) => r.detailed || !s.detailOnly);
}
