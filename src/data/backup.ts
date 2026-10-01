import { BACKUP_TABLES, type AppDb } from "./db";

export interface BackupFile {
  app: "gestion-personal-escolar";
  version: 1;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(bin)}`;
}

function dataUrlToBlob(url: string): Blob {
  const [head, body = ""] = url.split(",");
  const mime = /data:([^;]*)/.exec(head)?.[1] || "application/octet-stream";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function exportBackup(database: AppDb): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const name of BACKUP_TABLES) tables[name] = await database.table(name).toArray();
  // Los documentos adjuntos (Blob) viajan como texto dentro del respaldo.
  tables.documents = await Promise.all((tables.documents as { blob: Blob }[]).map(async (d) => ({ ...d, blob: await blobToDataUrl(d.blob) })));
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
      const prepared = name === "documents" ? rows.map((d) => { const x = d as { blob: unknown }; return { ...x, blob: typeof x.blob === "string" ? dataUrlToBlob(x.blob) : x.blob }; }) : rows;
      await database.table(name).bulkAdd(prepared);
    }
  });
}
