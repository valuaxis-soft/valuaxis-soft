/**
 * Draws again over OpenStreetMap the croquis stored over a Google Maps image
 * (before 25 nov 2026), and those of open valuations drawn on the first,
 * one-tone OpenStreetMap base (before 27 nov 2026, now with parks, water and
 * land uses), from each valuation's saved croquis data
 * (src/features/maps/server/croquis-regeneration.service.ts). Prints counts
 * only, never the client's data.
 *
 *   pnpm maps:regenerate-croquis --dry-run                      what it would do (the default)
 *   pnpm maps:regenerate-croquis --apply                        valuations not concluded
 *   pnpm maps:regenerate-croquis --apply --include-concluded    concluded ones with a Google image too
 *   pnpm maps:regenerate-croquis --apply --org <id>             only that organization
 *
 * Inside the production container: node --import tsx scripts/ops/regenerar-croquis.ts --dry-run
 */
import { regenerateCroquis } from "../../src/features/maps/server/croquis-regeneration.service";
import { prisma } from "../../src/infrastructure/database/prisma-client";

function parseArgs(argv: string[]) {
  let apply = false;
  let includeConcluded = false;
  let organizationId: number | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") apply = true;
    else if (arg === "--dry-run") apply = false;
    else if (arg === "--include-concluded") includeConcluded = true;
    else if (arg === "--org") organizationId = Number.parseInt(argv[++index] ?? "", 10) || null;
    else {
      console.error(`Opción desconocida: ${arg}. Usa --dry-run, --apply, --include-concluded o --org <id>.`);
      process.exit(2);
    }
  }
  return { apply, includeConcluded, organizationId };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`${options.apply ? "Aplicando" : "Dry run (no se escribe nada)"}${options.includeConcluded ? ", con avalúos concluidos" : ""}${options.organizationId ? `, organización ${options.organizationId}` : ""}.\n`);
  const report = await regenerateCroquis(options);
  console.log(`Avalúos con croquis: ${report.valuations}`);
  console.log(`Croquis encontrados: ${report.croquis}`);
  console.log(`${options.apply ? "Redibujados" : "Se redibujarían"} con OpenStreetMap: ${report.regenerated}`);
  console.log(`Ya estaban en OpenStreetMap con el estilo actual: ${report.alreadyOpenStreetMap}`);
  console.log(`De avalúos concluidos, sin tocar${options.includeConcluded ? "" : " (los de imagen de Google: usa --include-concluded)"}: ${report.concluded}`);
  console.log(`Sin ubicación del inmueble (no se pueden redibujar): ${report.withoutLocation}`);
  console.log(`Imágenes que no generó el generador (subidas a mano o sin archivo): ${report.notGenerated}`);
  console.log(`Con error: ${report.failed}`);
  console.log(`PDF del dictamen guardados de esas versiones (conservan la imagen anterior): ${report.storedPdfs}`);
  if (report.failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
