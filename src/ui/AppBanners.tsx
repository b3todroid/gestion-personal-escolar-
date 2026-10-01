import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { isDemo } from "@/data/mode";

const KEY = "gpe-last-backup";
export const markBackupDone = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* sin almacenamiento */ } };
const lastBackup = (): number => { try { return Number(localStorage.getItem(KEY) ?? 0); } catch { return 0; } };
const DAYS = 14;

interface InstallEvent extends Event { prompt: () => Promise<void> }

/** Avisos discretos: respaldo atrasado e instalación de la app. */
export function AppBanners() {
  const staffCount = useLiveQuery(() => db.staff.count(), [], 0);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); };
    window.addEventListener("beforeinstallprompt", on);
    void navigator.storage?.persist?.().catch(() => undefined);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);

  if (hidden || isDemo()) return null;
  const last = lastBackup();
  const stale = staffCount > 0 && (last === 0 || now - last > DAYS * 86_400_000);
  if (!stale && !install) return null;
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
      {stale ? <p>💾 {last === 0 ? "Aún no has descargado un respaldo." : `Hace más de ${DAYS} días que no respaldas tus datos.`} <a className="font-semibold underline" href="#/configuracion">Descargar respaldo</a></p> : null}
      {install ? <p>📲 Puedes instalar la app en este dispositivo. <button type="button" className="font-semibold underline" onClick={() => { void install.prompt(); setInstall(null); }}>Instalar</button></p> : null}
      <button type="button" className="self-start text-xs underline" onClick={() => setHidden(true)}>Ocultar por ahora</button>
    </div>
  );
}
