import type { AppDb } from "./db";
import type { AffectedClass, Incident, IncidentScope } from "./types";
import { logAudit } from "./audit";
import { assignmentsOfStaff, holidaySet, incidentDays, today, yearForDate } from "./context";
import { findAffectedSlots, incidentsOverlap, validateIncident, type PeriodLite } from "@/domain/incidents";
import { formatDate, isValidIsoDate } from "@/domain/dates";

export interface IncidentInput {
  id?: string;
  staffId: string;
  typeId: string;
  startDate: string;
  endDate: string;
  scope: IncidentScope;
  periodIds: string[];
  startTime: string;
  endTime: string;
  notes: string;
  /** Motivo del cambio (opcional; se guarda en la auditoría). */
  reason?: string;
  confirmInactive?: boolean;
}

const ALL_TABLES = (d: AppDb) => [d.attendance, d.incidents, d.affected, d.coverages, d.staff, d.workDays, d.assignments, d.periods, d.activityTypes, d.incidentTypes, d.holidays, d.schoolYears, d.audit];

/** Calcula las clases afectadas de una incidencia (opcionalmente solo desde una fecha). */
async function computeAffected(database: AppDb, incident: Incident, fromDate?: string): Promise<AffectedClass[]> {
  const type = await database.incidentTypes.get(incident.typeId);
  if (!type || type.countsAs === "late") return [];
  const person = await database.staff.get(incident.staffId);
  if (!person) return [];
  const [workDays, holidays, periods, activities] = await Promise.all([
    database.workDays.where("staffId").equals(person.id).toArray(),
    holidaySet(database),
    database.periods.toArray(),
    database.activityTypes.toArray(),
  ]);
  const years = await database.schoolYears.toArray();
  const allAssignments = (await Promise.all(years.map((y) => assignmentsOfStaff(database, y.id, person.id)))).flat();
  let days = incidentDays(incident, person, workDays, allAssignments, holidays);
  if (fromDate) days = days.filter((d) => d >= fromDate);

  const lite: PeriodLite[] = periods.map((p) => ({ id: p.id, name: p.name, startsAt: p.startsAt, endsAt: p.endsAt, kind: p.kind }));
  const out: AffectedClass[] = [];
  const byYear = new Map<string, string[]>();
  for (const d of days) {
    const y = await yearForDate(database, d);
    if (!y) continue;
    byYear.set(y.id, [...(byYear.get(y.id) ?? []), d]);
  }
  for (const [yearId, yearDays] of byYear) {
    const assignments = allAssignments.filter((a) => a.schoolYearId === yearId);
    for (const s of findAffectedSlots({ incident, days: yearDays, assignments, periods: lite })) {
      const isClass = activities.find((a) => a.id === s.activityTypeId)?.isClass ?? false;
      out.push({ id: `${incident.id}:${s.date}:${s.periodId}`, incidentId: incident.id, staffId: incident.staffId, date: s.date, periodId: s.periodId, assignmentId: s.assignmentId, groupId: s.groupId, subjectId: s.subjectId, activityTypeId: s.activityTypeId, isClass, coverageStatus: isClass ? "uncovered" : "not_required" });
    }
  }
  return out;
}

/** Sincroniza las filas de clases afectadas conservando el estado de cobertura de las que siguen igual. */
async function syncAffected(database: AppDb, incident: Incident, fromDate?: string): Promise<void> {
  const fresh = incident.status === "active" ? await computeAffected(database, incident, fromDate) : [];
  const existing = (await database.affected.where("incidentId").equals(incident.id).toArray()).filter((a) => !fromDate || a.date >= fromDate);
  const freshIds = new Set(fresh.map((f) => f.id));
  const removed = existing.filter((e) => !freshIds.has(e.id));
  const kept = new Map(existing.map((e) => [e.id, e]));

  if (removed.length > 0) {
    const removedIds = new Set(removed.map((r) => r.id));
    await database.coverages.where("affectedId").anyOf([...removedIds]).filter((c) => !c.canceledAt).modify({ canceledAt: new Date().toISOString() });
    await database.affected.bulkDelete([...removedIds]);
  }
  await database.affected.bulkPut(fresh.map((f) => ({ ...f, coverageStatus: kept.get(f.id)?.coverageStatus ?? f.coverageStatus })));
}

/** Crea o modifica una incidencia (un solo registro aunque abarque varios días) y recalcula las clases afectadas. */
export async function saveIncident(database: AppDb, input: IncidentInput): Promise<string> {
  const now = new Date().toISOString();
  const id = input.id ?? crypto.randomUUID();
  await database.transaction("rw", ALL_TABLES(database), async () => {
    const person = await database.staff.get(input.staffId);
    if (!person) throw new Error("Elige a la persona.");
    if (!person.isActive && !input.confirmInactive) throw new Error(`${person.fullName} está inactivo/a. Confirma si quieres registrarle una incidencia de todos modos.`);
    const type = await database.incidentTypes.get(input.typeId);
    if (!type) throw new Error("Elige el tipo de incidencia.");
    const before = input.id ? await database.incidents.get(input.id) : undefined;
    if (input.id && !before) throw new Error("La incidencia ya no existe.");
    if (before?.status === "cancelled") throw new Error("La incidencia está cancelada y no se puede modificar.");
    if (!type.isActive && before?.typeId !== type.id) throw new Error(`El tipo «${type.name}» está desactivado.`);
    if (!isValidIsoDate(input.startDate) || !isValidIsoDate(input.endDate)) throw new Error("Escribe la fecha inicial y la fecha final.");

    const periods = (await database.periods.toArray()).map((p) => ({ id: p.id, name: p.name, startsAt: p.startsAt, endsAt: p.endsAt, kind: p.kind })) satisfies PeriodLite[];
    const candidate: Incident = {
      id, staffId: input.staffId, typeId: input.typeId, startDate: input.startDate, endDate: input.endDate, scope: input.scope,
      periodIds: input.scope === "periods" ? input.periodIds : [], startTime: input.scope === "time_range" ? input.startTime : "", endTime: input.scope === "time_range" ? input.endTime : "",
      notes: input.notes.trim(), status: "active", cancelReason: "", createdAt: before?.createdAt ?? now, updatedAt: now,
    };
    const errors = validateIncident(candidate, periods);
    if (errors.length > 0) throw new Error(errors[0]);

    // No permitir dos incidencias de la misma persona que se empalman en fecha y horario.
    const others = await database.incidents.where("staffId").equals(person.id).filter((o) => o.status === "active" && o.id !== id).toArray();
    const clash = others.find((o) => incidentsOverlap(o, candidate, periods));
    if (clash) {
      const t = await database.incidentTypes.get(clash.typeId);
      throw new Error(`${person.fullName} ya tiene la incidencia «${t?.name ?? "incidencia"}» del ${formatDate(clash.startDate)} al ${formatDate(clash.endDate)} que se empalma con estas fechas y horario.`);
    }

    const [workDays, holidays] = await Promise.all([database.workDays.where("staffId").equals(person.id).toArray(), holidaySet(database)]);
    const years = await database.schoolYears.toArray();
    const allAssignments = (await Promise.all(years.map((y) => assignmentsOfStaff(database, y.id, person.id)))).flat();
    if (incidentDays(candidate, person, workDays, allAssignments, holidays).length === 0) {
      throw new Error(`Las fechas elegidas no incluyen ningún día laboral de ${person.fullName} (fines de semana, días no laborables o días que no labora).`);
    }

    if (candidate.scope === "full_day" && type.countsAs !== "late") {
      const entry = await database.attendance.where("staffId").equals(person.id).filter((e) => !e.voidedAt && e.date >= candidate.startDate && e.date <= candidate.endDate).first();
      if (entry) throw new Error(`${person.fullName} ya tiene entrada registrada el ${formatDate(entry.date)} (${entry.arrivedTime}). Anula la entrada en «Corregir» si fue un error, o registra la incidencia por periodos u horas.`);
    }
    await database.incidents.put(candidate);
    await syncAffected(database, candidate);
    await logAudit(database, {
      table: "incidents", recordId: id, action: before ? "update" : "create",
      summary: before ? `Se modificó la incidencia de ${person.fullName} (${type.name})` : `Incidencia «${type.name}» de ${person.fullName}: ${formatDate(candidate.startDate)}${candidate.endDate !== candidate.startDate ? ` al ${formatDate(candidate.endDate)}` : ""}`,
      before: before ?? null, after: candidate, reason: input.reason ?? "",
    });
  });
  return id;
}

/** Cancela una incidencia (borrado lógico). Exige motivo; libera sus clases afectadas y cancela sus coberturas. */
export async function cancelIncident(database: AppDb, id: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error("Escribe el motivo para cancelar la incidencia.");
  await database.transaction("rw", ALL_TABLES(database), async () => {
    const before = await database.incidents.get(id);
    if (!before) throw new Error("La incidencia ya no existe.");
    if (before.status === "cancelled") return;
    const person = await database.staff.get(before.staffId);
    const after: Incident = { ...before, status: "cancelled", cancelReason: reason.trim(), updatedAt: new Date().toISOString() };
    await database.incidents.put(after);
    await syncAffected(database, after);
    await logAudit(database, { table: "incidents", recordId: id, action: "deactivate", summary: `Se canceló la incidencia de ${person?.fullName ?? "?"}`, before, after, reason: reason.trim() });
  });
}

/** Tras cambiar un horario docente, recalcula solo las clases afectadas de hoy en adelante (el pasado no se reescribe). */
export async function recalcFutureForStaff(database: AppDb, staffId: string): Promise<void> {
  const from = await today(database);
  const list = await database.incidents.where("staffId").equals(staffId).filter((i) => i.status === "active" && i.endDate >= from).toArray();
  if (list.length === 0) return;
  await database.transaction("rw", ALL_TABLES(database), async () => {
    for (const inc of list) await syncAffected(database, inc, from);
  });
}

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export async function addDocument(database: AppDb, incidentId: string, file: { name: string; type: string; size: number }, blob: Blob): Promise<void> {
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("El documento pesa más de 5 MB. Redúcelo o toma una foto de menor tamaño.");
  const incident = await database.incidents.get(incidentId);
  if (!incident) throw new Error("La incidencia ya no existe.");
  await database.transaction("rw", [database.documents, database.audit], async () => {
    const id = crypto.randomUUID();
    await database.documents.put({ id, incidentId, name: file.name, mime: file.type || "application/octet-stream", size: file.size, blob, createdAt: new Date().toISOString() });
    await logAudit(database, { table: "documents", recordId: id, action: "create", summary: `Se adjuntó «${file.name}» a una incidencia`, before: null, after: { incidentId, name: file.name, size: file.size } });
  });
}

export async function removeDocument(database: AppDb, id: string): Promise<void> {
  await database.transaction("rw", [database.documents, database.audit], async () => {
    const doc = await database.documents.get(id);
    if (!doc) return;
    await database.documents.delete(id);
    await logAudit(database, { table: "documents", recordId: id, action: "deactivate", summary: `Se quitó el documento «${doc.name}»`, before: { incidentId: doc.incidentId, name: doc.name, size: doc.size }, after: null });
  });
}

/** Vista previa (sin guardar): qué clases se afectarían con estos datos. */
export async function previewAffected(database: AppDb, input: IncidentInput): Promise<AffectedClass[]> {
  if (!input.staffId || !input.typeId || !isValidIsoDate(input.startDate) || !isValidIsoDate(input.endDate) || input.startDate > input.endDate) return [];
  const candidate: Incident = {
    id: input.id ?? "preview", staffId: input.staffId, typeId: input.typeId, startDate: input.startDate, endDate: input.endDate, scope: input.scope,
    periodIds: input.scope === "periods" ? input.periodIds : [], startTime: input.scope === "time_range" ? input.startTime : "", endTime: input.scope === "time_range" ? input.endTime : "",
    notes: "", status: "active", cancelReason: "", createdAt: "", updatedAt: "",
  };
  if (input.scope === "time_range" && !(candidate.startTime && candidate.endTime && candidate.startTime < candidate.endTime)) return [];
  if (input.scope === "periods" && candidate.periodIds.length === 0) return [];
  const rows = await computeAffected(database, candidate);
  // Si es una edición, conserva el estado de cobertura que ya tenían.
  return rows;
}
