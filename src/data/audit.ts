import type { AppDb } from "./db";
import type { AuditEntry } from "./types";

export async function logAudit(
  database: AppDb,
  entry: Omit<AuditEntry, "id" | "at" | "reason"> & { reason?: string },
): Promise<void> {
  await database.audit.add({ ...entry, reason: entry.reason ?? "", id: crypto.randomUUID(), at: new Date().toISOString() });
}
