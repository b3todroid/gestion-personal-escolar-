import { BACKUP_TABLES, type AppDb } from "./db";

export interface BackupFile {
  app: "gestion-personal-escolar";
  version: 1;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportBackup(database: AppDb): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const name of BACKUP_TABLES) tables[name] = await database.table(name).toArray();
  return { app: "gestion-personal-escolar", version: 1, exportedAt: new Date().toISOString(), tables };
}

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("El archivo no es un respaldo válido.");
  }
  const file = data as Partial<BackupFile>;
  if (file.app !== "gestion-personal-escolar" || file.version !== 1 || typeof file.tables !== "object" || file.tables === null) {
    throw new Error("El archivo no es un respaldo de esta aplicación.");
  }
  return file as BackupFile;
}

/** Reemplaza TODOS los datos por los del respaldo, en una sola transacción (o no cambia nada). */
export async function restoreBackup(database: AppDb, file: BackupFile): Promise<void> {
  const tables = BACKUP_TABLES.map((n) => database.table(n));
  await database.transaction("rw", tables, async () => {
    for (const name of BACKUP_TABLES) {
      // Respaldos hechos antes de existir una tabla nueva la traen ausente: se restaura vacía.
      const rows = file.tables[name] ?? (name === "settings" ? undefined : []);
      if (!Array.isArray(rows)) throw new Error(`Al respaldo le falta la sección «${name}».`);
      await database.table(name).clear();
      await database.table(name).bulkAdd(rows);
    }
  });
}
