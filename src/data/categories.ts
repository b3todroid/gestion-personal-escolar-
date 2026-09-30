import type { AppDb } from "./db";
import { logAudit } from "./audit";

export async function saveCategory(database: AppDb, input: { id?: string; name: string; isTeaching: boolean; isActive: boolean }): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new Error("Escribe el nombre de la categoría.");
  const all = await database.categories.toArray();
  if (all.some((c) => c.id !== input.id && c.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`Ya existe la categoría «${name}».`);
  }
  const before = input.id ? await database.categories.get(input.id) : undefined;
  const id = input.id ?? crypto.randomUUID();
  const record = { id, name, isTeaching: input.isTeaching, isActive: input.isActive };
  await database.categories.put(record);
  await logAudit(database, { table: "categories", recordId: id, action: before ? "update" : "create", summary: `Categoría «${name}»`, before: before ?? null, after: record });
}
// Las categorías nunca se borran: se desactivan, para no perder el historial de quienes ya la usaron.
