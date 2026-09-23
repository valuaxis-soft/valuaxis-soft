import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma-client";
import type { AuthUser } from "@/features/auth/model";
import {
  getCanonicalSectionKey,
  sectionKeyToWorkspaceId,
} from "@/features/valuations/sections/section-registry";
import { saveCaratula } from "./caratula";
import { limitDbText } from "./db-values";
import {
  softDeleteMissingChildren,
  softDeleteMissingRootNodes,
  syncConcepts,
  syncImages,
  upsertDocumentNode,
} from "./document-nodes";
import { syncTablesForNode } from "./document-tables";
import { ValuationWorkflowError } from "./errors";
import {
  createPersistenceStats,
  getDocumentPersistenceCatalogs,
  logPersistenceStats,
} from "./persistence-context";
import type { CaratulaPayload, SectionPayload, Tx } from "./types";
import { initializeWorkingVersionStructure } from "./working-version";

export async function saveValuationSections(input: {
  publicId: string;
  organizationId: number;
  sections: SectionPayload[];
  user: AuthUser;
  caratula?: CaratulaPayload;
}) {
  return prisma.$transaction(async (tx) => {
    const debug = process.env.VALUATION_SAVE_DEBUG === "1";
    const stats = createPersistenceStats(input.sections);
    if (debug) console.log("[VALUATION_SECTIONS] Starting saveValuationSections", {
      publicId: input.publicId,
      organizationId: input.organizationId,
      sections: input.sections.length,
      caratula: Boolean(input.caratula),
    });

    const avaluo = await tx.avaluo.findFirst({
      where: {
        UIdentificadorPublico: input.publicId,
        IdOrganizacion: input.organizationId,
        BActivo: true,
        DFechaEliminacion: null,
      },
      select: { IdAvaluo: true, IdVersionTrabajo: true, BBloqueado: true },
    });
    if (!avaluo) {
      console.error("[VALUATION_SECTIONS] Avaluo no encontrado", { publicId: input.publicId, organizationId: input.organizationId });
      throw new ValuationWorkflowError("Avaluo no encontrado", 404);
    }
    if (avaluo.BBloqueado) {
      console.error("[VALUATION_SECTIONS] Avaluo bloqueado", { publicId: input.publicId });
      throw new ValuationWorkflowError("El avaluo esta bloqueado", 409);
    }

    // Creates the working version when it is missing and syncs the registry sections.
    const versionId = await initializeWorkingVersionStructure({ avaluoId: avaluo.IdAvaluo, userId: input.user.id, tx });
    if (debug) console.log("[VALUATION_SECTIONS] versionId resolved", { versionId, idVersionTrabajo: avaluo.IdVersionTrabajo });
    const catalogs = await getDocumentPersistenceCatalogs(tx);

    for (const [index, section] of input.sections.entries()) {
      const canonical = getCanonicalSectionKey(section.id ?? section.label ?? `section-${index + 1}`);
      const key = sectionKeyToWorkspaceId(canonical);
      const existingSection = await findSectionByCanonicalKey(tx, versionId, canonical, debug);
      if (debug) console.log("[VALUATION_SECTIONS] resolved section for payload", {
        canonical,
        sectionId: section.id,
        sectionLabel: section.label,
        foundSectionId: existingSection?.IdSeccionDocumento,
        foundSectionKey: existingSection?.SClave,
      });
      const savedSection = existingSection
        ? await tx.seccionDocumento.update({
            where: { IdSeccionDocumento: existingSection.IdSeccionDocumento },
            data: {
              SNombre: limitDbText(section.title ?? key, 220),
              IOrden: section.sortOrder ?? index,
              BVisible: section.enabled ?? true,
              BObligatoria: section.required ?? false,
              BEliminable: false,
              JConfiguracion: section as Prisma.InputJsonObject,
            },
          })
        : await tx.seccionDocumento.create({
            data: {
              IdVersionAvaluo: versionId,
              SClave: key,
              SNombre: limitDbText(section.title ?? key, 220),
              IOrden: section.sortOrder ?? index,
              BVisible: section.enabled ?? true,
              BObligatoria: section.required ?? false,
              BEliminable: false,
              JConfiguracion: section as Prisma.InputJsonObject,
            },
          });

      for (const [blockIndex, block] of (section.blocks ?? []).entries()) {
        const blockKey = block.id ?? `${key}-block-${blockIndex + 1}`;
        const node = await upsertDocumentNode({
          tx,
          catalogs,
          sectionId: savedSection.IdSeccionDocumento,
          parentId: null,
          key: blockKey,
          title: block.title ?? blockKey,
          order: block.sortOrder ?? blockIndex,
          visible: block.enabled ?? true,
          required: block.required ?? false,
          kind: "block",
          dataTypeKey: "TEXTO_LARGO",
          config: block,
          stats,
        });
        await syncConcepts({
          tx,
          catalogs,
          sectionId: savedSection.IdSeccionDocumento,
          parentId: node.IdNodoDocumento,
          concepts: block.concepts ?? [],
          stats,
        });
        await syncTablesForNode({
          tx,
          catalogs,
          nodeId: node.IdNodoDocumento,
          tables: block.tables ?? [],
          stats,
        });
        await syncImages({
          tx,
          catalogs,
          sectionId: savedSection.IdSeccionDocumento,
          parentId: node.IdNodoDocumento,
          images: block.images ?? [],
          stats,
        });

        for (const [subBlockIndex, subBlock] of (block.subBlocks ?? []).entries()) {
          const subBlockKey = subBlock.id ?? `${blockKey}-subblock-${subBlockIndex + 1}`;
          const subBlockNode = await upsertDocumentNode({
            tx,
            catalogs,
            sectionId: savedSection.IdSeccionDocumento,
            parentId: node.IdNodoDocumento,
            key: subBlockKey,
            title: subBlock.title ?? subBlockKey,
            order: subBlock.sortOrder ?? subBlockIndex,
            visible: subBlock.enabled ?? true,
            required: false,
            kind: "subBlock",
            dataTypeKey: "TEXTO_LARGO",
            config: subBlock,
            stats,
          });
          await syncConcepts({
            tx,
            catalogs,
            sectionId: savedSection.IdSeccionDocumento,
            parentId: subBlockNode.IdNodoDocumento,
            concepts: subBlock.concepts ?? [],
            stats,
          });
          await syncTablesForNode({
            tx,
            catalogs,
            nodeId: subBlockNode.IdNodoDocumento,
            tables: subBlock.tables ?? [],
            stats,
          });
          await syncImages({
            tx,
            catalogs,
            sectionId: savedSection.IdSeccionDocumento,
            parentId: subBlockNode.IdNodoDocumento,
            images: subBlock.images ?? [],
            stats,
          });
          await softDeleteMissingChildren({
            tx,
            parentId: subBlockNode.IdNodoDocumento,
            keepKeys: [
              ...(subBlock.concepts ?? []).map((concept, conceptIndex) =>
                concept.id ?? `${subBlockKey}-concept-${conceptIndex + 1}`,
              ),
              ...(subBlock.images ?? []).map((image, imageIndex) => image.id ?? `${subBlockKey}-image-${imageIndex + 1}`),
            ],
            stats,
          });
        }

        await softDeleteMissingChildren({
          tx,
          parentId: node.IdNodoDocumento,
          keepKeys: [
            ...(block.concepts ?? []).map((concept, conceptIndex) =>
              concept.id ?? `${blockKey}-concept-${conceptIndex + 1}`,
            ),
            ...(block.subBlocks ?? []).map((subBlock, subBlockIndex) =>
              subBlock.id ?? `${blockKey}-subblock-${subBlockIndex + 1}`,
            ),
            ...(block.images ?? []).map((image, imageIndex) => image.id ?? `${blockKey}-image-${imageIndex + 1}`),
          ],
          stats,
        });
      }

      await softDeleteMissingRootNodes({
        tx,
        sectionId: savedSection.IdSeccionDocumento,
        keepKeys: (section.blocks ?? []).map((block, blockIndex) =>
          block.id ?? `${key}-block-${blockIndex + 1}`,
        ),
        stats,
      });
    }

    if (input.caratula) {
      await saveCaratula({ versionId, payload: input.caratula, tx });
    }

    logPersistenceStats(stats);
    return { versionId, sections: input.sections.length, stats };
  });
}

async function findSectionByCanonicalKey(client: Tx, versionId: number, canonical: string, debug = false) {
  const sections = await client.seccionDocumento.findMany({
    where: { IdVersionAvaluo: versionId },
    select: { IdSeccionDocumento: true, SClave: true, IOrden: true },
  });

  const candidates = sections.filter((section) => getCanonicalSectionKey(section.SClave) === canonical);
  if (debug && candidates.length > 1) {
    console.log("[VALUATION_SECTIONS] duplicate persisted section keys for canonical", {
      canonical,
      candidates,
    });
  }

  const selected = [...candidates].sort((a, b) => {
    if (a.IOrden !== b.IOrden) return a.IOrden - b.IOrden;
    return a.IdSeccionDocumento - b.IdSeccionDocumento;
  })[0] ?? null;

  if (debug && selected) {
    console.log("[VALUATION_SECTIONS] selected persisted section", {
      canonical,
      selectedSectionId: selected.IdSeccionDocumento,
      selectedSectionKey: selected.SClave,
    });
  }

  return selected;
}
