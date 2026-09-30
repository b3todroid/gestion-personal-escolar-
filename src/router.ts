import { useSyncExternalStore } from "react";

export type RoutePath = "/" | "/personal" | "/grupos" | "/horarios" | "/configuracion";

const ROUTES: readonly RoutePath[] = ["/", "/personal", "/grupos", "/horarios", "/configuracion"];

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

function current(): RoutePath {
  const path = window.location.hash.replace(/^#/, "") || "/";
  return ROUTES.find((r) => r === path) ?? "/";
}

/** Rutas con # para que funcione en GitHub Pages sin configurar el servidor. */
export function useRoute(): RoutePath {
  return useSyncExternalStore(subscribe, current, () => "/");
}
