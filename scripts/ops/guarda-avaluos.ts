/**
 * Retention of concluded valuations (matrix 1.12; Terms 14.3; docs/CUENTAS.md):
 * the email thirty days before the retention expires and, once expired,
 * suppressing the valuation's content with its third-party and advertiser
 * data. Prints counts only, never folios or names. Meant for a daily cron
 * (docs/OPERACION.md §21).
 *
 *   pnpm valuations:retention --dry-run    counts what it would do (the default)
 *   pnpm valuations:retention --apply      sends and deletes, only with VALUATION_RETENTION_ENABLED=true
 *
 * Inside the production container: node --import tsx scripts/ops/guarda-avaluos.ts [--apply]
 */
import { isValuationRetentionEnabled, runRetention } from "../../src/features/valuations/retention/retention.service";
import { prisma } from "../../src/infrastructure/database/prisma-client";

async function main() {
  const wantsApply = process.argv.slice(2).includes("--apply") && !process.argv.slice(2).includes("--dry-run");
  const enabled = isValuationRetentionEnabled();
  if (wantsApply && !enabled) {
    console.log("VALUATION_RETENTION_ENABLED no está en «true»: no se envía ni se borra nada. Esto es lo que haría:");
  }
  const result = await runRetention({ apply: wantsApply });
  const verb = result.applied ? "" : " (simulación)";
  console.log(`Avalúos concluidos en guarda: ${result.reviewed}`);
  console.log(`Correos «descarga o respalda tu reporte»${verb}: ${result.warnings}`);
  console.log(`Avalúos suprimidos al vencer su guarda${verb}: ${result.suppressed}`);
  if (result.applied) {
    console.log(`No se pudieron suprimir (quedan como estaban): ${result.blocked}`);
    console.log(`Archivos borrados del almacenamiento: ${result.filesDeleted}; con error: ${result.fileErrors}`);
    console.log(`Correos que fallaron (se reintentan mañana): ${result.failedEmails}`);
  } else if (!wantsApply) {
    console.log("Corre con --apply (y VALUATION_RETENTION_ENABLED=true) para enviar y suprimir.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
