import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { useRoute, type RoutePath } from "@/router";
import { GroupsPage } from "@/pages/GroupsPage";
import { HomePage } from "@/pages/HomePage";
import { SchedulesPage } from "@/pages/SchedulesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SetupPage } from "@/pages/SetupPage";
import { StaffPage } from "@/pages/StaffPage";

const NAV: { path: RoutePath; label: string; icon: string }[] = [
  { path: "/", label: "Inicio", icon: "🏠" },
  { path: "/personal", label: "Personal", icon: "👥" },
  { path: "/grupos", label: "Grupos", icon: "🏫" },
  { path: "/horarios", label: "Horarios", icon: "🗓️" },
  { path: "/configuracion", label: "Ajustes", icon: "⚙️" },
];

/**
 * Diseño automático según la pantalla (sin botones):
 * - Celular en vertical (< 640 px): barra de navegación abajo, contenido a todo el ancho.
 * - Celular en horizontal, tableta y computadora (≥ 640 px): barra lateral a la izquierda,
 *   para no gastar la poca altura de una pantalla horizontal.
 */
export default function App() {
  const route = useRoute();
  const settings = useLiveQuery(async () => (await db.settings.get("main")) ?? null);

  if (settings === undefined) return <p className="p-6 text-stone-600">Cargando…</p>;
  if (settings === null) return <SetupPage />;

  return (
    <div className="min-h-dvh sm:flex">
      <aside className="sticky top-0 hidden h-dvh w-44 shrink-0 flex-col overflow-y-auto border-r border-stone-200 bg-white pl-[env(safe-area-inset-left)] sm:flex lg:w-56">
        <p className="border-b border-stone-200 px-4 py-4 text-sm font-bold text-emerald-900">{settings.schoolName}</p>
        <nav aria-label="Menú principal" className="flex flex-col gap-1 p-2">
          {NAV.map((n) => (
            <a key={n.path} href={`#${n.path}`} aria-current={route === n.path ? "page" : undefined} className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${route === n.path ? "bg-emerald-100 text-emerald-900" : "text-stone-700 hover:bg-stone-100"}`}>
              <span aria-hidden="true">{n.icon}</span>
              {n.label === "Ajustes" ? "Configuración" : n.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom))] sm:pb-0">
        <header className="border-b border-stone-200 bg-white px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:hidden">
          <p className="font-bold text-emerald-900">{settings.schoolName}</p>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6 pr-[max(1rem,env(safe-area-inset-right))]">
          {route === "/" ? <HomePage /> : route === "/personal" ? <StaffPage /> : route === "/grupos" ? <GroupsPage /> : route === "/horarios" ? <SchedulesPage /> : <SettingsPage />}
        </main>
      </div>

      <nav aria-label="Menú principal" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        {NAV.map((n) => (
          <a key={n.path} href={`#${n.path}`} aria-current={route === n.path ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${route === n.path ? "text-emerald-800" : "text-stone-600"}`}>
            <span aria-hidden="true" className="text-lg">{n.icon}</span>
            {n.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
