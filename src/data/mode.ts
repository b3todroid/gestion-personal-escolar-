import Dexie from "dexie";

export const REAL_DB_NAME = "gestion-personal-escolar";
export const DEMO_DB_NAME = "gestion-personal-escolar-demo";
const FLAG = "gpe-demo";
const READY = "gpe-demo-ready";

export const demoReady = (): boolean => { try { return localStorage.getItem(READY) === "1"; } catch { return false; } };
export const markDemoReady = (v: boolean): void => { try { if (v) localStorage.setItem(READY, "1"); else localStorage.removeItem(READY); } catch { /* sin almacenamiento */ } };

export function isDemo(): boolean {
  try { return localStorage.getItem(FLAG) === "1"; } catch { return false; }
}

/** Activa el modo demo (base de datos separada) y recarga. Los datos reales no se tocan. */
export function enterDemo(): void {
  try { localStorage.setItem(FLAG, "1"); } catch { /* sin almacenamiento */ }
  window.location.reload();
}

export async function exitDemo(deleteDemoData: boolean): Promise<void> {
  try { localStorage.removeItem(FLAG); } catch { /* sin almacenamiento */ }
  if (deleteDemoData) { await Dexie.delete(DEMO_DB_NAME); markDemoReady(false); }
  window.location.reload();
}

/** Borra los datos de demostración y vuelve a generarlos. */
export async function resetDemo(): Promise<void> {
  await Dexie.delete(DEMO_DB_NAME);
  markDemoReady(false);
  window.location.reload();
}
