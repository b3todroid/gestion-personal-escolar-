export type CountsAs = "absence" | "late" | "leave" | "permit" | "certificate" | "other";

export type DayStatus = "present" | "late" | "absent" | "leave" | "permit" | "certificate" | "other" | "no_record" | "not_expected";

/** Texto + icono: el estado nunca depende solo del color. */
export const STATUS_INFO: Record<DayStatus, { label: string; icon: string; tone: "ok" | "warn" | "bad" | "info" | "off" }> = {
  present: { label: "Presente", icon: "✓", tone: "ok" },
  late: { label: "Retardo", icon: "⏱", tone: "warn" },
  absent: { label: "Ausente", icon: "✗", tone: "bad" },
  leave: { label: "Licencia", icon: "✚", tone: "info" },
  permit: { label: "Permiso", icon: "✎", tone: "info" },
  certificate: { label: "Constancia", icon: "▤", tone: "info" },
  other: { label: "Incidencia", icon: "●", tone: "info" },
  no_record: { label: "Sin registro", icon: "?", tone: "warn" },
  not_expected: { label: "No labora", icon: "–", tone: "off" },
};

/**
 * Estado de una persona en un día.
 * Una incidencia de día completo manda sobre la entrada; si no hay, cuenta la entrada; si tampoco, «sin registro».
 */
export function dayStatus(input: { expected: boolean; entryStatus?: "on_time" | "late"; fullDayCountsAs?: CountsAs }): DayStatus {
  switch (input.fullDayCountsAs) {
    case "absence": return "absent";
    case "leave": return "leave";
    case "permit": return "permit";
    case "certificate": return "certificate";
    case "late": return "late";
    case "other": return "other";
    default: break;
  }
  if (input.entryStatus === "late") return "late";
  if (input.entryStatus === "on_time") return "present";
  return input.expected ? "no_record" : "not_expected";
}
