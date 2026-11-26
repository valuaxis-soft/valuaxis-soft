/**
 * Retention of concluded valuations (matrix 1.12; Terms 14.3; docs/CUENTAS.md):
 * a concluded valuation is never deleted; twelve months after its conclusion
 * the stored copies of its exports (the PDFs kept at each download) are
 * removed. Prints counts only, never folios or names. Meant for a daily cron
 * (docs/OPERACION.md §21).
 *
 *   pnpm valuations:retention --dry-run    counts what it would do (the default)
 *   pnpm valuations:retention --apply      deletes the copies, only with VALUATION_RETENTION_ENABLED=true
 *
 * Inside the production container: node --import tsx scripts/ops/guarda-avaluos.ts [--apply]
 */
import { isValuationRetentionEnabled, runRetention } from "../../src/features/valuations/retention/retention.service";
import { prisma } from "../../src/infrastructure/database/prisma-client";

async function main() {
  const wantsApply = process.argv.slice(2).includes("--apply") && !process.argv.slice(2).includes("--dry-run");
  const enabled = isValuationRetentionEnabled();
  if (wantsApply && !enabled) {
    console.log("VALUATION_RETENTION_ENABLED no está en «true»: no se borra nada. Esto es lo que haría:");
  }
  const result = await runRetention({ apply: wantsApply });
  const verb = result.applied ? "" : " (simulación)";
  console.log(`Avalúos concluidos revisados (ninguno se borra): ${result.reviewed}`);
  console.log(`Avalúos con copias de PDF de más de doce meses que se quitan${verb}: ${result.pruned}`);
  if (result.applied) {
    console.log(`No se pudieron quitar (quedan como estaban): ${result.blocked}`);
    console.log(`Archivos borrados del almacenamiento: ${result.filesDeleted}; con error: ${result.fileErrors}`);
  } else if (!wantsApply) {
    console.log("Corre con --apply (y VALUATION_RETENTION_ENABLED=true) para quitar las copias.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
