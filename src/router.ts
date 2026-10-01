import { useSyncExternalStore } from "react";

export type RoutePath = "/" | "/personal" | "/incidencias" | "/coberturas" | "/reportes" | "/auditoria" | "/grupos" | "/horarios" | "/configuracion" | "/mas" | "/ficha";
export interface Route { path: RoutePath; param: string }

const ROUTES: readonly RoutePath[] = ["/", "/personal", "/incidencias", "/coberturas", "/reportes", "/auditoria", "/grupos", "/horarios", "/configuracion", "/mas", "/ficha"];

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

function snapshot(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

export function parseRoute(hash: string): Route {
  const [, first = "", param = ""] = hash.split("/");
  const path = (`/${first}` as RoutePath);
  return { path: ROUTES.includes(path) ? path : "/", param: decodeURIComponent(param) };
}

/** Rutas con # para que funcione en GitHub Pages sin configurar el servidor. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, snapshot, () => "/");
  return parseRoute(hash);
}

export const goTo = (path: string) => { window.location.hash = path; };
