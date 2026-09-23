import { Prisma } from "@prisma/client";
import { extractStorageKey } from "@/features/valuations/services/image-source";
import {
  DOCUMENT_DESCRIPTION_MAX_LENGTH,
  DOCUMENT_NODE_KEY_MAX_LENGTH,
  DOCUMENT_NODE_TITLE_MAX_LENGTH,
  clientIdFromConfig,
  emptyValueColumns,
  hasCapturableValue,
  limitDbText,
  nodeDescription,
  normalizeDbKey,
  occupiedValueColumns,
  valueColumns,
  valueKind,
} from "./db-values";
import { ValuationWorkflowError } from "./errors";
import {
  logPersistenceOperation,
  type DocumentPersistenceCatalogs,
  type PersistenceStats,
} from "./persistence-context";
import type { ConceptPayload, ImagePayload, Tx } from "./types";

export async function upsertDocumentNode(input: {
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

export async function syncConcepts(input: {
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

export async function syncImages(input: {
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
  if (!versionId) throw new ValuationWorkflowError("No se pudo resolver la version del nodo", 500);
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

export async function softDeleteMissingChildren(input: {
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

export async function softDeleteMissingRootNodes(input: {
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
