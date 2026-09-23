import { prisma } from "@/infrastructure/database/prisma-client";
import { Prisma } from "@prisma/client";
import {
  getCanonicalSectionKey,
  getOrderedValuationSections,
  sectionKeyToWorkspaceId,
  type ValuationSectionDefinition,
} from "@/features/valuations/sections/section-registry";
import { getInitialSectionTemplate } from "@/features/valuations/sections";
import type { Block, BlockFlowPersisted, ConceptType, ConceptValueFormat, ContentLayoutPersisted, Apartado, TableContent } from "@/features/valuations/model";
import { isBoundaryDistanceValueFormat } from "@/features/valuations/services/concept-value-format";
import {
  hydrateBlockMetadata,
  hydrateConceptMetadata,
  hydrateImageMetadata,
  hydrateSectionMetadata,
  hydrateApartadoMetadata,
} from "@/features/valuations/metadata";
import { storageProvider } from "@/infrastructure/storage/storage-provider";
import type { TableCellFormat, TableV2 } from "@/features/valuations/services/table";
import { decodeStoredTable } from "@/features/valuations/services/table-persistence";
import { extractStorageKey, isS3Source } from "@/features/valuations/services/image-source";

export type ValuationListItem = {
  id: string;
  folio: string;
  client: string;
  location: string;
  postalCode: string;
  valuationKind: string;
  propertyKind: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user: { id: number; name: string; email: string };
  _count: { sections: number; comparables: number };
};

export type ValuationDetail = ValuationListItem & {
  sections: ValuationSectionDto[];
  comparables: ComparableDto[];
  caratula: CaratulaDto | null;
};

export type CaratulaDto = {
  numeroAvaluo: string;
  folio: string;
  solicitante: string;
  propietario: string;
  objeto: string;
  proposito: string;
  valuador: string;
  registroValuador: string;
  valorTotal: string;
  valorConLetra: string;
  fechaAvaluo: string;
  fechaVigencia: string;
};

export type ValuationSectionDto = {
  id: string;
  label: string;
  title: string;
  enabled: boolean;
  required: boolean;
  sortOrder: number;
  startOnNewPage?: boolean;
  flowSpacingBeforePx?: number;
  blocks: ValuationBlockDto[];
  _count?: { blocks: number };
};

export type ValuationBlockDto = {
  id: string;
  label: string;
  title: string;
  enabled: boolean;
  required: boolean;
  sortOrder: number;
  startOnNewPage?: boolean;
  flowSpacingBeforePx?: number;
  contentLayout?: ContentLayoutPersisted;
  blockFlow?: BlockFlowPersisted;
  conceptPresentation?: import("@/features/valuations/services/concept-presentation").ConceptPresentation;
  concepts: ValuationConceptDto[];
  subBlocks: ValuationApartadoDto[];
  tables: ValuationTableDto[];
  images: ValuationImageDto[];
};

export type ValuationApartadoDto = Omit<ValuationBlockDto, "label" | "required" | "subBlocks">;

export type ValuationConceptDto = {
  id: string;
  label: string;
  value: string;
  enabled: boolean;
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

export type ValuationTableDto = {
  id: string;
  title: string;
  columns: string;
  columnKeys?: string;
  rows: string;
  boundaryDistanceFormats?: string;
  enabled: boolean;
  /** Lossless stored table (ids, formulas, formats, schema). Absent for code templates. */
  table?: TableV2;
};

export type ValuationImageDto = {
  id: string;
  title: string;
  url: string;
  enabled: boolean;
  layoutWidth?: "normal" | "wide" | "full";
  layoutWidthPercent?: number;
};

export type ComparableDto = {
  id: string;
  title: string;
  source: string;
  status: string;
  operation: string;
  propertyKind: string;
  postalCode: string;
  price: string;
  area: string;
  pricePerMeter: string;
  distance: string;
  link: string;
  imageUrl: string | null;
  selected: boolean;
  location: string | null;
  bedrooms: string | null;
  bathrooms: string | null;
  parking: string | null;
  antiquity: string | null;
};

/** Everything the editor and the preview need from one version of a valuation. */
const versionContentInclude = Prisma.validator<Prisma.VersionAvaluoInclude>()({
  caratula: true,
  seccionesDocumentos: {
    include: {
      nodos: {
        include: {
          valores: true,
          tablasDocumentos: {
            include: {
              columnas: true,
              filas: { include: { celdas: true } },
            },
          },
          nodosHijos: {
            include: {
              valores: true,
              tablasDocumentos: {
                include: {
                  columnas: true,
                  filas: { include: { celdas: true } },
                },
              },
              nodosHijos: {
                include: {
                  valores: true,
                  tablasDocumentos: {
                    include: {
                      columnas: true,
                      filas: { include: { celdas: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { IOrden: "asc" },
  },
  comparables: {
    include: {
      propiedad: { include: { tipoInmueble: true, direccionesPropiedad: true } },
      publicacionPropiedad: {
        include: { fuenteInmobiliaria: true, tipoOperacion: true, imagenes: true },
      },
      tipoComparable: true,
    },
    orderBy: { DFechaSeleccion: "desc" },
  },
});

const valuationDetailInclude = Prisma.validator<Prisma.AvaluoInclude>()({
  usuarioCreador: true,
  estadoAvaluo: true,
  tipoAvaluo: true,
  tipoInmueble: true,
  tipoOperacion: true,
  propiedadSujeto: { include: { direccionesPropiedad: true } },
  versionTrabajo: { include: versionContentInclude },
});

type AvaluoWithRelations = Prisma.AvaluoGetPayload<{ include: typeof valuationDetailInclude }>;


export async function listValuations(organizationId: number): Promise<ValuationListItem[]> {
  const valuations = await prisma.avaluo.findMany({
    where: {
      IdOrganizacion: organizationId,
      BActivo: true,
      DFechaEliminacion: null,
    },
    include: {
      usuarioCreador: true,
      estadoAvaluo: true,
      tipoAvaluo: true,
      tipoInmueble: true,
      tipoOperacion: true,
      propiedadSujeto: { include: { direccionesPropiedad: true } },
      _count: { select: { comparables: true, versiones: true } },
    },
    orderBy: { DFechaCreacion: "desc" },
  });

  return valuations.map((valuation) => ({
    id: valuation.UIdentificadorPublico,
    folio: valuation.SFolio,
    client: valuation.SNombreCliente ?? "",
    location: currentAddress(valuation.propiedadSujeto?.direccionesPropiedad),
    postalCode: currentPostalCode(valuation.propiedadSujeto?.direccionesPropiedad),
    valuationKind: valuation.tipoOperacion.SClave.toLowerCase(),
    propertyKind: valuation.tipoInmueble.SClave.toLowerCase(),
    status: valuation.estadoAvaluo.SClave.toLowerCase(),
    createdAt: valuation.DFechaCreacion,
    updatedAt: valuation.DFechaModificacion,
    user: {
      id: valuation.usuarioCreador.IdUsuario,
      name: fullName(valuation.usuarioCreador),
      email: valuation.usuarioCreador.SCorreo,
    },
    _count: { sections: valuation._count.versiones, comparables: valuation._count.comparables },
  }));
}

export async function getValuationByPublicId(
  id: string,
  organizationId: number,
): Promise<ValuationDetail | null> {
  const valuation = await prisma.avaluo.findFirst({
    where: {
      UIdentificadorPublico: id,
      IdOrganizacion: organizationId,
      BActivo: true,
      DFechaEliminacion: null,
    },
    include: valuationDetailInclude,
  });

  if (!valuation) return null;

  // A concluded valuation has no working version: show its final version.
  const content =
    valuation.versionTrabajo ??
    (valuation.IdVersionFinal
      ? await prisma.versionAvaluo.findUnique({
          where: { IdVersionAvaluo: valuation.IdVersionFinal },
          include: versionContentInclude,
        })
      : null);

  return mapValuationDetail(valuation, content);
}

export async function softDeleteValuation(id: string, organizationId: number) {
  const existing = await prisma.avaluo.findFirst({
    where: { UIdentificadorPublico: id, IdOrganizacion: organizationId, DFechaEliminacion: null },
    select: { IdAvaluo: true },
  });
  if (!existing) return null;

  await prisma.avaluo.update({
    where: { IdAvaluo: existing.IdAvaluo },
    data: { BActivo: false, DFechaEliminacion: new Date() },
  });

  return { id };
}

async function mapValuationDetail(
  valuation: AvaluoWithRelations,
  content: VersionTrabajo | null,
): Promise<ValuationDetail> {
  const sections = buildCanonicalValuationSections(content?.seccionesDocumentos ?? []);
  const comparables = content?.comparables.map(mapComparable) ?? [];

  // Resolve all image URLs to fresh signed URLs (handles expired S3 URLs)
  await resolveSectionImageUrls(sections);

  return {
    id: valuation.UIdentificadorPublico,
    folio: valuation.SFolio,
    client: valuation.SNombreCliente ?? "",
    location: currentAddress(valuation.propiedadSujeto?.direccionesPropiedad),
    postalCode: currentPostalCode(valuation.propiedadSujeto?.direccionesPropiedad),
    valuationKind: valuation.tipoOperacion.SClave.toLowerCase(),
    propertyKind: valuation.tipoInmueble.SClave.toLowerCase(),
    status: valuation.estadoAvaluo.SClave.toLowerCase(),
    createdAt: valuation.DFechaCreacion,
    updatedAt: valuation.DFechaModificacion,
    user: {
      id: valuation.usuarioCreador.IdUsuario,
      name: fullName(valuation.usuarioCreador),
      email: valuation.usuarioCreador.SCorreo,
    },
    _count: { sections: sections.length, comparables: comparables.length },
    sections,
    comparables,
    caratula: content?.caratula ? mapCaratula(content.caratula) : null,
  };
}

/**
 * Resolve all image URLs in sections to fresh signed URLs.
 * This handles the case where persisted signed S3 URLs have expired.
 */
async function resolveSectionImageUrls(sections: ValuationSectionDto[]): Promise<void> {
  const imageUrls: string[] = [];
  for (const section of sections) {
    for (const block of section.blocks) {
      for (const img of block.images) {
        if (img.url) imageUrls.push(img.url);
      }
      for (const sb of block.subBlocks) {
        for (const img of sb.images) {
          if (img.url) imageUrls.push(img.url);
        }
      }
    }
  }

  if (imageUrls.length === 0) return;

  // Deduplicate and resolve in parallel
  const uniqueUrls = [...new Set(imageUrls)];
  const resolved = await Promise.all(uniqueUrls.map(resolveImageUrl));
  const urlMap = new Map(uniqueUrls.map((url, i) => [url, resolved[i]]));

  // Apply resolved URLs back
  for (const section of sections) {
    for (const block of section.blocks) {
      for (const img of block.images) {
        if (img.url) {
          const fresh = urlMap.get(img.url);
          if (fresh !== undefined) img.url = fresh;
        }
      }
      for (const sb of block.subBlocks) {
        for (const img of sb.images) {
          if (img.url) {
            const fresh = urlMap.get(img.url);
            if (fresh !== undefined) img.url = fresh;
          }
        }
      }
    }
  }
}

type VersionTrabajo = NonNullable<AvaluoWithRelations["versionTrabajo"]>;
type DbSection = VersionTrabajo["seccionesDocumentos"][number];
type DbNode = DbSection["nodos"][number];

const DEFAULT_DOCUMENT_TEMPLATE_KEYS = new Set([
  "CONSTRUCCION",
  "CONSIDERACIONES",
  "COSTOS",
  "MERCADO_VENTA",
  "MERCADO_RENTAS",
  "INGRESOS",
  "FOTOS_SUJETO",
  "CROQUIS_COMPARABLES",
  "HOMOLOGACION",
  "INDIRECTOS",
  "CONCLUSIONES",
]);

export function buildCanonicalValuationSections(sections: DbSection[]): ValuationSectionDto[] {
  const byCanonical = new Map<string, DbSection[]>();
  for (const section of sections) {
    const canonical = getCanonicalSectionKey(section.SClave);
    const group = byCanonical.get(canonical) ?? [];
    group.push(section);
    byCanonical.set(canonical, group);
  }

  return getOrderedValuationSections().map((definition) => {
    const persisted = selectCanonicalSection(byCanonical.get(definition.key) ?? []);
    return persisted ? mapSection(persisted, definition) : createEmptySection(definition);
  });
}

function selectCanonicalSection(sections: DbSection[]) {
  return [...sections].sort((a, b) => {
    const valueDelta = countSectionValues(b) - countSectionValues(a);
    if (valueDelta !== 0) return valueDelta;
    const nodeDelta = b.nodos.length - a.nodos.length;
    if (nodeDelta !== 0) return nodeDelta;
    return a.IdSeccionDocumento - b.IdSeccionDocumento;
  })[0] ?? null;
}

function countSectionValues(section: DbSection) {
  return section.nodos.reduce((total, node) => {
    const childValues = node.nodosHijos.reduce((childTotal, child) => childTotal + child.valores.length, 0);
    return total + node.valores.length + childValues;
  }, 0);
}

function createEmptySection(definition: ValuationSectionDefinition): ValuationSectionDto {
  const blocks = DEFAULT_DOCUMENT_TEMPLATE_KEYS.has(definition.key)
    ? templateBlocks(definition.key)
    : [];
  return {
    id: sectionKeyToWorkspaceId(definition.key),
    label: definition.key,
    title: definition.label,
    enabled: true,
    required: definition.required,
    sortOrder: definition.order,
    startOnNewPage: false,
    blocks,
    _count: { blocks: blocks.length },
  };
}

function mapSection(section: DbSection, definition: ValuationSectionDefinition): ValuationSectionDto {
  const sectionMetadata = hydrateSectionMetadata(section.JConfiguracion);
  const rootNodes = section.nodos
    .filter((node) => node.IdNodoPadre === null && node.DFechaEliminacion === null)
    .sort((a, b) => a.IOrden - b.IOrden);

  const blocks = DEFAULT_DOCUMENT_TEMPLATE_KEYS.has(definition.key)
    && isEmptySectionPlaceholder(section, rootNodes, definition.label)
    ? templateBlocks(definition.key)
    : rootNodes.map((node) => mapNodeToBlock(node, definition.key));

  return {
    id: sectionKeyToWorkspaceId(definition.key),
    label: definition.key,
    title: definition.label,
    enabled: section.BVisible !== false && sectionMetadata.enabled !== false,
    required: definition.required,
    sortOrder: definition.order,
    startOnNewPage: sectionMetadata.startOnNewPage ?? false,
    flowSpacingBeforePx: sectionMetadata.flowSpacingBeforePx,
    blocks,
    _count: { blocks: blocks.length },
  };
}

function isEmptySectionPlaceholder(
  section: DbSection,
  rootNodes: DbNode[],
  sectionLabel: string,
) {
  if (rootNodes.length !== 1) return false;
  const root = rootNodes[0];
  const title = normalizeTemplateIdentity(root.STitulo);
  return title === normalizeTemplateIdentity(sectionLabel)
    && root.valores.length === 0
    && root.tablasDocumentos.length === 0
    && root.nodosHijos.every((child) => child.DFechaEliminacion !== null)
    && countSectionValues(section) === 0;
}

function normalizeTemplateIdentity(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

function templateBlocks(sectionKey: string): ValuationBlockDto[] {
  const template = getInitialSectionTemplate(sectionKey);
  return (template?.blocks ?? []).map((block, index) =>
    mapTemplateBlock(block, index, sectionKey),
  );
}

function mapTemplateBlock(block: Block, sortOrder: number, sectionKey: string): ValuationBlockDto {
  return {
    id: block.id,
    label: sectionKey,
    title: block.title,
    enabled: block.enabled,
    required: block.required,
    sortOrder,
    startOnNewPage: block.startOnNewPage ?? false,
    concepts: block.concepts.map((concept) => ({ ...concept, enabled: concept.enabled ?? true })),
    subBlocks: block.apartados.map(mapTemplateApartado),
    tables: block.tables.map(mapTemplateTable),
    images: block.images.map((image) => ({
      id: image.id,
      title: image.title,
      url: image.src,
      enabled: image.enabled ?? true,
      layoutWidth: image.layoutWidth,
      layoutWidthPercent: image.layoutWidthPercent,
    })),
  };
}

function mapTemplateApartado(subBlock: Apartado, sortOrder: number): ValuationApartadoDto {
  return {
    id: subBlock.id,
    title: subBlock.title,
    enabled: subBlock.enabled,
    sortOrder,
    startOnNewPage: subBlock.startOnNewPage ?? false,
    concepts: subBlock.concepts.map((concept) => ({ ...concept, enabled: concept.enabled ?? true })),
    tables: subBlock.tables.map(mapTemplateTable),
    images: subBlock.images.map((image) => ({
      id: image.id,
      title: image.title,
      url: image.src,
      enabled: image.enabled ?? true,
      layoutWidth: image.layoutWidth,
      layoutWidthPercent: image.layoutWidthPercent,
    })),
  };
}

function mapTemplateTable(table: TableContent): ValuationTableDto {
  return {
    id: table.id,
    title: table.title,
    columns: JSON.stringify(table.columns),
    columnKeys: JSON.stringify(table.columnKeys ?? []),
    rows: JSON.stringify(table.rows),
    boundaryDistanceFormats: table.boundaryDistanceFormats?.length
      ? JSON.stringify(table.boundaryDistanceFormats)
      : undefined,
    enabled: table.enabled ?? true,
  };
}

function mapNodeToBlock(node: DbNode, label: string): ValuationBlockDto {
  const children = node.nodosHijos
    .filter((child) => child.DFechaEliminacion === null)
    .sort((a, b) => a.IOrden - b.IOrden);
  const conceptNodes = children.filter((child) => nodeKind(child) === "concept");
  const subBlockNodes = children.filter((child) => nodeKind(child) === "subBlock");
  const imageNodes = children.filter((child) => nodeKind(child) === "image");

  const blockMetadata = hydrateBlockMetadata(node.JConfiguracion);

  return {
    id: node.SClave,
    label,
    title: node.STitulo,
    enabled: node.BVisible,
    required: node.BObligatorio,
    sortOrder: node.IOrden,
    startOnNewPage: blockMetadata.startOnNewPage ?? false,
    contentLayout: blockMetadata.contentLayout,
    blockFlow: blockMetadata.blockFlow,
    conceptPresentation: blockMetadata.conceptPresentation,
    flowSpacingBeforePx: blockMetadata.flowSpacingBeforePx,
    concepts: conceptNodes.map(mapConceptNode),
    subBlocks: subBlockNodes.map((child) => {
      const subChildren = child.nodosHijos
        .filter((grandChild) => grandChild.DFechaEliminacion === null)
        .sort((a, b) => a.IOrden - b.IOrden);
      return {
        id: child.SClave,
        title: child.STitulo,
        ...hydrateApartadoMetadata(child.JConfiguracion),
        sortOrder: child.IOrden,
        concepts: subChildren.filter((grandChild) => nodeKind(grandChild) === "concept").map(mapConceptNode),
        tables: mapNodeTables(child),
        images: subChildren.filter((grandChild) => nodeKind(grandChild) === "image").map(mapImageNode),
      };
    }),
    tables: mapNodeTables(node),
    images: imageNodes.map(mapImageNode),
  };
}

function mapConceptNode(node: {
  IdNodoDocumento: number;
  SClave: string;
  STitulo: string;
  JConfiguracion: Prisma.JsonValue | null;
  valores: Prisma.ValorNodoDocumentoGetPayload<object>[];
}): ValuationConceptDto {
  const value = node.valores[0];
  return {
    id: node.SClave,
    label: node.STitulo,
    value: value ? stringifyValue(value) : "",
    ...hydrateConceptMetadata(node.JConfiguracion),
  };
}

function mapImageNode(node: {
  IdNodoDocumento: number;
  SClave: string;
  STitulo: string;
  JConfiguracion: Prisma.JsonValue | null;
  valores: Prisma.ValorNodoDocumentoGetPayload<object>[];
}): ValuationImageDto {
  const value = node.valores[0];
  return {
    id: node.SClave,
    title: node.STitulo,
    url: value ? stringifyValue(value) : "",
    ...hydrateImageMetadata(node.JConfiguracion),
  };
}

/**
 * Resolve an image source to a fresh renderable URL.
 *
 * Uses extractStorageKey to normalize the source, then generates
 * a fresh signed URL if the source is an S3 key.
 */
async function resolveImageUrl(rawSrc: string): Promise<string> {
  if (!rawSrc) return "";

  if (isS3Source(rawSrc)) {
    const key = extractStorageKey(rawSrc);
    try {
      return await storageProvider.getPrivateDownloadUrl(key);
    } catch {
      return rawSrc;
    }
  }

  // Non-S3 source → return as-is
  return rawSrc;
}

function mapNodeTables(node: Pick<DbNode, "tablasDocumentos">): ValuationTableDto[] {
  return node.tablasDocumentos
    .filter((table) => !jsonRecord(table.JConfiguracion)?.removed)
    .slice()
    .sort((a, b) => a.IOrden - b.IOrden)
    .map((table) => {
      const columns = table.columnas
        .filter((column) => column.DFechaEliminacion === null)
        .sort((a, b) => a.IOrden - b.IOrden);
      const rows = table.filas
        .filter((row) => row.BActivo)
        .sort((a, b) => a.IOrden - b.IOrden)
        .map((row) =>
          columns.map((column) => {
            const cell = row.celdas.find(
              (item) => item.IdColumnaTablaDocumento === column.IdColumnaTablaDocumento,
            );
            return cell ? stringifyCellValue(cell) : "";
          }),
        );

      const boundaryDistanceFormats = tableBoundaryDistanceFormats(table.JConfiguracion);
      const schema = tableSchemaFromConfig(table.JConfiguracion);
      const tableId = tableClientId(table) ?? `table-${table.IOrden + 1}`;
      const activeRows = table.filas
        .filter((row) => row.BActivo)
        .sort((a, b) => a.IOrden - b.IOrden);
      const stored = decodeStoredTable({
        id: tableId,
        title: table.SNombre,
        enabled: jsonRecord(table.JConfiguracion)?.enabled !== false,
        schema,
        columns: columns.map((column) => {
          const config = jsonRecord(column.JConfiguracion);
          const clientId = typeof config?.clientId === "string" ? config.clientId : null;
          const sourceKey = typeof config?.sourceKey === "string" ? config.sourceKey : null;
          return {
            id: clientId ?? sourceKey ?? column.SClave,
            name: column.SNombre,
            ...(jsonRecord(config?.format) ? { format: config!.format as TableCellFormat } : {}),
          };
        }),
        rows: activeRows.map((row) => {
          const metadata = jsonRecord(row.JMetadatos);
          return {
            id: typeof metadata?.clientId === "string" ? metadata.clientId : null,
            cells: columns.map((column) => {
              const cell = row.celdas.find((item) => item.IdColumnaTablaDocumento === column.IdColumnaTablaDocumento);
              return cell
                ? {
                    text: cell.SValorTexto,
                    numeric: cell.NValorNumerico?.toString() ?? null,
                    boolean: cell.BValorBooleano,
                    date: cell.DValorFecha?.toISOString() ?? null,
                    complex: cell.JValorComplejo,
                    calculated: cell.BEsCalculado,
                  }
                : null;
            }),
          };
        }),
      });
      return {
        table: stored,
        id: tableId,
        title: table.SNombre,
        columns: JSON.stringify(columns.map((column) => column.SNombre)),
        columnKeys: JSON.stringify(columns.map((column) => column.SClave)),
        rows: JSON.stringify(rows),
        boundaryDistanceFormats: boundaryDistanceFormats.length ? JSON.stringify(boundaryDistanceFormats) : undefined,
        enabled: true,
        ...(schema ? { schema } : {}),
      };
    });
}

function nodeKind(node: { JConfiguracion: Prisma.JsonValue | null }) {
  if (!node.JConfiguracion || typeof node.JConfiguracion !== "object" || Array.isArray(node.JConfiguracion)) {
    return null;
  }
  const value = (node.JConfiguracion as { kind?: unknown }).kind;
  return typeof value === "string" ? value : null;
}

function jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Prisma.JsonValue>) : null;
}

function tableClientId(table: { JConfiguracion: Prisma.JsonValue | null }) {
  if (!table.JConfiguracion || typeof table.JConfiguracion !== "object" || Array.isArray(table.JConfiguracion)) {
    return null;
  }
  const value = (table.JConfiguracion as { clientId?: unknown }).clientId;
  return typeof value === "string" && value.length ? value : null;
}

function tableBoundaryDistanceFormats(config: Prisma.JsonValue | null) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return [];
  const formats = (config as { boundaryDistanceFormats?: unknown }).boundaryDistanceFormats;
  if (!Array.isArray(formats)) return [];
  return formats.map((format) => {
    if (!format || typeof format !== "object" || Array.isArray(format)) return {};
    const value = format as { valueFormat?: unknown; customUnit?: unknown };
    const valueFormat = value.valueFormat;
    return {
      ...(isBoundaryDistanceValueFormat(valueFormat) ? { valueFormat } : {}),
      ...(typeof value.customUnit === "string" ? { customUnit: value.customUnit } : {}),
    };
  });
}

function tableSchemaFromConfig(config: Prisma.JsonValue | null): unknown {
  if (!config || typeof config !== "object" || Array.isArray(config)) return undefined;
  const schema = (config as { schema?: unknown }).schema;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  return schema;
}

function mapCaratula(caratula: NonNullable<VersionTrabajo["caratula"]>): CaratulaDto {
  return {
    numeroAvaluo: caratula.SNumeroAvaluo ?? "",
    folio: caratula.SFolio ?? "",
    solicitante: caratula.SNombreSolicitante ?? "",
    propietario: caratula.SNombrePropietario ?? "",
    objeto: caratula.SObjetoAvaluo ?? "",
    proposito: caratula.SPropositoAvaluo ?? "",
    valuador: caratula.SNombreValuador ?? "",
    registroValuador: caratula.SRegistroValuador ?? "",
    valorTotal: caratula.NValorTotal?.toString() ?? "",
    valorConLetra: caratula.SValorConLetra ?? "",
    fechaAvaluo: caratula.DFechaAvaluo ? toDateInput(caratula.DFechaAvaluo) : "",
    fechaVigencia: caratula.DFechaVigencia ? toDateInput(caratula.DFechaVigencia) : "",
  };
}

function mapComparable(
  comparable: NonNullable<AvaluoWithRelations["versionTrabajo"]>["comparables"][number],
): ComparableDto {
  const publication = comparable.publicacionPropiedad;
  const property = comparable.propiedad;
  const address = property.direccionesPropiedad.find((item) => item.BEsDireccionActual);
  const area = comparable.NSuperficieConstruccionCapturada ?? comparable.NSuperficieTerrenoCapturada;

  return {
    id: comparable.UIdentificadorPublico,
    title: publication?.STitulo ?? property.SNombre ?? "Comparable",
    source: publication?.fuenteInmobiliaria.SNombre ?? comparable.tipoComparable.SNombre,
    status: comparable.BIncluido ? "activo" : "historial",
    operation: publication?.tipoOperacion.SClave.toLowerCase() ?? "venta",
    propertyKind: property.tipoInmueble?.SClave.toLowerCase() ?? "casa",
    postalCode: address?.SCodigoPostal ?? "",
    price: decimalToMoney(comparable.NPrecioCapturado ?? publication?.NPrecio),
    area: area ? `${area.toString()} m2` : "",
    pricePerMeter: decimalToMoney(comparable.NValorUnitarioCapturado),
    distance: comparable.NDistanciaMetros ? `${comparable.NDistanciaMetros.toString()} m` : "",
    link: publication?.SURL ?? "",
    imageUrl: publication?.imagenes.find((image) => image.BPrincipal)?.SURLOrigen ?? null,
    selected: comparable.BIncluido,
    location: address?.SDireccionCompleta ?? null,
    bedrooms: property.IRecamaras?.toString() ?? null,
    bathrooms: property.IBanosCompletos?.toString() ?? null,
    parking: property.IEstacionamientos?.toString() ?? null,
    antiquity: property.NEdad?.toString() ?? null,
  };
}

function stringifyValue(value: Prisma.ValorNodoDocumentoGetPayload<object>): string {
  if (value.SValorTexto !== null) return value.SValorTexto;
  if (value.NValorNumerico !== null) return value.NValorNumerico.toString();
  if (value.BValorBooleano !== null) return value.BValorBooleano ? "Si" : "No";
  if (value.DValorFecha !== null) return value.DValorFecha.toISOString();
  if (value.JValorComplejo !== null) return JSON.stringify(value.JValorComplejo);
  return "";
}

function stringifyCellValue(value: Prisma.CeldaTablaDocumentoGetPayload<object>): string {
  if (value.SValorTexto !== null) return value.SValorTexto;
  if (value.NValorNumerico !== null) return value.NValorNumerico.toString();
  if (value.BValorBooleano !== null) return value.BValorBooleano ? "Si" : "No";
  if (value.DValorFecha !== null) return value.DValorFecha.toISOString();
  if (value.JValorComplejo !== null) return JSON.stringify(value.JValorComplejo);
  return "";
}

function fullName(user: { SNombre: string; SApellidoPaterno: string | null; SApellidoMaterno: string | null }) {
  return [user.SNombre, user.SApellidoPaterno, user.SApellidoMaterno].filter(Boolean).join(" ");
}

function currentAddress(addresses?: Array<{ SDireccionCompleta: string; BEsDireccionActual: boolean }>) {
  return addresses?.find((address) => address.BEsDireccionActual)?.SDireccionCompleta ?? "";
}

function currentPostalCode(addresses?: Array<{ SCodigoPostal: string | null; BEsDireccionActual: boolean }>) {
  return addresses?.find((address) => address.BEsDireccionActual)?.SCodigoPostal ?? "";
}

function decimalToMoney(value: Prisma.Decimal | null | undefined) {
  return value ? value.toString() : "";
}

function toDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}
