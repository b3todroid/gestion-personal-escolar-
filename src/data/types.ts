import type { PeriodKind } from "@/domain/periods";

export interface Signature {
  label: string;
  name: string;
  enabled: boolean;
}

export interface SchoolSettings {
  id: "main";
  /** Logo opcional como imagen en texto (data URL). */
  logoDataUrl?: string;
  schoolName: string;
  cct: string;
  educationLevel: string;
  address: string;
  schoolZone: string;
  directorName: string;
  subdirectorName: string;
  timezone: string;
  toleranceMinutes: number;
  signatures: Signature[];
}

export interface SchoolYear {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
}

export type ShiftKind = "matutino" | "vespertino" | "ampliada" | "personalizado";

export interface Shift {
  id: string;
  name: string;
  kind: ShiftKind;
  isActive: boolean;
}

export interface Period {
  id: string;
  shiftId: string;
  name: string;
  position: number;
  startsAt: string;
  endsAt: string;
  kind: PeriodKind;
}

export interface StaffCategory {
  id: string;
  name: string;
  /** Las personas nuevas de esta categoría se marcan como docentes (con grupos) por defecto. */
  isTeaching: boolean;
  isActive: boolean;
}

export type EntryRule = "fixed" | "first_activity";

export interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  employeeNumber: string;
  categoryId: string;
  jobTitle: string;
  email: string;
  phone: string;
  shiftId: string;
  isTeaching: boolean;
  entryRule: EntryRule;
  isActive: boolean;
  hiredOn: string;
  adminNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkDay {
  /** `${staffId}:${weekday}` */
  id: string;
  staffId: string;
  weekday: number;
  works: boolean;
  startsAt: string;
  endsAt: string;
}

export interface AuditEntry {
  id: string;
  table: string;
  recordId: string;
  action: "create" | "update" | "deactivate" | "activate";
  summary: string;
  before: unknown;
  after: unknown;
  reason: string;
  at: string;
}

export interface Group {
  id: string;
  name: string;
  grade: string;
  shiftId: string;
  isActive: boolean;
}

export interface Subject {
  id: string;
  name: string;
  shortName: string;
  isActive: boolean;
}

export interface ActivityType {
  id: string;
  name: string;
  /** Cuenta como hora libre: esa persona puede cubrir a otro docente en ese periodo. */
  isFree?: boolean;
  /** Las actividades «de clase» exigen grupo y materia. */
  isClass: boolean;
  isActive: boolean;
}

/** Una celda del horario docente (la única fuente: el horario por grupo se deriva de aquí). */
export interface Assignment {
  /** `${schoolYearId}:${staffId}:${weekday}:${periodId}` */
  id: string;
  schoolYearId: string;
  staffId: string;
  weekday: number;
  periodId: string;
  groupId: string;
  subjectId: string;
  activityTypeId: string;
  allowShared: boolean;
}

export type CountsAs = "absence" | "late" | "leave" | "permit" | "certificate" | "other";

export interface IncidentType {
  id: string;
  name: string;
  countsAs: CountsAs;
  isActive: boolean;
}

export type IncidentScope = "full_day" | "periods" | "time_range";

export interface Incident {
  id: string;
  staffId: string;
  typeId: string;
  startDate: string;
  endDate: string;
  scope: IncidentScope;
  periodIds: string[];
  startTime: string;
  endTime: string;
  notes: string;
  /** Borrado lógico: «cancelled» conserva el registro y su historial. */
  status: "active" | "cancelled";
  cancelReason: string;
  createdAt: string;
  updatedAt: string;
}

export type CoverageStatus = "uncovered" | "covered" | "not_required";

/** Una clase/actividad afectada por una incidencia (se calcula del horario docente al guardar). */
export interface AffectedClass {
  /** `${incidentId}:${date}:${periodId}` */
  id: string;
  incidentId: string;
  staffId: string;
  date: string;
  periodId: string;
  assignmentId: string;
  groupId: string;
  subjectId: string;
  activityTypeId: string;
  isClass: boolean;
  coverageStatus: CoverageStatus;
}

export interface AttendanceEntry {
  /** `${staffId}:${date}` — una entrada por persona y día. */
  id: string;
  staffId: string;
  date: string;
  expectedTime: string;
  arrivedTime: string;
  toleranceApplied: number;
  status: "on_time" | "late";
  lateMinutes: number;
  note: string;
  /** Anulada (borrado lógico). */
  voidedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Coverage {
  id: string;
  affectedId: string;
  date: string;
  periodId: string;
  groupId: string;
  subjectId: string;
  absentStaffId: string;
  coveringStaffId: string;
  reason: string;
  notes: string;
  createdAt: string;
  /** Vacío = vigente. */
  canceledAt: string;
}

export interface DocumentRecord {
  id: string;
  incidentId: string;
  name: string;
  mime: string;
  size: number;
  blob: Blob;
  createdAt: string;
}

export interface Holiday {
  id: string;
  date: string;
  label: string;
}
