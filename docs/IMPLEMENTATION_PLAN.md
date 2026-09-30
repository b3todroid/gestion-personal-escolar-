# IMPLEMENTATION_PLAN

> **D-8:** app local de un solo usuario. Fase 1 ahora = proyecto base + datos locales + asistente + respaldo (HECHA). Fase 2 = personal, categorías y horarios laborales (HECHA). Fase 3 = grupos, materias, horarios docentes e importación CSV (HECHA; OCR/PDF de horarios sigue como extensión futura). Las demás fases siguen igual, sin autenticación/roles/RLS; reportes con impresión del navegador. Publicación con GitHub Actions (ya incluida).

Regla al cerrar cada fase: `lint` + `typecheck` + `test` + `build` sin errores antes de avanzar. Ninguna función se da por terminada sin prueba.

## Fases (cada una dividida en pasos pequeños)

### Fase 1 — Base, BD, auth, escuela, usuarios
1. Proyecto Next.js + TypeScript estricto + Tailwind + Vitest + ESLint; `.env.example`.
2. Migración 001: escuelas, configuración, ciclos, turnos, periodos.
3. Migración 002: perfiles, roles, permisos, `user_roles`, RLS base.
4. Login con Supabase Auth, layout con menú filtrado por permisos.
5. Asistente inicial (escuela, ciclo, zona horaria, turno, periodos, tolerancia).
6. Script/instrucciones para crear el primer administrador.
**Salida:** un administrador entra y configura la escuela.

### Fase 2 — Personal, categorías, horarios laborales
1. Migración: categorías, personal, horarios laborales.
2. CRUD de categorías y personal, búsqueda tolerante a nombres parciales.
3. Editor de horario laboral por día (incluye «No labora»).
4. Ficha básica del personal.

### Fase 3 — Grupos, materias, periodos, horarios docentes
1. CRUD de grupos, materias, tipos de actividad.
2. Cuadrícula visual del horario docente.
3. Restricciones de doble asignación (BD + mensajes claros).
4. Vista de horario por grupo (consulta inversa).
5. Importación CSV/XLSX con validación previa y plantilla descargable.

### Fase 4 — Entradas, retardos, incidencias
1. `computeLateness` (puro) con pruebas: tolerancia, hora esperada fija o por primera actividad.
2. Registro rápido de llegada; corrección con motivo.
3. Catálogo de incidencias; captura (día, periodos, rango de horas, rango de fechas).
4. Expansión de días laborales para incidencias multi-día.
5. Documentos adjuntos en bucket privado.

### Fase 5 — Clases afectadas y coberturas
1. `findAffectedPeriods` (puro) + materialización en `incident_affected_periods`; recálculo al editar.
2. Estados de cobertura; `findAvailableStaff`.
3. Asignar cobertura con bloqueo de doble cobertura.
4. Dashboard «Hoy» con alertas.

### Fase 6 — Reportes
1. Constructor con `fechaDesde/fechaHasta` y accesos rápidos.
2. Ocho tipos de reporte con filtros combinables.
3. PDF carta (resumido/detallado), encabezados repetidos, paginación, firmas.
4. CSV y XLSX.

### Fase 7 — Auditoría, optimización, pruebas
1. Triggers de auditoría y pantalla de historial.
2. Índices, paginación, revisión de N+1.
3. Datos demo y prueba E2E de los 20 criterios del punto 56.
4. Documentación de respaldos.

### Fase 8 — PWA, UX, producción
1. Manifest/service worker, ajustes móvil y tableta.
2. README completo (instalación, Supabase, migraciones, despliegue).
3. Revisión de seguridad y accesibilidad (icono + texto en estados).

## Riesgos técnicos

| Riesgo | Mitigación |
|--------|------------|
| Cálculo de retardo con tolerancia ambiguo | Decisión D-3 documentada; función pura con pruebas |
| Clases afectadas desactualizadas si cambia el horario | Recalcular al editar horario/incidencia; prueba de regresión |
| Zonas horarias y cambio de horario | Horas locales `time`, instantes `timestamptz`, conversión por zona de la escuela |
| PDF: tablas largas y cortes de texto | Prototipar librería en Fase 6 antes de comprometerse |
| Importación con datos sucios | Etapa de validación previa con errores por fila |
| RLS mal configurada | Pruebas por rol; `service_role` solo en servidor |
| Alcance muy grande | Fases pequeñas y verificables; sin funciones fuera del punto 52 |
| Privacidad de licencias médicas | Sin campo de diagnóstico; documentos privados |
