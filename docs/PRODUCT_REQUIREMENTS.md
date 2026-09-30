# PRODUCT_REQUIREMENTS — Sistema de Gestión de Personal Escolar

Idioma: es-MX · Zona horaria: configurable (inicial `America/Mexico_City`).

## 1. Cómo se entiende la aplicación

Plataforma **configurable** (no atada a una escuela) para el control administrativo de personal escolar: entradas, retardos, faltas, permisos, licencias, horarios, clases afectadas por ausencias docentes, coberturas y reportes en PDF/CSV/XLSX.

Principios rectores:
1. **La escuela configura el sistema.** Nada de nombre, periodos, grupos, materias, categorías, tolerancia o ciclo va en el código.
2. **Capturar una vez, reutilizar en todas partes.** El horario docente vive en una sola tabla; horario por grupo, clases afectadas, coberturas y reportes se derivan de ella.
3. **Prioridad de negocio:** exactitud > facilidad de captura > reportes > auditoría > seguridad > móvil > secundarias.
4. **Todo reporte = `fechaDesde` + `fechaHasta`.** Los accesos rápidos solo las calculan.

## 2. Alcance (MVP)

Incluido: asistente inicial, periodos, categorías, personal, horarios laborales, grupos, materias, horarios docentes (manual + CSV/XLSX), entradas y retardos, incidencias (día completo / periodos / rango de horas / rango de fechas), clases afectadas, coberturas, dashboard «Hoy», ficha de personal, reportes (8 tipos) con PDF resumido/detallado, firmas, CSV/XLSX, auditoría, RBAC, búsqueda, ciclos escolares, datos demo, PWA (fase final).

Excluido (punto 52): expedientes clínicos o psicológicos, gestión académica de alumnos, calificaciones, padres de familia, nómina, y cualquier función ajena al objetivo.

Diseñado pero no implementado: OCR/PDF/foto de horarios, notificaciones, QR/NFC/reloj checador, multi-escuela, estadísticas avanzadas, app nativa.

## 3. Roles y usuarios

Administrador, Dirección, Subdirección, Capturista, Consulta (detalle en `PERMISSIONS.md`).

## 4. Flujo principal del usuario

1. **Primer uso:** el Administrador entra → asistente (escuela, ciclo, zona horaria, turno, periodos, tolerancia) → categorías → personal → grupos/materias → horarios.
2. **Día a día (Capturista):** *Inicio (Hoy)* → buscar persona → **Registrar llegada** → el sistema calcula a tiempo/retardo y minutos → Guardar.
3. **Falta docente:** buscar docente → **Falta** → **Todo el día** → Guardar. El sistema calcula solo las clases afectadas y las deja en «Sin cobertura».
4. **Cobertura:** desde alerta en Hoy o pantalla Coberturas → clase afectada → **Buscar personal disponible** → elegir → Guardar.
5. **Reportes:** tipo → filtros → rango (Hoy/Semana/Mes/Ciclo/Personalizado) → vista previa → PDF (resumido/detallado) / CSV / XLSX.

## 5. Reglas de negocio clave

- **Retardo** = `hora_llegada − (hora_esperada + tolerancia)` cuando es > 0, y los minutos reportados se cuentan **desde la hora esperada** (ej.: esperada 07:30, llegada 07:47 → 17 min). Con tolerancia 0 no hay ambigüedad. Ver decisión D-3.
- **Hora esperada**: del horario laboral del día (personal fijo) o de la primera actividad del día (docentes con esa opción).
- **Incidencias multi-día** se guardan una vez; los días laborales se calculan (horario del personal, excluyendo «No labora»).
- **Clases afectadas** = intersección (fecha, rango horario de la incidencia) × asignaciones del horario docente cuyo periodo se traslapa. Un traslape parcial cuenta como afectada (D-4).
- **Cobertura**: candidato disponible = sin clase/actividad, sin incidencia y sin otra cobertura en ese periodo y fecha.
- **Sin borrado físico** de incidencias ni catálogos usados; borrado lógico + auditoría.
- **Privacidad**: sin diagnósticos; documentos en almacenamiento privado con URLs firmadas de corta vida.

## 6. Criterios de aceptación

Los 20 escenarios del punto 56 (Escuela Demo → auditoría de una incidencia modificada). Se automatizan como prueba end-to-end en la Fase 7.

## 7. Contradicciones / ambigüedades detectadas y decisiones

| ID | Detalle | Decisión |
|----|---------|----------|
| D-1 | Punto 12: «horario por grupo» y «por docente» sin duplicar datos. | Una sola tabla `schedule_assignments`; horario de grupo es una consulta/vista. |
| D-2 | Punto 36: un grupo no puede tener dos docentes a la vez «salvo casos autorizados». | Restricción única por defecto; columna `allow_shared` (bool) en la asignación para excepciones explícitas. |
| D-3 | Punto 15 vs 14: ¿los minutos de retardo descuentan tolerancia? | Con tolerancia, dentro de ella es «a tiempo»; al excederla, los minutos se cuentan desde la hora esperada. Configurable después si la escuela lo pide. |
| D-4 | Punto 19: traslape parcial de una incidencia con un periodo. | Se considera afectado (más seguro para no perder una clase sin cubrir); el usuario puede marcar «No requiere cobertura». |
| D-5 | Punto 8: «Docente / Personal sin grupo» vs. categorías (punto 7). | Bandera `is_teaching` en `staff` independiente de la categoría (un UDEEI puede dar clases, un docente puede no). |
| D-6 | Punto 16: «Retardo» aparece como tipo de incidencia y también como cálculo de entradas. | El retardo nace de `attendance_entries`; el tipo «Retardo» del catálogo se usa para retardos registrados manualmente/justificados. Reportes unen ambos sin doble conteo. |
| D-7 | Punto 3: PDF «desde servidor». | Se usa una librería de PDF en el servidor (react-pdf o pdfmake) — se decide en Fase 6 tras prototipo. |
