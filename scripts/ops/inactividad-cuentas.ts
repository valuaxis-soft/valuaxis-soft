/**
 * Inactivity of accounts (Terms 14.1, point 1; docs/CUENTAS.md): the email
 * after three months without valuations, disabling the account some days
 * later, and withdrawing the notice when the person created a valuation.
 * Prints counts only, never who. Meant for a daily cron (docs/OPERACION.md §20).
 *
 *   pnpm accounts:inactivity --dry-run     counts what it would do (the default)
 *   pnpm accounts:inactivity --apply       sends and writes, only with ACCOUNT_INACTIVITY_ENABLED=true
 *
 * Inside the production container: node --import tsx scripts/ops/inactividad-cuentas.ts [--apply]
 */
import { isAccountInactivityEnabled, runInactivity } from "../../src/features/account/standing/inactivity.service";
import { prisma } from "../../src/infrastructure/database/prisma-client";

async function main() {
  const wantsApply = process.argv.slice(2).includes("--apply") && !process.argv.slice(2).includes("--dry-run");
  const enabled = isAccountInactivityEnabled();
  if (wantsApply && !enabled) {
    console.log("ACCOUNT_INACTIVITY_ENABLED no está en «true»: no se envía ni se cambia nada. Esto es lo que haría:");
  }
  const result = await runInactivity({ apply: wantsApply });
  const verb = result.applied ? "" : " (simulación)";
  console.log(`Cuentas revisadas: ${result.reviewed}`);
  console.log(`Correos de inactividad${verb}: ${result.notices}`);
  console.log(`Cuentas inhabilitadas${verb}: ${result.disabled}`);
  console.log(`Avisos retirados porque volvieron a crear avalúos${verb}: ${result.withdrawn}`);
  if (result.applied) console.log(`Correos que fallaron (se reintentan mañana): ${result.failedEmails}`);
  else if (!wantsApply) console.log("Corre con --apply (y ACCOUNT_INACTIVITY_ENABLED=true) para enviar y escribir.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
