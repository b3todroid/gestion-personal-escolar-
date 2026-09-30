# ARCHITECTURE (versión local, un solo usuario)

> **Decisión D-8 (29/09/2026):** la app es de un solo usuario, sin inicio de sesión, igual que las demás apps del proyecto. Se descarta Next.js + Supabase (ver `_descartado-next-supabase`). Los datos viven en el dispositivo.

## Stack
| Capa | Elección | Motivo |
|------|----------|--------|
| App | Vite + React + TypeScript estricto | Estático, se publica en GitHub Pages como Control Docente Integral |
| UI | Tailwind CSS 4, paleta esmeralda/piedra, móvil primero | Coherente con las otras apps |
| Datos | IndexedDB con Dexie | Consultas por índice, transacciones, miles de registros |
| Respaldo | Exportar/restaurar JSON (todas las tablas, en una transacción) | Los datos solo existen en el aparato; el respaldo es la protección |
| PDF | Impresión del navegador con CSS `@page` tamaño carta (Fase 6) | Sin dependencias, funciona sin internet |
| CSV/XLSX | CSV propio; XLSX con librería ligera (Fase 6) | |
| Pruebas | Vitest + fake-indexeddb; verificación en navegador real con Chromium | |
| PWA | Manifest + service worker (Fase 8) | Instalable y sin internet |

## Estructura
```
src/
  domain/   # lógica PURA sin almacenamiento (tiempo, periodos, horario laboral; luego retardos, periodos afectados, disponibilidad)
  data/     # Dexie: db, tipos, setup, staff, categorías, settings, auditoría, respaldo (todas las escrituras validan y auditan)
  pages/    # pantallas
  ui/       # componentes base
```
Regla: `domain/` no importa nada de `data/` ni de React. `data/` valida antes de escribir. Las pantallas nunca escriben directo a la base.

## Decisiones
1. Lógica crítica en funciones puras, con pruebas.
2. Una sola fuente del horario docente; horario por grupo y clases afectadas se derivan (y se materializan al guardar).
3. Sin borrado físico de catálogos ni incidencias: se desactivan; toda modificación deja auditoría (antes/después).
4. Cambios de estructura de datos = nueva `version()` de Dexie (equivalente a una migración), nunca editar una anterior.
5. Errores: `ErrorBoundary` global; los mensajes de validación son en español y se muestran todos juntos.
6. Sin roles ni permisos: se elimina RBAC/RLS. Si algún día hay varios usuarios, se retoma `PERMISSIONS.md` del diseño original.

## Extensiones futuras (sin implementar)
OCR/PDF/foto de horarios (interfaz de importación), QR/NFC (campo `source` en entradas), notificaciones, varias escuelas, app nativa.
