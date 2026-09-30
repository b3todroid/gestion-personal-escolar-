# DATABASE_SCHEMA (IndexedDB / Dexie)

> **D-8:** el almacenamiento es local (IndexedDB), no PostgreSQL. Los campos y reglas de abajo siguen siendo válidos; cambian los mecanismos:
> - Las restricciones (`CHECK`, `UNIQUE`, `EXCLUDE`) las aplica la capa `src/data` dentro de **transacciones** (la única vía de escritura), con pruebas.
> - `uuid` = `crypto.randomUUID()`; sin `school_id` (una escuela por dispositivo); sin `profiles/roles/permissions`.
> - Tablas implementadas (Fase 1–2): `settings`, `schoolYears`, `shifts`, `periods`, `categories`, `staff`, `workDays`, `audit`.
> - Pendientes: `groups`, `subjects`, `activityTypes`, `scheduleAssignments`, `attendanceEntries`, `incidentTypes`, `incidents`, `affectedPeriods`, `coverages`, `documents` (archivos como Blob en IndexedDB).
> - Auditoría: función `logAudit` dentro de la misma transacción que el cambio.

---
(Diseño original relacional, referencia de campos y reglas)


Convenciones: PK `id uuid default gen_random_uuid()`; `school_id uuid not null` en todas las tablas de negocio; `created_at`, `updated_at` (`timestamptz`), `created_by` (`uuid → auth.users`) donde corresponde. Borrado lógico con `deleted_at timestamptz` o `is_active`. Extensiones: `btree_gist` (exclusiones), `pg_trgm` (búsqueda parcial de nombres). Todo cambio vía `supabase/migrations/`.

## Configuración

| Tabla | Campos principales |
|-------|--------------------|
| `schools` | name, cct, education_level, logo_path, address, school_zone, director_name, subdirector_name |
| `school_settings` | school_id (único), timezone (`America/Mexico_City`), late_tolerance_minutes (default 0), pdf_signatures jsonb (activas, nombres, cargos), locale |
| `school_years` | name (`2026-2027`), starts_on, ends_on, is_current · CHECK `starts_on < ends_on` · único (school_id, name) |
| `shifts` | name, kind (`matutino`/`vespertino`/`ampliada`/`custom`), is_active |
| `periods` | shift_id, name, position, starts_at time, ends_at time, kind (`class`/`break`/`activity`/`other`) · CHECK `ends_at > starts_at` · único (shift_id, position) |

## Personal y horarios laborales

| Tabla | Campos principales |
|-------|--------------------|
| `staff_categories` | name, is_active (catálogo; sin borrado si está en uso) |
| `staff` | first_name, last_name, full_name (generado), employee_number, category_id, job_title, email, phone, shift_id, is_teaching bool, entry_rule (`fixed`/`first_activity`), is_active, hired_on, admin_notes · único parcial (school_id, employee_number) · índice trigram en full_name |
| `staff_work_schedules` | staff_id, weekday (1–7), works bool, starts_at, ends_at · CHECK fin > inicio si works · único (staff_id, weekday) |

## Académico

| Tabla | Campos principales |
|-------|--------------------|
| `groups` | name, grade, shift_id, is_active · único (school_id, name) |
| `subjects` | name, short_name, is_active |
| `activity_types` | name (Clase, Servicio, Tutoría, Reunión, Administrativa, Libre, Otro…), is_class bool, is_active |
| `schedule_assignments` | school_year_id, staff_id, weekday, period_id, group_id null, subject_id null, activity_type_id, allow_shared bool default false |

Restricciones de `schedule_assignments` (clave del punto 36):
- **Docente sin dos actividades a la vez:** `UNIQUE (school_year_id, staff_id, weekday, period_id)`.
- **Grupo sin dos docentes a la vez:** índice único parcial `(school_year_id, group_id, weekday, period_id) WHERE group_id IS NOT NULL AND allow_shared = false`.
- CHECK: si `is_class` entonces `group_id` y `subject_id` obligatorios (validado en app + trigger).
- Horario por grupo = **consulta** sobre esta tabla (nunca copia).

## Asistencia e incidencias

| Tabla | Campos principales |
|-------|--------------------|
| `attendance_entries` | staff_id, date, expected_time, arrived_at time, tolerance_applied, status (`on_time`/`late`), late_minutes int CHECK ≥ 0, source (`manual`…), corrected_from uuid null, correction_reason, deleted_at · único (staff_id, date) activo |
| `incident_types` | name, counts_as (`absence`/`late`/`leave`/`permit`/`certificate`/`other`), requires_coverage_check bool, is_active |
| `incidents` | staff_id, incident_type_id, start_date, end_date, scope (`full_day`/`periods`/`time_range`), start_time null, end_time null, notes, status, deleted_at, created_by · CHECK `end_date >= start_date`; si `time_range` entonces `end_time > start_time` · **sin campo de diagnóstico** |
| `incident_affected_periods` | incident_id, date, period_id, assignment_id, group_id, subject_id, coverage_status (`uncovered`/`covered`/`not_required`) · único (incident_id, date, period_id) |
| `coverage_assignments` | affected_period_id, covering_staff_id, date, period_id, group_id, subject_id, absent_staff_id, reason, notes, deleted_at · **doble cobertura:** índice único parcial `(covering_staff_id, date, period_id) WHERE deleted_at IS NULL` |
| `documents` | incident_id, storage_path (bucket privado), file_name, mime_type, size, uploaded_by |

Índices: `incidents (staff_id, start_date, end_date)`, `attendance_entries (date)`, `incident_affected_periods (date, group_id)`, `coverage_assignments (date, period_id)`.

## Usuarios, roles y auditoría

| Tabla | Campos principales |
|-------|--------------------|
| `profiles` | user_id → auth.users, school_id, display_name, is_active |
| `roles` | key (`admin`, `direction`, `subdirection`, `capturist`, `viewer`), name |
| `permissions` | key (`incident.create`, `report.view`, …) |
| `role_permissions` | role_id, permission_id → permisos extensibles sin tocar código |
| `user_roles` | user_id, role_id |
| `audit_logs` | table_name, record_id, action (`insert`/`update`/`delete`), old_data jsonb, new_data jsonb, changed_by, changed_at, reason null |

Auditoría: triggers en `incidents`, `attendance_entries`, `coverage_assignments`, `schedule_assignments`, `staff`, `incident_types`. Las actualizaciones que ocurren en la app reciben `reason` mediante `set_config('app.audit_reason', …)` en la misma transacción. Los `audit_logs` son de solo inserción (sin UPDATE/DELETE por RLS).

## Cambios respecto al listado inicial

Se añadieron: `profiles`, `permissions`, `role_permissions`, `activity_types` (catálogo ampliable de tipos de actividad, punto 11), y se reemplazó `users` por `profiles` sobre `auth.users` de Supabase.

## Datos demo

`supabase/seed/demo.sql` crea «Escuela Demo» (10 docentes, 2 UDEEI, 2 orientadores, 2 administrativos, 1 trabajo social, grupos, materias, horarios, incidencias y retardos). Se ejecuta solo de forma manual y nunca en producción.
