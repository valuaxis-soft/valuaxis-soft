/**
 * Moves to «En edición» the valuations that stayed «Nuevo» although they were
 * already captured (saved more than 2 minutes after their creation, or with
 * comparables): before 2 Nov 2026 the first save did not move them (AUD-14).
 * Each one gets a row in its status history that says it was a correction.
 * A dry run unless --apply is given.
 *
 *   pnpm valuations:fix-status                 lists what would change
 *   pnpm valuations:fix-status --apply         changes them
 *   pnpm valuations:fix-status --org <id>      only that organization
 *
 * Inside the production container: node --import tsx scripts/ops/corregir-estado-nuevo.ts [--apply]
 */
import { advanceStaleNewValuations, findStaleNewValuations } from "../../src/features/valuations/services/valuation-status-repair";
import { prisma } from "../../src/infrastructure/database/prisma-client";

function parseArgs(argv: string[]) {
  let apply = false;
  let organizationId: number | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") apply = true;
    else if (arg === "--dry-run") apply = false;
    else if (arg === "--org") organizationId = Number.parseInt(argv[++index] ?? "", 10) || null;
  }
  return { apply, organizationId };
}

async function main() {
  const { apply, organizationId } = parseArgs(process.argv.slice(2));
  const stale = await findStaleNewValuations({ organizationId });
  for (const valuation of stale) {
    console.log(`[org ${valuation.organizationId}] ${valuation.folio}: creado ${valuation.createdAt.toISOString()}, modificado ${valuation.updatedAt.toISOString()}, ${valuation.comparables} comparables`);
  }
  if (!stale.length) {
    console.log("No hay avalúos en «Nuevo» con captura. Nada que corregir.");
    return;
  }
  if (!apply) {
    console.log(`\n${stale.length} avalúos pasarían a «En edición». Corre con --apply para cambiarlos.`);
    return;
  }
  const changed = await advanceStaleNewValuations(stale);
  console.log(`\n${changed} avalúos pasaron a «En edición».`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
