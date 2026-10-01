# Sistema de Gestión de Personal Escolar

App web de un solo usuario para el control administrativo del personal escolar: entradas, retardos, faltas, permisos, licencias, horarios, coberturas y reportes. **Sin inicio de sesión y sin servidor: los datos se guardan en el propio dispositivo** (funciona sin internet).

**Estado:** las 8 fases están implementadas: tablero «Hoy» (llegadas, retardos automáticos, faltas rápidas), incidencias (día completo, por periodos o rango de horas, varios días), clases afectadas detectadas del horario, coberturas, ficha del personal, 8 reportes (PDF carta resumido/detallado con firmas y logo, Excel y CSV), auditoría con antes/después, días no laborables, ciclos escolares, importación de horarios (CSV/Excel), respaldo, modo demostración y app instalable que funciona sin internet. Se adapta sola a vertical u horizontal.

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

## Modo demostración
En **Configuración → Modo demostración** (o en la pantalla de inicio) se abre una copia con datos ficticios para probar o capacitar. Usa una base de datos aparte: tus datos reales no se tocan.

## Instalar como app
En el celular o la computadora, el navegador ofrece «Instalar» (la app también avisa dentro de la pantalla). Después de la primera visita funciona sin internet.

## Respaldo (importante)
Los datos viven solo en el navegador del aparato. En **Configuración → Respaldo de datos** usa **Descargar respaldo** con frecuencia y guarda el archivo en tu nube o correo. **Restaurar desde archivo…** reemplaza todo por el respaldo (también sirve para pasar los datos a otro aparato). Si borras los datos del navegador, se pierden.

## Documentación de diseño
`docs/`: requisitos, arquitectura, esquema de datos y plan por fases. El primer intento con Next.js + Supabase quedó descartado (decisión D-8: un solo usuario, sin login).
