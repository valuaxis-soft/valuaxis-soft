import { exportCopiesDue } from "@/features/account/standing/account-standing-rules";
import { prisma } from "@/infrastructure/database/prisma-client";
import { storageProvider } from "@/infrastructure/storage/storage-provider";

/**
 * The retention of concluded valuations (matrix 1.12; Terms 14.3), run once a
 * day by `pnpm valuations:retention` (docs/OPERACION.md §21).
 *
 * A concluded valuation is never deleted: its content, its comparables and its
 * history stay, and it can be consulted and printed again at any time (client,
 * 26 Nov 2026). Twelve months after its conclusion only the heavy copies go:
 * the PDF kept in storage at each download of the dictamen or the memoria
 * (`devpware_exportaciones_avaluos`), which can be generated again from the
 * valuation. Each export row stays, as history, with its file emptied and the
 * day it went (`DFechaExpiracion`). The lawyer has to confirm this in Terms
 * 14.3 before it is turned on.
 *
 * Off unless VALUATION_RETENTION_ENABLED=true; even then nothing is deleted
 * without `apply`. The result has counts only, never folios or names.
 */

export const isValuationRetentionEnabled = (environment: Record<string, string | undefined> = process.env) =>
  environment.VALUATION_RETENTION_ENABLED?.trim().toLowerCase() === "true";

export type RetentionRunResult = {
  /** Concluded valuations reviewed. */
  reviewed: number;
  /** Valuations whose stored export copies are (or would be) removed. */
  pruned: number;
  /** Prunings that could not be done (left as they were). */
  blocked: number;
  /** Storage objects deleted, and those that could not be. */
  filesDeleted: number;
  fileErrors: number;
  applied: boolean;
};

type ObjectDeleter = { deleteObject(key: string): Promise<void> };

/**
 * Removes the stored copies of the valuation's exports in one transaction:
 * the files (database rows) go and the export rows stay with no file. Returns
 * the storage keys to delete once committed.
 */
async function pruneExportCopies(valuationId: number, now: Date): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const exports = await tx.exportacionAvaluo.findMany({
      where: { IdAvaluo: valuationId, IdArchivo: { not: null } },
      select: { IdExportacionAvaluo: true, IdArchivo: true },
    });
    const fileIds = [...new Set(exports.map((row) => row.IdArchivo as bigint))];
    if (!fileIds.length) return [];
    const files = await tx.archivo.findMany({
      where: { IdArchivo: { in: fileIds } },
      select: { IdArchivo: true, SClaveObjeto: true, versionesArchivo: { select: { SClaveObjeto: true } } },
    });
    await tx.exportacionAvaluo.updateMany({
      where: { IdExportacionAvaluo: { in: exports.map((row) => row.IdExportacionAvaluo) } },
      data: { IdArchivo: null, DFechaExpiracion: now },
    });
    await tx.relacionArchivo.deleteMany({ where: { IdArchivo: { in: fileIds } } });
    await tx.cargaArchivo.deleteMany({ where: { IdArchivo: { in: fileIds } } });
    await tx.archivo.deleteMany({ where: { IdArchivo: { in: fileIds } } });
    return [...new Set(files.flatMap((file) => [file.SClaveObjeto, ...file.versionesArchivo.map((version) => version.SClaveObjeto)]))];
  });
}

export async function runRetention(options: {
  apply: boolean;
  now?: Date;
  valuationIds?: readonly number[];
  storage?: ObjectDeleter;
}): Promise<RetentionRunResult> {
  const now = options.now ?? new Date();
  const apply = options.apply && isValuationRetentionEnabled();
  const storage = options.storage ?? storageProvider;
  const valuations = await prisma.avaluo.findMany({
    where: {
      BBloqueado: true,
      DFechaConclusion: { not: null },
      ...(options.valuationIds ? { IdAvaluo: { in: [...options.valuationIds] } } : {}),
    },
    select: {
      IdAvaluo: true,
      DFechaConclusion: true,
      _count: { select: { exportacionesAvaluos: { where: { IdArchivo: { not: null } } } } },
    },
  });

  const result: RetentionRunResult = { reviewed: 0, pruned: 0, blocked: 0, filesDeleted: 0, fileErrors: 0, applied: apply };
  for (const valuation of valuations) {
    result.reviewed += 1;
    if (!valuation._count.exportacionesAvaluos || !exportCopiesDue(valuation.DFechaConclusion as Date, now)) continue;
    result.pruned += 1;
    if (!apply) continue;
    try {
      for (const key of await pruneExportCopies(valuation.IdAvaluo, now)) {
        try {
          await storage.deleteObject(key);
          result.filesDeleted += 1;
        } catch {
          result.fileErrors += 1;
        }
      }
    } catch (error) {
      result.pruned -= 1;
      result.blocked += 1;
      console.error("[RETENTION] The export copies of a valuation could not be removed", error instanceof Error ? error.name : "unknown");
    }
  }
  return result;
}
