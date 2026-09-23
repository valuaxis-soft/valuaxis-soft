import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma-client";
import type { AuthUser } from "@/features/auth/model";
import type { ConceptType, ConceptValueFormat } from "@/features/valuations/model";
import { extractStorageKey } from "@/features/valuations/services/image-source";
import { ensureTableV2 } from "@/features/valuations/services/table";
import { encodeTableCell } from "@/features/valuations/services/table-persistence";
import { copyVersionContent } from "@/features/valuations/services/valuation-version-copy.service";
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

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export type SectionPayload = {
  id?: string;
  label?: string;
  title?: string;
  enabled?: boolean;
  required?: boolean;
  sortOrder?: number;
  startOnNewPage?: boolean;
  blocks?: BlockPayload[];
};

export type BlockPayload = {
  id?: string;
  label?: string;
  title?: string;
  enabled?: boolean;
  required?: boolean;
  sortOrder?: number;
  startOnNewPage?: boolean;
  concepts?: ConceptPayload[];
  subBlocks?: ApartadoPayload[];
  tables?: TablePayload[];
  images?: ImagePayload[];
};

export type ConceptPayload = {
  id?: string;
  label?: string;
  value?: unknown;
  enabled?: boolean;
  type?: ConceptType;
  labelKey?: string;
  valueKey?: string;
  layoutSpan?: "full" | "half";
  rowId?: string;
  spacingBefore?: number;
  spacingAfter?: number;
  valueFormat?: ConceptValueFormat;
  customUnit?: string;
};

export type ApartadoPayload = {
  id?: string;
  title?: string;
  enabled?: boolean;
  sortOrder?: number;
  startOnNewPage?: boolean;
  concepts?: ConceptPayload[];
  tables?: TablePayload[];
  images?: ImagePayload[];
};

/** A table as sent by the editor: TableV2 (current) or the legacy string grid. */
export type TablePayload = {
  id?: string;
  title?: string;
  version?: number;
  columns?: unknown[];
  columnKeys?: string[];
  rows?: unknown[];
  boundaryDistanceFormats?: Array<{ valueFormat?: ConceptValueFormat; customUnit?: string }>;
  enabled?: boolean;
  schema?: unknown;
};

export type ImagePayload = {
  id?: string;
  title?: string;
  src?: string;
  enabled?: boolean;
  layoutWidth?: "normal" | "wide" | "full";
  layoutWidthPercent?: number;
};

export type CaratulaPayload = {
  numeroAvaluo?: string | null;
  folio?: string | null;
  solicitante?: string | null;
  propietario?: string | null;
  objeto?: string | null;
  proposito?: string | null;
  valuador?: string | null;
  registroValuador?: string | null;
  valorTotal?: string | number | null;
  valorConLetra?: string | null;
  fechaAvaluo?: string | null;
  fechaVigencia?: string | null;
};

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
  if (!avaluo) throw new Error("Avaluo no encontrado");
  if (avaluo.IdVersionTrabajo) return avaluo.IdVersionTrabajo;

  const editableState = await client.estadoVersionAvaluo.findFirst({
    where: { BActivo: true, BPermiteEdicion: true, BEsFinal: false },
    orderBy: { IOrden: "asc" },
  });
  if (!editableState) throw new Error("No existe estado editable de version configurado");

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
  if (!nodeType) throw new Error("No existe tipo de nodo activo configurado");

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

export async function saveCaratula(input: {
  versionId: number;
  payload: CaratulaPayload;
  tx?: Tx;
}) {
  const client = input.tx ?? prisma;
  const data = {
    SNumeroAvaluo: cleanText(input.payload.numeroAvaluo),
    SFolio: cleanText(input.payload.folio),
    SNombreSolicitante: cleanText(input.payload.solicitante),
    SNombrePropietario: cleanText(input.payload.propietario),
    SObjetoAvaluo: cleanText(input.payload.objeto),
    SPropositoAvaluo: cleanText(input.payload.proposito),
    SNombreValuador: cleanText(input.payload.valuador),
    SRegistroValuador: cleanText(input.payload.registroValuador),
    NValorTotal: toDecimal(input.payload.valorTotal),
    SValorConLetra: cleanText(input.payload.valorConLetra),
    DFechaAvaluo: toDate(input.payload.fechaAvaluo),
    DFechaVigencia: toDate(input.payload.fechaVigencia),
  };

  await client.caratulaAvaluo.upsert({
    where: { IdVersionAvaluo: input.versionId },
    update: data,
    create: {
      IdVersionAvaluo: input.versionId,
      ...data,
    },
  });
}

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
      throw new Error("Avaluo no encontrado");
    }
    if (avaluo.BBloqueado) {
      console.error("[VALUATION_SECTIONS] Avaluo bloqueado", { publicId: input.publicId });
      throw new Error("El avaluo esta bloqueado");
    }

    const versionId =
      avaluo.IdVersionTrabajo ??
      (await initializeWorkingVersionStructure({ avaluoId: avaluo.IdAvaluo, userId: input.user.id, tx }));
    if (debug) console.log("[VALUATION_SECTIONS] versionId resolved", { versionId, idVersionTrabajo: avaluo.IdVersionTrabajo });
    await initializeWorkingVersionStructure({ avaluoId: avaluo.IdAvaluo, userId: input.user.id, tx });
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

        /*
        const data = {
          SClave: blockKey,
          STitulo: block.title ?? blockKey,
          IOrden: block.sortOrder ?? blockIndex,
          BVisible: true,
          BObligatorio: block.required ?? false,
          BEliminable: false,
          JConfiguracion: block as Prisma.InputJsonObject,
        };

        if (existing) {
          await tx.nodoDocumento.update({
            where: { IdNodoDocumento: existing.IdNodoDocumento },
            data,
          });
        } else {
          await tx.nodoDocumento.create({
            data: {
              ...data,
              IdSeccionDocumento: savedSection.IdSeccionDocumento,
              IdTipoNodoDocumento: nodeType.IdTipoNodoDocumento,
            },
          });
        }
        */
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

function cleanText(value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length ? text : null;
}

function toDecimal(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/[,$\s]/g, ""));
  return Number.isFinite(numeric) ? new Prisma.Decimal(numeric) : null;
}

function logPersistenceOperation(operation: string, details: Record<string, unknown>) {
  if (process.env.VALUATION_SAVE_DEBUG === "1") {
    console.debug("[VALUATION_PERSISTENCE]", operation, details);
  }
}

function toDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type DocumentPersistenceCatalogs = {
  nodeTypes: Record<string, number>;
  dataTypes: Record<string, number>;
  originId: number;
  columnTypeId: number;
};

type PersistenceStats = {
  sectionsReceived: number;
  nodesReceived: number;
  tablesReceived: number;
  nodesCreated: number;
  nodesUpdated: number;
  nodesSoftDeleted: number;
  valuesUpserted: number;
  tablesUpserted: number;
  columnsUpserted: number;
  rowsUpserted: number;
  cellsUpserted: number;
};

async function getDocumentPersistenceCatalogs(tx: Tx): Promise<DocumentPersistenceCatalogs> {
  const [nodeTypes, dataTypes, origin, columnType] = await Promise.all([
    tx.tipoNodoDocumento.findMany({ where: { BActivo: true }, select: { IdTipoNodoDocumento: true, SClave: true } }),
    tx.tipoDato.findMany({ where: { BActivo: true }, select: { IdTipoDato: true, SClave: true } }),
    tx.origenDato.findFirst({
      where: { BActivo: true, SClave: { equals: "USUARIO", mode: "insensitive" } },
      orderBy: { IOrden: "asc" },
      select: { IdOrigenDato: true },
    }),
    tx.tipoColumna.findFirst({
      where: { BActivo: true, SClave: { equals: "CAPTURA", mode: "insensitive" } },
      orderBy: { IOrden: "asc" },
      select: { IdTipoColumna: true },
    }),
  ]);
  if (!origin) throw new Error("No existe origen de dato USUARIO activo");
  if (!columnType) throw new Error("No existe tipo de columna CAPTURA activo");

  return {
    nodeTypes: Object.fromEntries(nodeTypes.map((item) => [item.SClave, item.IdTipoNodoDocumento])),
    dataTypes: Object.fromEntries(dataTypes.map((item) => [item.SClave, item.IdTipoDato])),
    originId: origin.IdOrigenDato,
    columnTypeId: columnType.IdTipoColumna,
  };
}

async function upsertDocumentNode(input: {
  tx: Tx;
  catalogs: DocumentPersistenceCatalogs;
  sectionId: number;
  parentId: number | null;
  key: string;
  title: string;
  order: number;
  visible?: boolean;
  required: boolean;
  kind: "block" | "subBlock" | "concept" | "image";
  dataTypeKey: string;
  config: unknown;
  stats: PersistenceStats;
}) {
  const safeTitle = normalizeNodeTitle(input.title) || "Campo sin título";
  const sourceKey = input.key.trim();
  const safeKey = normalizeDbKey(sourceKey, `${input.kind}_${input.order}`, DOCUMENT_NODE_KEY_MAX_LENGTH);
  const safeNodeTitle = limitDbText(safeTitle, DOCUMENT_NODE_TITLE_MAX_LENGTH);
  const sourceDescription = nodeDescription(input.config);
  const safeDescription = limitDbText(sourceDescription, DOCUMENT_DESCRIPTION_MAX_LENGTH);
  const nodeTypeKey =
    input.kind === "block"
      ? "BLOQUE"
      : input.kind === "subBlock"
        ? "SUBBLOQUE"
        : input.kind === "image"
          ? "IMAGEN"
          : "CONCEPTO";
  const existing = await input.tx.nodoDocumento.findFirst({
    where: {
      IdSeccionDocumento: input.sectionId,
      OR: [
        { SClave: safeKey },
        ...(sourceKey && sourceKey !== safeKey && sourceKey.length <= DOCUMENT_NODE_KEY_MAX_LENGTH
          ? [{ SClave: sourceKey }]
          : []),
      ],
      DFechaEliminacion: null,
    },
    select: { IdNodoDocumento: true },
  });
  const nodeConfig: Record<string, unknown> = { kind: input.kind, payload: input.config };
  if (safeKey !== sourceKey) nodeConfig.sourceKey = sourceKey;
  if (safeNodeTitle !== safeTitle) nodeConfig.fullTitle = safeTitle;
  if (safeDescription !== sourceDescription) nodeConfig.fullDescription = sourceDescription;
  const data = {
    IdNodoPadre: input.parentId,
    IdTipoNodoDocumento: input.catalogs.nodeTypes[nodeTypeKey] ?? Object.values(input.catalogs.nodeTypes)[0],
    IdTipoDato: input.catalogs.dataTypes[input.dataTypeKey] ?? input.catalogs.dataTypes.TEXTO,
    SClave: safeKey,
    STitulo: safeNodeTitle,
    SDescripcion: safeDescription,
    IOrden: input.order,
    BVisible: input.visible ?? true,
    BObligatorio: input.required,
    BEliminable: false,
    DFechaEliminacion: null,
    JConfiguracion: nodeConfig as Prisma.InputJsonObject,
  };

  logPersistenceOperation(existing ? "update-document-node" : "create-document-node", {
    type: "NodoDocumento",
    operation: existing ? "update" : "create",
    elementType: input.kind,
    sectionId: input.sectionId,
    parentId: input.parentId,
    key: safeKey,
    sourceKey,
    title: safeNodeTitle,
    dataType: input.dataTypeKey,
    existingNodeId: existing?.IdNodoDocumento ?? null,
    clientId: clientIdFromConfig(input.config),
  });

  if (existing) {
    input.stats.nodesUpdated += 1;
    return input.tx.nodoDocumento.update({
      where: { IdNodoDocumento: existing.IdNodoDocumento },
      data,
    });
  }

  input.stats.nodesCreated += 1;
  return input.tx.nodoDocumento.create({
    data: {
      ...data,
      IdSeccionDocumento: input.sectionId,
    },
  });
}

function normalizeNodeTitle(value: string) {
  return value.trim();
}

async function syncConcepts(input: {
  tx: Tx;
  catalogs: DocumentPersistenceCatalogs;
  sectionId: number;
  parentId: number;
  concepts: ConceptPayload[];
  stats: PersistenceStats;
}) {
  for (const [index, concept] of input.concepts.entries()) {
    const key = concept.id ?? `concept-${index + 1}`;
    const kind = valueKind(concept.value);
    const node = await upsertDocumentNode({
      tx: input.tx,
      catalogs: input.catalogs,
      sectionId: input.sectionId,
      parentId: input.parentId,
      key,
      title: concept.label ?? key,
      order: index,
      required: false,
      kind: "concept",
      dataTypeKey: kind.dataTypeKey,
      config: concept,
      stats: input.stats,
    });
    if (hasCapturableValue(concept.value)) {
      await upsertNodeValue({
        tx: input.tx,
        catalogs: input.catalogs,
        nodeId: node.IdNodoDocumento,
        nodeKey: key,
        clientId: concept.id ?? null,
        value: concept.value,
        dataTypeKey: kind.dataTypeKey,
        stats: input.stats,
      });
    }
  }
}

async function syncImages(input: {
  tx: Tx;
  catalogs: DocumentPersistenceCatalogs;
  sectionId: number;
  parentId: number;
  images: ImagePayload[];
  stats: PersistenceStats;
}) {
  for (const [index, image] of input.images.entries()) {
    const key = image.id ?? `image-${index + 1}`;
    const node = await upsertDocumentNode({
      tx: input.tx,
      catalogs: input.catalogs,
      sectionId: input.sectionId,
      parentId: input.parentId,
      key,
      title: image.title ?? key,
      order: index,
      required: false,
      kind: "image",
      dataTypeKey: "IMAGEN",
      config: image,
      stats: input.stats,
    });
    await upsertNodeValue({
      tx: input.tx,
      catalogs: input.catalogs,
      nodeId: node.IdNodoDocumento,
      nodeKey: key,
      clientId: image.id ?? null,
      value: extractStorageKey(image.src ?? ""),
      dataTypeKey: "IMAGEN",
      stats: input.stats,
    });
  }
}

async function upsertNodeValue(input: {
  tx: Tx;
  catalogs: DocumentPersistenceCatalogs;
  nodeId: number;
  nodeKey: string;
  clientId: string | null;
  value: unknown;
  dataTypeKey: string;
  stats: PersistenceStats;
}) {
  const node = await input.tx.nodoDocumento.findUnique({
    where: { IdNodoDocumento: input.nodeId },
    select: { IdNodoDocumento: true, SClave: true, seccionDocumento: { select: { IdVersionAvaluo: true } } },
  });
  const versionId = node?.seccionDocumento.IdVersionAvaluo;
  if (!versionId) throw new Error("No se pudo resolver la version del nodo");
  const data = valueColumns(input.value);
  logPersistenceOperation("upsert-node-value", {
    nodeId: node.IdNodoDocumento,
    nodeKey: node.SClave,
    payloadKey: input.nodeKey,
    clientId: input.clientId,
    versionId,
    dataType: input.dataTypeKey,
    occupiedColumns: occupiedValueColumns(data),
  });
  await input.tx.valorNodoDocumento.upsert({
    where: {
      IdNodoDocumento_IdVersionAvaluo: {
        IdNodoDocumento: input.nodeId,
        IdVersionAvaluo: versionId,
      },
    },
    update: {
      IdTipoDato: input.catalogs.dataTypes[input.dataTypeKey] ?? input.catalogs.dataTypes.TEXTO,
      IdOrigenDato: input.catalogs.originId,
      ...emptyValueColumns(),
      ...data,
    },
    create: {
      IdNodoDocumento: input.nodeId,
      IdVersionAvaluo: versionId,
      IdTipoDato: input.catalogs.dataTypes[input.dataTypeKey] ?? input.catalogs.dataTypes.TEXTO,
      IdOrigenDato: input.catalogs.originId,
      ...emptyValueColumns(),
      ...data,
    },
  });
  input.stats.valuesUpserted += 1;
}

const DOCUMENT_ROW_KEY_MAX_LENGTH = 120;
const DOCUMENT_COLUMN_KEY_MAX_LENGTH = 120;
const DOCUMENT_COLUMN_NAME_MAX_LENGTH = 180;
const DOCUMENT_TABLE_NAME_MAX_LENGTH = 180;
const DOCUMENT_DESCRIPTION_MAX_LENGTH = 1000;
const DOCUMENT_NODE_KEY_MAX_LENGTH = 140;
const DOCUMENT_NODE_TITLE_MAX_LENGTH = 250;

export function normalizeDbKey(value: string | null | undefined, fallback: string, maxLength: number) {
  const fallbackSlug = slugDbKey(fallback) || "item";
  const slug = slugDbKey(value ?? "") || fallbackSlug;

  if (slug.length <= maxLength) return slug;

  const hash = createHash("sha256").update(value ?? fallback).digest("hex").slice(0, 12);
  if (maxLength <= hash.length + 1) return hash.slice(0, maxLength);

  return `${slug.slice(0, maxLength - hash.length - 1).replace(/[_-]+$/g, "")}_${hash}`;
}

export function limitDbText<T extends string | null | undefined>(value: T, maxLength: number): T {
  if (typeof value !== "string") return value;
  return Array.from(value).slice(0, maxLength).join("") as T;
}

function slugDbKey(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .toLowerCase();
}

export function normalizeDocumentTableColumnForPersistence(input: {
  generatedKey: string;
  label: string;
  index: number;
}) {
  const sourceKey = input.generatedKey.trim();
  const fallbackKey = `columna_${input.index}_${slugDbKey(input.label) || "valor"}`;
  const SClave = normalizeDbKey(sourceKey, fallbackKey, DOCUMENT_COLUMN_KEY_MAX_LENGTH);
  const SNombre = limitDbText(input.label.trim() || "Nueva columna", DOCUMENT_COLUMN_NAME_MAX_LENGTH);
  const JConfiguracion: Record<string, string> = {};

  if (SClave !== sourceKey) JConfiguracion.sourceKey = sourceKey;
  if (SNombre !== input.label) JConfiguracion.fullLabel = input.label;

  return { SClave, SNombre, JConfiguracion };
}

export function normalizeDocumentTableRowForPersistence(input: {
  tableId?: string;
  tableIndex: number;
  index: number;
}) {
  const legacyKey = `${input.tableId ?? `table-${input.tableIndex}`}-row-${input.index + 1}`;
  const SClave = normalizeDbKey(`fila_${input.index}`, `fila_${input.index}`, DOCUMENT_ROW_KEY_MAX_LENGTH);
  const JMetadatos: Record<string, string | number> = {
    clientIndex: input.index,
  };

  if (input.tableId) JMetadatos.sourceKey = input.tableId;
  if (legacyKey !== SClave) JMetadatos.legacyKey = legacyKey;

  return { SClave, legacyKey, JMetadatos };
}

async function syncTablesForNode(input: {
  tx: Tx;
  catalogs: DocumentPersistenceCatalogs;
  nodeId: number;
  tables: TablePayload[];
  stats: PersistenceStats;
}) {
  for (const [tableIndex, table] of input.tables.entries()) {
    const tableTitle = table.title ?? `Tabla ${tableIndex + 1}`;
    const tableName = limitDbText(tableTitle, DOCUMENT_TABLE_NAME_MAX_LENGTH);
    const tableConfig: Record<string, unknown> = {
      clientId: table.id ?? null,
      enabled: table.enabled ?? true,
      version: 2,
    };
    if (table.boundaryDistanceFormats?.length) {
      tableConfig.boundaryDistanceFormats = table.boundaryDistanceFormats.map((format) => ({
        ...(format.valueFormat ? { valueFormat: format.valueFormat } : {}),
        ...(format.customUnit?.trim() ? { customUnit: format.customUnit.trim() } : {}),
      }));
    }
    if (tableName !== tableTitle) tableConfig.fullTitle = tableTitle;
    if (table.schema) tableConfig.schema = table.schema;
    const savedTable = await input.tx.tablaDocumento.upsert({
      where: {
        IdNodoDocumento_IOrden: {
          IdNodoDocumento: input.nodeId,
          IOrden: tableIndex,
        },
      },
      update: {
        SNombre: tableName,
        BPermiteColumnas: true,
        JConfiguracion: tableConfig as Prisma.InputJsonObject,
      },
      create: {
        IdNodoDocumento: input.nodeId,
        SNombre: tableName,
        IOrden: tableIndex,
        BPermiteColumnas: true,
        JConfiguracion: tableConfig as Prisma.InputJsonObject,
      },
    });
    input.stats.tablesUpserted += 1;

    // Normalize to V2 — handles legacy, V2, and mixed tables uniformly
    const tableV2 = ensureTableV2(table);
    if (tableV2.schema) tableConfig.schema = tableV2.schema;

    const savedColumns = [];
    for (const [columnIndex, col] of tableV2.columns.entries()) {
      const generatedKey = col.id;
      const normalizedColumn = normalizeDocumentTableColumnForPersistence({
        generatedKey,
        label: col.name,
        index: columnIndex,
      });
      const columnKey = normalizedColumn.SClave;
      const existing = await input.tx.columnaTablaDocumento.findFirst({
        where: { IdTablaDocumento: savedTable.IdTablaDocumento, SClave: columnKey, DFechaEliminacion: null },
        select: { IdColumnaTablaDocumento: true },
      });
      const columnData = {
        IdTipoDato: input.catalogs.dataTypes.TEXTO,
        IdTipoColumna: input.catalogs.columnTypeId,
        SClave: normalizedColumn.SClave,
        SNombre: normalizedColumn.SNombre,
        IOrden: columnIndex,
        BVisible: true,
        JConfiguracion: {
          clientIndex: columnIndex,
          clientId: col.id,
          ...(col.format ? { format: col.format } : {}),
          ...normalizedColumn.JConfiguracion,
        } as Prisma.InputJsonObject,
        DFechaEliminacion: null,
      };
      const savedColumn = existing
        ? await input.tx.columnaTablaDocumento.update({
            where: { IdColumnaTablaDocumento: existing.IdColumnaTablaDocumento },
            data: columnData,
          })
        : await input.tx.columnaTablaDocumento.create({
            data: {
              ...columnData,
              IdTablaDocumento: savedTable.IdTablaDocumento,
            },
          });
      input.stats.columnsUpserted += 1;
      savedColumns.push(savedColumn);
    }

    const savedRowIds: bigint[] = [];
    for (const [rowIndex, row] of tableV2.rows.entries()) {
      const normalizedRow = normalizeDocumentTableRowForPersistence({
        tableId: tableV2.id,
        tableIndex,
        index: rowIndex,
      });
      const rowKey = normalizedRow.SClave;
      const legacyRowKey = normalizedRow.legacyKey;
      const rowMetadata = { ...normalizedRow.JMetadatos, clientId: row.id } as Prisma.InputJsonObject;
      const existingRow = await input.tx.filaTablaDocumento.findFirst({
        where: {
          IdTablaDocumento: savedTable.IdTablaDocumento,
          OR: [
            { SClave: rowKey },
            ...(legacyRowKey !== rowKey && legacyRowKey.length <= DOCUMENT_ROW_KEY_MAX_LENGTH
              ? [{ SClave: legacyRowKey }]
              : []),
          ],
        },
        select: { IdFilaTablaDocumento: true },
      });
      const savedRow = existingRow
        ? await input.tx.filaTablaDocumento.update({
            where: { IdFilaTablaDocumento: existingRow.IdFilaTablaDocumento },
            data: {
              SClave: rowKey,
              IOrden: rowIndex,
              BActivo: true,
              JMetadatos: rowMetadata,
            },
          })
        : await input.tx.filaTablaDocumento.create({
            data: {
              IdTablaDocumento: savedTable.IdTablaDocumento,
              SClave: rowKey,
              IOrden: rowIndex,
              BActivo: true,
              JMetadatos: rowMetadata,
            },
          });
      input.stats.rowsUpserted += 1;
      savedRowIds.push(savedRow.IdFilaTablaDocumento);

      for (const [colIndex, savedColumn] of savedColumns.entries()) {
        const col = tableV2.columns[colIndex];
        if (!col) continue;
        const stored = encodeTableCell(row.cells[col.id]);
        const cellData = {
          IdOrigenDato: input.catalogs.originId,
          ...emptyValueColumns(),
          SValorTexto: stored.text,
          BEsCalculado: stored.calculated,
          ...(stored.complex ? { JValorComplejo: stored.complex as unknown as Prisma.InputJsonObject } : {}),
        };
        await input.tx.celdaTablaDocumento.upsert({
          where: {
            IdFilaTablaDocumento_IdColumnaTablaDocumento: {
              IdFilaTablaDocumento: savedRow.IdFilaTablaDocumento,
              IdColumnaTablaDocumento: savedColumn.IdColumnaTablaDocumento,
            },
          },
          update: cellData,
          create: {
            IdFilaTablaDocumento: savedRow.IdFilaTablaDocumento,
            IdColumnaTablaDocumento: savedColumn.IdColumnaTablaDocumento,
            ...cellData,
          },
        });
        input.stats.cellsUpserted += 1;
      }
    }

    // Columns and rows the editor removed must not come back on reload.
    await input.tx.columnaTablaDocumento.updateMany({
      where: {
        IdTablaDocumento: savedTable.IdTablaDocumento,
        DFechaEliminacion: null,
        IdColumnaTablaDocumento: { notIn: savedColumns.map((column) => column.IdColumnaTablaDocumento) },
      },
      data: { DFechaEliminacion: new Date() },
    });
    await input.tx.filaTablaDocumento.updateMany({
      where: {
        IdTablaDocumento: savedTable.IdTablaDocumento,
        BActivo: true,
        IdFilaTablaDocumento: { notIn: savedRowIds },
      },
      data: { BActivo: false },
    });
  }

  // Tables the editor removed from this node are marked so the loader skips them.
  await input.tx.tablaDocumento.updateMany({
    where: { IdNodoDocumento: input.nodeId, IOrden: { gte: input.tables.length } },
    data: { JConfiguracion: { removed: true } as Prisma.InputJsonObject },
  });
}

async function softDeleteMissingChildren(input: {
  tx: Tx;
  parentId: number;
  keepKeys: string[];
  stats: PersistenceStats;
}) {
  const keepKeys = input.keepKeys.map((key, index) =>
    normalizeDbKey(key, `child_${index}`, DOCUMENT_NODE_KEY_MAX_LENGTH),
  );
  const result = await input.tx.nodoDocumento.updateMany({
    where: {
      IdNodoPadre: input.parentId,
      DFechaEliminacion: null,
      SClave: { notIn: keepKeys },
    },
    data: { DFechaEliminacion: new Date(), BVisible: false },
  });
  input.stats.nodesSoftDeleted += result.count;
}

async function softDeleteMissingRootNodes(input: {
  tx: Tx;
  sectionId: number;
  keepKeys: string[];
  stats: PersistenceStats;
}) {
  const keepKeys = input.keepKeys.map((key, index) =>
    normalizeDbKey(key, `block_${index}`, DOCUMENT_NODE_KEY_MAX_LENGTH),
  );
  const result = await input.tx.nodoDocumento.updateMany({
    where: {
      IdSeccionDocumento: input.sectionId,
      IdNodoPadre: null,
      DFechaEliminacion: null,
      SClave: { notIn: keepKeys },
    },
    data: { DFechaEliminacion: new Date(), BVisible: false },
  });
  input.stats.nodesSoftDeleted += result.count;
}

/**
 * Maps a captured value to its storage column. Text is stored exactly as typed:
 * converting "7,000.00" to a number or "2026-01-01" to a timestamp loses the
 * format the appraiser wrote, and that text is what the report prints.
 */
export function valueColumns(value: unknown) {
  const empty = emptyValueColumns();
  if (typeof value === "string") {
    return value.trim() ? { ...empty, SValorTexto: value } : empty;
  }

  if (typeof value === "number") {
    return {
      ...empty,
      NValorNumerico: new Prisma.Decimal(value),
    };
  }

  if (typeof value === "boolean") {
    return {
      ...empty,
      BValorBooleano: value,
    };
  }

  if (isComplexValue(value)) {
    return {
      ...empty,
      JValorComplejo: toPrismaJsonValue(value),
    };
  }

  return empty;
}

export function emptyValueColumns() {
  return {
    SValorTexto: null,
    NValorNumerico: null,
    BValorBooleano: null,
    DValorFecha: null,
    JValorComplejo: Prisma.DbNull,
  };
}

function valueKind(value: unknown) {
  if (typeof value === "number" || parseNumeric(value)) return { dataTypeKey: "DECIMAL" };
  if (typeof value === "boolean") return { dataTypeKey: "BOOLEANO" };
  if (isDateString(value)) return { dataTypeKey: "FECHA" };
  if (isComplexValue(value)) return { dataTypeKey: "JSON" };
  return { dataTypeKey: "TEXTO_LARGO" };
}

function parseNumeric(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.replace(/[,$\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return new Prisma.Decimal(normalized);
}

function isDateString(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(new Date(value).getTime());
}

function isComplexValue(value: unknown) {
  return value !== null && typeof value === "object";
}

function toPrismaJsonValue(value: unknown) {
  if (value === null || value === Prisma.JsonNull || value === Prisma.DbNull) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export function hasCapturableValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function nodeDescription(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const value = (config as { description?: unknown }).description;
  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

function clientIdFromConfig(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const value = (config as { id?: unknown }).id;
  return typeof value === "string" ? value : null;
}

function occupiedValueColumns(data: ReturnType<typeof valueColumns>) {
  return [
    data.SValorTexto !== null ? "SValorTexto" : null,
    data.NValorNumerico !== null ? "NValorNumerico" : null,
    data.BValorBooleano !== null ? "BValorBooleano" : null,
    data.DValorFecha !== null ? "DValorFecha" : null,
    data.JValorComplejo !== Prisma.JsonNull && data.JValorComplejo !== Prisma.DbNull && data.JValorComplejo !== null
      ? "JValorComplejo"
      : null,
  ].filter(Boolean);
}

function createPersistenceStats(sections: SectionPayload[]): PersistenceStats {
  const nodesReceived = sections.reduce(
    (total, section) =>
      total +
      (section.blocks ?? []).reduce(
        (blockTotal, block) =>
          blockTotal +
          1 +
          (block.concepts?.length ?? 0) +
          (block.images?.length ?? 0) +
          (block.subBlocks ?? []).reduce(
            (subTotal, subBlock) =>
              subTotal +
              1 +
              (subBlock.concepts?.length ?? 0) +
              (subBlock.images?.length ?? 0),
            0,
          ),
        0,
      ),
    0,
  );
  const tablesReceived = sections.reduce(
    (total, section) =>
      total +
      (section.blocks ?? []).reduce(
        (blockTotal, block) =>
          blockTotal +
          (block.tables?.length ?? 0) +
          (block.subBlocks ?? []).reduce((subTotal, subBlock) => subTotal + (subBlock.tables?.length ?? 0), 0),
        0,
      ),
    0,
  );
  return {
    sectionsReceived: sections.length,
    nodesReceived,
    tablesReceived,
    nodesCreated: 0,
    nodesUpdated: 0,
    nodesSoftDeleted: 0,
    valuesUpserted: 0,
    tablesUpserted: 0,
    columnsUpserted: 0,
    rowsUpserted: 0,
    cellsUpserted: 0,
  };
}

function logPersistenceStats(stats: PersistenceStats) {
  if (process.env.VALUATION_PERSISTENCE_DEBUG === "1") {
    console.info("[valuation-persistence]", stats);
  }
}

export async function concludeValuation(input: {
  publicId: string;
  organizationId: number;
  user: AuthUser;
}) {
  return prisma.$transaction(async (tx) => {
    const avaluo = await tx.avaluo.findFirst({
      where: {
        UIdentificadorPublico: input.publicId,
        IdOrganizacion: input.organizationId,
        BActivo: true,
        DFechaEliminacion: null,
      },
      include: {
        versionTrabajo: { include: { seccionesDocumentos: true } },
      },
    });
    if (!avaluo) throw new Error("Avaluo no encontrado");
    if (!avaluo.IdVersionTrabajo || !avaluo.versionTrabajo) throw new Error("No existe version de trabajo");
    if (avaluo.BBloqueado) return { id: input.publicId, alreadyConcluded: true };

    const finalVersionState = await tx.estadoVersionAvaluo.findFirst({
      where: { BActivo: true, BEsFinal: true },
      orderBy: { IOrden: "asc" },
    });
    const finalValuationState = await tx.estadoAvaluo.findFirst({
      where: { BActivo: true, BEsFinal: true },
      orderBy: { IOrden: "asc" },
    });
    if (!finalVersionState || !finalValuationState) {
      throw new Error("Faltan estados finales configurados");
    }

    const requiredSections = avaluo.versionTrabajo.seccionesDocumentos.filter(
      (section) => section.BObligatoria && section.BVisible,
    );
    if (!requiredSections.length) {
      throw new Error("No hay secciones obligatorias configuradas para concluir");
    }

    const contentHash = createHash("sha256")
      .update(JSON.stringify(avaluo.versionTrabajo.seccionesDocumentos))
      .digest("hex");

    await tx.versionAvaluo.update({
      where: { IdVersionAvaluo: avaluo.IdVersionTrabajo },
      data: {
        IdEstadoVersionAvaluo: finalVersionState.IdEstadoVersionAvaluo,
        IdUsuarioFinalizador: input.user.id,
        DFechaFinalizacion: new Date(),
        SHashContenido: contentHash,
      },
    });

    await tx.avaluo.update({
      where: { IdAvaluo: avaluo.IdAvaluo },
      data: {
        IdEstadoAvaluo: finalValuationState.IdEstadoAvaluo,
        IdVersionFinal: avaluo.IdVersionTrabajo,
        IdVersionTrabajo: null,
        BBloqueado: true,
        DFechaConclusion: new Date(),
        DFechaBloqueo: new Date(),
      },
    });

    await tx.estadoAvaluoHistorial.create({
      data: {
        IdAvaluo: avaluo.IdAvaluo,
        IdVersionAvaluo: avaluo.IdVersionTrabajo,
        IdUsuario: input.user.id,
        IdEstadoAnterior: avaluo.IdEstadoAvaluo,
        IdEstadoNuevo: finalValuationState.IdEstadoAvaluo,
        SMotivo: "Conclusion de avaluo",
      },
    });

    return { id: input.publicId, hash: contentHash, status: finalValuationState.SClave };
  });
}

/** Reopening copies the whole document; a large valuation can exceed Prisma's 5 s default. */
const REOPEN_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

export async function reopenValuation(input: {
  publicId: string;
  organizationId: number;
  user: AuthUser;
  reason: string;
  acceptedText: string;
}) {
  if (!input.reason.trim()) throw new Error("El motivo es obligatorio");
  if (!input.acceptedText.trim()) throw new Error("La aceptacion de terminos es obligatoria");

  return prisma.$transaction(async (tx) => {
    const avaluo = await tx.avaluo.findFirst({
      where: {
        UIdentificadorPublico: input.publicId,
        IdOrganizacion: input.organizationId,
        BActivo: true,
        DFechaEliminacion: null,
      },
      select: {
        IdAvaluo: true,
        IdEstadoAvaluo: true,
        IdVersionFinal: true,
        IdVersionTrabajo: true,
        INumeroVersionActual: true,
      },
    });
    if (!avaluo) throw new Error("Avaluo no encontrado");
    if (!avaluo.IdVersionFinal) throw new Error("No existe version final para reabrir");
    if (avaluo.IdVersionTrabajo) return { id: input.publicId, alreadyOpen: true };

    const editableVersionState = await tx.estadoVersionAvaluo.findFirst({
      where: { BActivo: true, BPermiteEdicion: true, BEsFinal: false },
      orderBy: { IOrden: "asc" },
    });
    const editableValuationState = await tx.estadoAvaluo.findFirst({
      where: { BActivo: true, BPermiteEdicion: true, BEsFinal: false },
      orderBy: { IOrden: "asc" },
    });
    if (!editableVersionState || !editableValuationState) {
      throw new Error("Faltan estados editables configurados");
    }

    const nextVersionNumber = avaluo.INumeroVersionActual + 1;
    const newVersion = await tx.versionAvaluo.create({
      data: {
        IdAvaluo: avaluo.IdAvaluo,
        IdVersionOrigen: avaluo.IdVersionFinal,
        IdUsuarioCreador: input.user.id,
        IdEstadoVersionAvaluo: editableVersionState.IdEstadoVersionAvaluo,
        INumeroVersion: nextVersionNumber,
        SMotivoReapertura: input.reason,
        STextoAceptacion: input.acceptedText,
        BTerminosAceptados: true,
        DFechaReapertura: new Date(),
        DFechaAceptacionTerminos: new Date(),
      },
    });

    const copied = await copyVersionContent(tx, {
      fromVersionId: avaluo.IdVersionFinal,
      toVersionId: newVersion.IdVersionAvaluo,
    });

    await tx.reaperturaAvaluo.create({
      data: {
        IdAvaluo: avaluo.IdAvaluo,
        IdVersionAnterior: avaluo.IdVersionFinal,
        IdVersionNueva: newVersion.IdVersionAvaluo,
        IdUsuario: input.user.id,
        SMotivo: input.reason,
        STextoAceptado: input.acceptedText,
        BTerminosAceptados: true,
      },
    });

    await tx.avaluo.update({
      where: { IdAvaluo: avaluo.IdAvaluo },
      data: {
        IdEstadoAvaluo: editableValuationState.IdEstadoAvaluo,
        IdVersionTrabajo: newVersion.IdVersionAvaluo,
        INumeroVersionActual: nextVersionNumber,
        BBloqueado: false,
        DFechaBloqueo: null,
      },
    });

    await tx.estadoAvaluoHistorial.create({
      data: {
        IdAvaluo: avaluo.IdAvaluo,
        IdVersionAvaluo: newVersion.IdVersionAvaluo,
        IdUsuario: input.user.id,
        IdEstadoAnterior: avaluo.IdEstadoAvaluo,
        IdEstadoNuevo: editableValuationState.IdEstadoAvaluo,
        SMotivo: input.reason,
      },
    });

    return { id: input.publicId, versionId: newVersion.IdVersionAvaluo, copied };
  }, REOPEN_TRANSACTION_OPTIONS);
}
