import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma-client";
import {
  getCanonicalSectionKey,
  getOrderedValuationSections,
  sectionKeyToWorkspaceId,
} from "@/features/valuations/sections/section-registry";
import { getInitialSectionTemplate } from "@/features/valuations/sections";
import {
  hydrateGeneralCaratulaTemplate,
  type GeneralCaratulaDefaults,
} from "@/features/valuations/services/general-valuation-template";
import { syncConcepts, upsertDocumentNode } from "./document-nodes";
import { syncTablesForNode } from "./document-tables";
import { ValuationWorkflowError } from "./errors";
import { createPersistenceStats, getDocumentPersistenceCatalogs } from "./persistence-context";
import type { BlockPayload, Tx } from "./types";

export async function ensureWorkingVersion(input: {
  avaluoId: number;
  userId: number;
  tx?: Tx;
}) {
  const client = input.tx ?? prisma;
  const avaluo = await client.avaluo.findUnique({
    where: { IdAvaluo: input.avaluoId },
    select: { IdVersionTrabajo: true, INumeroVersionActual: true },
  });
  if (!avaluo) throw new ValuationWorkflowError("Avaluo no encontrado", 404);
  if (avaluo.IdVersionTrabajo) return avaluo.IdVersionTrabajo;

  const editableState = await client.estadoVersionAvaluo.findFirst({
    where: { BActivo: true, BPermiteEdicion: true, BEsFinal: false },
    orderBy: { IOrden: "asc" },
  });
  if (!editableState) throw new ValuationWorkflowError("No existe estado editable de version configurado", 500);

  const version = await client.versionAvaluo.create({
    data: {
      IdAvaluo: input.avaluoId,
      IdUsuarioCreador: input.userId,
      IdEstadoVersionAvaluo: editableState.IdEstadoVersionAvaluo,
      INumeroVersion: avaluo.INumeroVersionActual,
    },
  });

  await client.avaluo.update({
    where: { IdAvaluo: input.avaluoId },
    data: { IdVersionTrabajo: version.IdVersionAvaluo },
  });

  return version.IdVersionAvaluo;
}

export async function initializeWorkingVersionStructure(input: {
  avaluoId: number;
  userId: number;
  tx?: Tx;
  initializeGeneralCaratula?: boolean;
  generalCaratulaDefaults?: GeneralCaratulaDefaults;
}) {
  const client = input.tx ?? prisma;
  const versionId = await ensureWorkingVersion(input);
  const nodeType = await client.tipoNodoDocumento.findFirst({
    where: { BActivo: true },
    orderBy: { IOrden: "asc" },
  });
  if (!nodeType) throw new ValuationWorkflowError("No existe tipo de nodo activo configurado", 500);

  const existingSections = await client.seccionDocumento.findMany({
    where: { IdVersionAvaluo: versionId },
    select: { IdSeccionDocumento: true, SClave: true },
  });
  const existingByCanonical = new Map(
    existingSections.map((section) => [getCanonicalSectionKey(section.SClave), section]),
  );

  for (const [index, definition] of getOrderedValuationSections().entries()) {
    const key = sectionKeyToWorkspaceId(definition.key);
    const existing = existingByCanonical.get(definition.key);
    const section = existing
      ? await client.seccionDocumento.update({
          where: { IdSeccionDocumento: existing.IdSeccionDocumento },
          data: {
            SNombre: definition.label,
            IOrden: index,
            BVisible: true,
            BObligatoria: definition.required,
            BEliminable: false,
            JConfiguracion: definition as Prisma.InputJsonObject,
          },
        })
      : await client.seccionDocumento.create({
          data: {
            IdVersionAvaluo: versionId,
            SClave: key,
            SNombre: definition.label,
            IOrden: index,
            BVisible: true,
            BObligatoria: definition.required,
            BEliminable: false,
            JConfiguracion: definition as Prisma.InputJsonObject,
          },
        });
    existingByCanonical.set(definition.key, section);

    const existingRoots = await client.nodoDocumento.findMany({
      where: {
        IdSeccionDocumento: section.IdSeccionDocumento,
        IdNodoPadre: null,
        DFechaEliminacion: null,
      },
      select: {
        IdNodoDocumento: true,
        STitulo: true,
        valores: { select: { IdValorNodoDocumento: true } },
        tablasDocumentos: { select: { IdTablaDocumento: true } },
        nodosHijos: {
          where: { DFechaEliminacion: null },
          select: { IdNodoDocumento: true },
        },
      },
    });
    const shouldPersistInitialBlocks = definition.key === "CONSTRUCCION"
      || (definition.key === "CARATULA" && input.initializeGeneralCaratula === true);
    const sectionTemplate = shouldPersistInitialBlocks
      ? getInitialSectionTemplate(definition.key)
      : null;
    const initialTemplate = sectionTemplate && definition.key === "CARATULA"
      ? hydrateGeneralCaratulaTemplate(sectionTemplate, input.generalCaratulaDefaults ?? {})
      : sectionTemplate;
    const emptyPlaceholder = initialTemplate
      && isEmptySectionPlaceholder(existingRoots, definition.label);

    if (initialTemplate && (existingRoots.length === 0 || emptyPlaceholder)) {
      if (emptyPlaceholder) {
        await client.nodoDocumento.update({
          where: { IdNodoDocumento: existingRoots[0].IdNodoDocumento },
          data: { DFechaEliminacion: new Date() },
        });
      }
      await persistInitialSectionBlocks({
        tx: client,
        sectionId: section.IdSeccionDocumento,
        blocks: initialTemplate.blocks,
      });
    } else if (existingRoots.length === 0) {
      await client.nodoDocumento.create({
        data: {
          IdSeccionDocumento: section.IdSeccionDocumento,
          IdTipoNodoDocumento: nodeType.IdTipoNodoDocumento,
          SClave: `${key}-root`,
          STitulo: definition.label.toUpperCase(),
          IOrden: 0,
          BVisible: true,
          BObligatorio: definition.required,
          BEliminable: false,
          JConfiguracion: { source: "valuation-section-registry", key: definition.key },
        },
      });
    }
  }

  return versionId;
}

function isEmptySectionPlaceholder(roots: Array<{
  STitulo: string;
  valores: unknown[];
  tablasDocumentos: unknown[];
  nodosHijos: unknown[];
}>, sectionLabel: string) {
  if (roots.length !== 1) return false;
  const root = roots[0];
  const title = root.STitulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  return title === sectionLabel.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase()
    && root.valores.length === 0
    && root.tablasDocumentos.length === 0
    && root.nodosHijos.length === 0;
}

async function persistInitialSectionBlocks(input: {
  tx: Tx;
  sectionId: number;
  blocks: BlockPayload[];
}) {
  const catalogs = await getDocumentPersistenceCatalogs(input.tx);
  const stats = createPersistenceStats([{ blocks: input.blocks }]);

  for (const [blockIndex, block] of input.blocks.entries()) {
    const blockKey = block.id ?? `block-${blockIndex + 1}`;
    const node = await upsertDocumentNode({
      tx: input.tx,
      catalogs,
      sectionId: input.sectionId,
      parentId: null,
      key: blockKey,
      title: block.title ?? blockKey,
      order: blockIndex,
      visible: block.enabled ?? true,
      required: block.required ?? false,
      kind: "block",
      dataTypeKey: "TEXTO_LARGO",
      config: block,
      stats,
    });
    await syncConcepts({
      tx: input.tx,
      catalogs,
      sectionId: input.sectionId,
      parentId: node.IdNodoDocumento,
      concepts: block.concepts ?? [],
      stats,
    });
    await syncTablesForNode({
      tx: input.tx,
      catalogs,
      nodeId: node.IdNodoDocumento,
      tables: block.tables ?? [],
      stats,
    });

    for (const [subBlockIndex, subBlock] of (block.subBlocks ?? []).entries()) {
      const subBlockKey = subBlock.id ?? `${blockKey}-subblock-${subBlockIndex + 1}`;
      const subBlockNode = await upsertDocumentNode({
        tx: input.tx,
        catalogs,
        sectionId: input.sectionId,
        parentId: node.IdNodoDocumento,
        key: subBlockKey,
        title: subBlock.title ?? subBlockKey,
        order: subBlockIndex,
        visible: subBlock.enabled ?? true,
        required: false,
        kind: "subBlock",
        dataTypeKey: "TEXTO_LARGO",
        config: subBlock,
        stats,
      });
      await syncConcepts({
        tx: input.tx,
        catalogs,
        sectionId: input.sectionId,
        parentId: subBlockNode.IdNodoDocumento,
        concepts: subBlock.concepts ?? [],
        stats,
      });
      await syncTablesForNode({
        tx: input.tx,
        catalogs,
        nodeId: subBlockNode.IdNodoDocumento,
        tables: subBlock.tables ?? [],
        stats,
      });
    }
  }
}
