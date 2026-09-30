import type { PeriodKind } from "@/domain/periods";

export interface Signature {
  label: string;
  name: string;
  enabled: boolean;
}

export interface SchoolSettings {
  id: "main";
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
