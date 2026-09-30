# Sistema de Gestión de Personal Escolar

App web de un solo usuario para el control administrativo del personal escolar: entradas, retardos, faltas, permisos, licencias, horarios, coberturas y reportes. **Sin inicio de sesión y sin servidor: los datos se guardan en el propio dispositivo** (funciona sin internet).

**Estado:** Fases 1 a 3 de 8: configuración de la escuela, categorías, personal y horarios laborales, grupos, materias, horarios docentes (por docente y por grupo) e importación desde CSV, respaldo. Se adapta solo a vertical u horizontal. Ver `docs/IMPLEMENTATION_PLAN.md`.

## Usar en tu computadora
Requisito: Node.js 20 o superior.
```bash
npm install
npm run dev
```
Abre la dirección que aparece (normalmente http://localhost:5173).

## Comandos
| Comando | Para qué sirve |
|---|---|
| `npm run dev` | Modo desarrollo |
| `npm run lint` | Revisar código |
| `npm run typecheck` | Revisar tipos |
| `npm test` | Pruebas |
| `npm run build` | Construir para publicar (carpeta `dist`) |

## Publicar en GitHub Pages (como Control Docente Integral)
1. Sube el proyecto a un repositorio nuevo en GitHub (rama `main`).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Cada vez que subas cambios, GitHub revisa (lint, tipos, pruebas) y publica solo. La dirección aparece en **Settings → Pages**.

## Respaldo (importante)
Los datos viven solo en el navegador del aparato. En **Configuración → Respaldo de datos** usa **Descargar respaldo** con frecuencia y guarda el archivo en tu nube o correo. **Restaurar desde archivo…** reemplaza todo por el respaldo (también sirve para pasar los datos a otro aparato). Si borras los datos del navegador, se pierden.

## Documentación de diseño
`docs/`: requisitos, arquitectura, esquema de datos y plan por fases. El primer intento con Next.js + Supabase quedó descartado (decisión D-8: un solo usuario, sin login).
