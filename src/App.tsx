import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { db } from "@/data/db";
import { isDemo, exitDemo, resetDemo, demoReady, markDemoReady, DEMO_DB_NAME } from "@/data/mode";
import Dexie from "dexie";
import { seedDemo } from "@/data/demo";
import { useRoute, type RoutePath } from "@/router";
import { GroupsPage } from "@/pages/GroupsPage";
import { HomePage } from "@/pages/HomePage";
import { SchedulesPage } from "@/pages/SchedulesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SetupPage } from "@/pages/SetupPage";
import { StaffPage } from "@/pages/StaffPage";
import { IncidentsPage } from "@/pages/IncidentsPage";
import { CoveragesPage } from "@/pages/CoveragesPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { AuditPage } from "@/pages/AuditPage";
import { StaffFilePage } from "@/pages/StaffFilePage";
import { MorePage } from "@/pages/MorePage";
import { AppBanners } from "@/ui/AppBanners";

const NAV: { path: RoutePath; label: string; icon: string }[] = [
  { path: "/", label: "Inicio", icon: "🏠" },
  { path: "/personal", label: "Personal", icon: "👥" },
  { path: "/incidencias", label: "Incidencias", icon: "📝" },
  { path: "/coberturas", label: "Coberturas", icon: "🔁" },
  { path: "/reportes", label: "Reportes", icon: "📊" },
  { path: "/grupos", label: "Grupos", icon: "🏫" },
  { path: "/horarios", label: "Horarios", icon: "🗓️" },
  { path: "/auditoria", label: "Auditoría", icon: "🔎" },
  { path: "/configuracion", label: "Configuración", icon: "⚙️" },
];
const BOTTOM: { path: RoutePath; label: string; icon: string }[] = [
  ...NAV.slice(0, 4),
  { path: "/mas", label: "Más", icon: "⋯" },
];
const MORE_PATHS: RoutePath[] = ["/mas", "/reportes", "/grupos", "/horarios", "/auditoria", "/configuracion", "/ficha"];

/**
 * Diseño automático según la pantalla (sin botones):
 * - Celular en vertical (< 640 px): barra de navegación abajo, contenido a todo el ancho.
 * - Celular en horizontal, tableta y computadora (≥ 640 px): barra lateral a la izquierda,
 *   para no gastar la poca altura de una pantalla horizontal.
 */
export default function App() {
  const { path: route, param } = useRoute();
  const settings = useLiveQuery(async () => (await db.settings.get("main")) ?? null);

  const demo = isDemo();
  const [demoOk, setDemoOk] = useState(() => !demo || demoReady());
  const seeding = useRef(false);
  useEffect(() => {
    if (!demo || demoOk || seeding.current) return;
    seeding.current = true;
    void (async () => {
      try {
        // Si quedó una demo a medias (se cerró la página mientras se generaba), se descarta y se genera completa.
        if ((await db.settings.count()) > 0) { db.close(); await Dexie.delete(DEMO_DB_NAME); window.location.reload(); return; }
        await seedDemo(db);
        markDemoReady(true);
        setDemoOk(true);
      } catch { seeding.current = false; }
    })();
  }, [demo, demoOk]);

  if (!demoOk || settings === undefined) return <p className="p-6 text-stone-600">{demo ? "Preparando datos de demostración…" : "Cargando…"}</p>;
  if (settings === null) return <SetupPage />;

  return (
    <>
      {demo ? (
        <div role="status" className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 px-3 py-1.5 pt-[calc(0.375rem+env(safe-area-inset-top))] text-center text-sm font-bold text-stone-900">
          <span>MODO DEMOSTRACIÓN · datos ficticios</span>
          <button type="button" className="underline" onClick={() => void exitDemo(false)}>Salir (conserva la demo)</button>
          <button type="button" className="underline" onClick={() => { if (window.confirm("Se borrará la demo y se generará de nuevo. Tus datos reales no se tocan. ¿Continuar?")) void resetDemo(); }}>Reiniciar demo</button>
          <button type="button" className="underline" onClick={() => { if (window.confirm("Se borrarán los datos de la demo. ¿Continuar?")) void exitDemo(true); }}>Salir y borrar demo</button>
        </div>
      ) : null}
    <div className="min-h-dvh sm:flex">
      <aside className={`sticky top-0 hidden h-dvh w-44 shrink-0 flex-col overflow-y-auto border-r border-stone-200 bg-white pl-[env(safe-area-inset-left)] sm:flex lg:w-56`}>
        <p className="border-b border-stone-200 px-4 py-4 text-sm font-bold text-emerald-900">{settings.schoolName}</p>
        <nav aria-label="Menú principal" className="flex flex-col gap-1 p-2">
          {NAV.map((n) => (
            <a key={n.path} href={`#${n.path}`} aria-current={route === n.path ? "page" : undefined} className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${route === n.path ? "bg-emerald-100 text-emerald-900" : "text-stone-700 hover:bg-stone-100"}`}>
              <span aria-hidden="true">{n.icon}</span>
              {n.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className={`min-w-0 flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom))] sm:pb-0`}>
        <header className="border-b border-stone-200 bg-white px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:hidden">
          <p className="font-bold text-emerald-900">{settings.schoolName}</p>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6 pr-[max(1rem,env(safe-area-inset-right))]">
          <AppBanners />
          {route === "/" ? <HomePage /> : route === "/personal" ? <StaffPage /> : route === "/ficha" ? <StaffFilePage staffId={param} /> : route === "/incidencias" ? <IncidentsPage /> : route === "/coberturas" ? <CoveragesPage /> : route === "/reportes" ? <ReportsPage /> : route === "/auditoria" ? <AuditPage /> : route === "/mas" ? <MorePage /> : route === "/grupos" ? <GroupsPage /> : route === "/horarios" ? <SchedulesPage /> : <SettingsPage />}
        </main>
      </div>

      <nav aria-label="Menú principal" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        {BOTTOM.map((n) => (
          <a key={n.path} href={`#${n.path}`} aria-current={route === n.path || (n.path === "/mas" && MORE_PATHS.includes(route)) ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${route === n.path || (n.path === "/mas" && MORE_PATHS.includes(route)) ? "text-emerald-800" : "text-stone-600"}`}>
            <span aria-hidden="true" className="text-lg">{n.icon}</span>
            {n.label}
          </a>
        ))}
      </nav>
    </div>
    </>
  );
}
