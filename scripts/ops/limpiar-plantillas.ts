/**
 * Removes the client's and the property's data from the firms' templates
 * saved before 2 Nov 2026 with "Incluir datos" (such as "Departamentos
 * Jalisco"): every captured value goes blank except the appraiser's texts
 * (Consideraciones, long texts and paragraphs); formats, formulas, labels
 * and images stay. A dry run unless --apply is given.
 *
 *   pnpm templates:clean                 lists what each template would lose
 *   pnpm templates:clean --apply         rewrites the version in use of each template
 *   pnpm templates:clean --org <id>      only the templates of that organization
 *
 * Inside the production container: node --import tsx scripts/ops/limpiar-plantillas.ts [--apply]
 */
import { Prisma } from "@prisma/client";

import { buildDocumentTemplate, readDocumentTemplate, templateContainsData } from "../../src/features/valuations/services/document-template";
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

/** How many captured values the cleaning blanks, to say what changes. */
function valuesRemoved(before: { sections: Array<{ blocks: Array<{ concepts: Array<{ value: string }>; apartados: Array<{ concepts: Array<{ value: string }> }> }> }> }, after: typeof before) {
  const count = (content: typeof before) => content.sections.flatMap((section) => section.blocks)
    .flatMap((block) => [...block.concepts, ...block.apartados.flatMap((apartado) => apartado.concepts)])
    .filter((concept) => concept.value.trim() !== "").length;
  return count(before) - count(after);
}

async function main() {
  const { apply, organizationId } = parseArgs(process.argv.slice(2));
  const templates = await prisma.plantillaAvaluo.findMany({
    where: { BEsSistema: false, BActivo: true, DFechaEliminacion: null, ...(organizationId ? { IdOrganizacion: organizationId } : {}) },
    orderBy: [{ IdOrganizacion: "asc" }, { SNombre: "asc" }],
    select: {
      IdPlantillaAvaluo: true,
      IdOrganizacion: true,
      SNombre: true,
      versiones: { where: { BActiva: true }, orderBy: { INumeroVersion: "desc" }, take: 1, select: { IdVersionPlantilla: true, INumeroVersion: true, JConfiguracionGeneral: true } },
    },
  });

  let cleaned = 0;
  for (const template of templates) {
    const version = template.versiones[0];
    const content = readDocumentTemplate(version?.JConfiguracionGeneral);
    const name = `[org ${template.IdOrganizacion}] "${template.SNombre}" (versión ${version?.INumeroVersion ?? "?"})`;
    if (!version || !content) {
      console.log(`${name}: sin documento, se omite.`);
      continue;
    }
    if (!templateContainsData(content.sections)) {
      console.log(`${name}: sin datos de cliente.`);
      continue;
    }
    const clean = buildDocumentTemplate(content.sections, { includeImages: content.includeImages });
    const removed = valuesRemoved(content, clean);
    if (!apply) {
      console.log(`${name}: contiene datos; se vaciarían ${removed} valores capturados (dry run).`);
      continue;
    }
    await prisma.versionPlantilla.update({
      where: { IdVersionPlantilla: version.IdVersionPlantilla },
      data: { JConfiguracionGeneral: clean as unknown as Prisma.InputJsonObject },
    });
    cleaned += 1;
    console.log(`${name}: limpiada, ${removed} valores vaciados.`);
  }
  console.log(apply ? `Listo: ${cleaned} plantilla(s) limpiada(s).` : `Dry run: ${templates.length} plantilla(s) revisadas. Usa --apply para limpiar.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
