const LINKS = [
  { href: "#/reportes", icon: "📊", label: "Reportes", hint: "PDF, Excel y CSV" },
  { href: "#/grupos", icon: "🏫", label: "Grupos y materias", hint: "Catálogos" },
  { href: "#/horarios", icon: "🗓️", label: "Horarios", hint: "Por docente o por grupo" },
  { href: "#/auditoria", icon: "🔎", label: "Auditoría", hint: "Historial de cambios" },
  { href: "#/configuracion", icon: "⚙️", label: "Configuración", hint: "Escuela, periodos, respaldo" },
];

export function MorePage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Más</h1>
      <ul className="flex flex-col gap-2">
        {LINKS.map((l) => (
          <li key={l.href}>
            <a href={l.href} className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-4 hover:bg-stone-50">
              <span aria-hidden="true" className="text-2xl">{l.icon}</span>
              <span><span className="block font-semibold">{l.label}</span><span className="text-sm text-stone-600">{l.hint}</span></span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
