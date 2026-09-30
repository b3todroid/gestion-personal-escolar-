const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "HH:MM" de 24 horas. */
export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function toMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export const WEEKDAYS = [
  { n: 1, label: "Lunes" },
  { n: 2, label: "Martes" },
  { n: 3, label: "Miércoles" },
  { n: 4, label: "Jueves" },
  { n: 5, label: "Viernes" },
] as const;
