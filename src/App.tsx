import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { useRoute, type RoutePath } from "@/router";
import { HomePage } from "@/pages/HomePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SetupPage } from "@/pages/SetupPage";
import { StaffPage } from "@/pages/StaffPage";

const NAV: { path: RoutePath; label: string; icon: string }[] = [
  { path: "/", label: "Inicio", icon: "🏠" },
  { path: "/personal", label: "Personal", icon: "👥" },
  { path: "/configuracion", label: "Configuración", icon: "⚙️" },
];

export default function App() {
  const route = useRoute();
  const settings = useLiveQuery(async () => (await db.settings.get("main")) ?? null);

  if (settings === undefined) return <p className="p-6 text-stone-600">Cargando…</p>;
  if (settings === null) return <SetupPage />;

  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <p className="font-bold text-emerald-900">{settings.schoolName}</p>
          <nav aria-label="Menú principal" className="hidden gap-1 sm:flex">
            {NAV.map((n) => (
              <a key={n.path} href={`#${n.path}`} aria-current={route === n.path ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-medium ${route === n.path ? "bg-emerald-100 text-emerald-900" : "text-stone-700 hover:bg-stone-100"}`}>
                {n.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {route === "/" ? <HomePage /> : route === "/personal" ? <StaffPage /> : <SettingsPage />}
      </main>
      <nav aria-label="Menú principal" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-stone-200 bg-white sm:hidden">
        {NAV.map((n) => (
          <a key={n.path} href={`#${n.path}`} aria-current={route === n.path ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${route === n.path ? "text-emerald-800" : "text-stone-600"}`}>
            <span aria-hidden="true" className="text-lg">{n.icon}</span>
            {n.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
