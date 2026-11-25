import { prisma } from "@/infrastructure/database/prisma-client";
import { Prisma } from "@prisma/client";
import {
  getCanonicalSectionKey,
  getOrderedValuationSections,
  isCustomSectionId,
  sectionKeyToWorkspaceId,
  type ValuationSectionDefinition,
} from "@/features/valuations/sections/section-registry";
import { getInitialSectionTemplate } from "@/features/valuations/sections";
import type { Block, BlockFlowV2, ConceptType, ConceptValueFormat, ContentLayout, HeaderExtraField, Apartado, TableContent } from "@/features/valuations/model";
import { isBoundaryDistanceValueFormat } from "@/features/valuations/services/concept-value-format";
import {
  hydrateBlockMetadata,
  hydrateConceptMetadata,
  hydrateImageMetadata,
  hydrateSectionMetadata,
  hydrateApartadoMetadata,
  isRemovedSectionConfig,
  type BlockMetadata,
  type SectionMetadata,
} from "@/features/valuations/metadata";
import { stableDownloadUrl } from "@/infrastructure/storage/stable-url";
import type { TableCellFormat, TableV2 } from "@/features/valuations/services/table";
import { decodeStoredTable } from "@/features/valuations/services/table-persistence";
import { extractStorageKey, isS3Source } from "@/features/valuations/services/image-source";
import { resolveSignatures, validityMonthsBetween, type ValuationSignature } from "@/features/valuations/services/valuation-signatures";
import { COVER_IMAGE_FOCUS_CENTER, normalizeCoverImageFocus, type CoverImageFocus, type CoverImageSize } from "@/features/valuations/services/cover-image-focus";
import { readOwnKindNames } from "@/features/valuations/services/property-kinds";
import { readAppraisalSubject, type AppraisalClass } from "@/features/valuations/services/appraisal-subject";
import { savedTitle } from "@/features/valuations/services/block-title";
import { printVersionOf, printsWith } from "@/features/valuations/services/print-version";

export type ValuationListItem = {
  id: string;
  folio: string;
  client: string;
  location: string;
  postalCode: string;
  valuationKind: string;
  propertyKind: string;
  /** The name of a kind of the appraiser's own, when the kind is "otro"/"otra" (property-kinds.ts). */
  propertyKindOther?: string;
  valuationKindOther?: string;
  /** «Clase de avalúo» and «¿Qué se está valuando?» (appraisal-subject.ts). */
  appraisalClass?: AppraisalClass;
  essence?: string;
  /** Lowercase SClave of «Tipo de avalúo» (Comercial…), and the name of its «Otro». */
  appraisalKind?: string;
  appraisalKindOther?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user: { id: number; name: string; email: string };
  _count: { sections: number; comparables: number };
};

export type ValuationDetail = ValuationListItem & {
  /** Concluded valuations are locked until they are reopened. */
  locked: boolean;
  /** The print rules its dictamen follows: a concluded one keeps those it was concluded with (services/print-version.ts). */
  printVersion: number;
  /** The reviewer approved it «En revisión» (migration 059); null otherwise. */
  reviewApprovedAt?: Date | null;
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
  firmas: ValuationSignature[];
  valorTotal: string;
  valorConLetra: string;
  fechaAvaluo: string;
  mesesVigencia: number | null;
  fechaVigencia: string;
  enfoqueImagenPrincipal: CoverImageFocus;
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
  /** The document's choice of thousands separator, on the carátula section. */
  thousandsSeparator?: boolean;
  /** The document's binding margin and title bars, on the carátula section. */
  bindingMargin?: "normal" | "wide";
  titleBars?: "filled" | "outline";
  titleBand?: "filled" | "outline";
  /** The document's colours, on the carátula section. */
  palette?: SectionMetadata["palette"];
  freeBlockOrder?: boolean;
  /** The carátula's choices of what prints: the advertisers' data and the legend of AI tools. */
  advertiserData?: boolean;
  aiToolsLegend?: boolean;
  layoutVersion?: number;
  /** Chapter or annex, the label of an annex, where it starts and the approaches left out of the dictamen. */
  documentRole?: SectionMetadata["documentRole"];
  annexTitle?: string;
  pageBreak?: SectionMetadata["pageBreak"];
  excludedFromReport?: SectionMetadata["excludedFromReport"];
  captureHeaders?: SectionMetadata["captureHeaders"];
  /** A section the appraiser added. */
  custom?: boolean;
  /** The appraiser renamed the tab. */
  titleEdited?: boolean;
  /** A registry section the appraiser deleted: read back hidden, out of the tab strip. */
  removed?: boolean;
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
  pageBreak?: BlockMetadata["pageBreak"];
  pageOrientation?: BlockMetadata["pageOrientation"];
  titleHidden?: boolean;
  flowSpacingBeforePx?: number;
  contentLayout?: ContentLayout;
  blockFlow?: BlockFlowV2;
  conceptPresentation?: import("@/features/valuations/services/concept-presentation").ConceptPresentation;
  /** The carátula's company header block: the extra header data. */
  headerFields?: HeaderExtraField[];
  /** The carátula's company header block: the size of the principal cover image. */
  coverImageSize?: CoverImageSize;
  /** The block of the concluded value: it prints the chart of the values. */
  valueChart?: boolean;
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
  options?: string[];
  generatedLabel?: string;
  calculationUnlinked?: boolean;
  calculationKey?: string;
  headerDate?: "valuation" | "validity";
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


/** Upper bound for the unpaginated list served by GET /api/avaluos. */
const LIST_VALUATIONS_MAX = 200;

/** Most recently created valuations of the organization, capped at LIST_VALUATIONS_MAX. */
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
    orderBy: [{ DFechaCreacion: "desc" }, { IdAvaluo: "desc" }],
    take: LIST_VALUATIONS_MAX,
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

/** Archives the valuation (out of the main list, still the firm's) or brings it back. */
export async function setValuationArchived(id: string, organizationId: number, archived: boolean) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const existing = await prisma.avaluo.findFirst({
    where: { UIdentificadorPublico: id, IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null },
    select: { IdAvaluo: true },
  });
  if (!existing) return null;
  await prisma.avaluo.update({ where: { IdAvaluo: existing.IdAvaluo }, data: { DFechaArchivo: archived ? new Date() : null } });
  return { id, archived };
}

/** Number of active valuations of the organization per lowercase status key; the archived ones are not counted. */
export async function countValuationsByStatus(organizationId: number): Promise<Record<string, number>> {
  const groups = await prisma.avaluo.groupBy({
    by: ["IdEstadoAvaluo"],
    where: { IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null, DFechaArchivo: null },
    _count: { _all: true },
  });
  if (groups.length === 0) return {};

  const statuses = await prisma.estadoAvaluo.findMany({
    where: { IdEstadoAvaluo: { in: groups.map((group) => group.IdEstadoAvaluo) } },
    select: { IdEstadoAvaluo: true, SClave: true },
  });
  const keyById = new Map(statuses.map((status) => [status.IdEstadoAvaluo, status.SClave.toLowerCase()]));

  const counts: Record<string, number> = {};
  for (const group of groups) {
    const key = keyById.get(group.IdEstadoAvaluo);
    if (key) counts[key] = (counts[key] ?? 0) + group._count._all;
  }
  return counts;
}

/** Active valuation status catalog, in display order, with lowercase keys. */
export async function listValuationStatuses(): Promise<Array<{ key: string; name: string }>> {
  const statuses = await prisma.estadoAvaluo.findMany({
    where: { BActivo: true },
    select: { SClave: true, SNombre: true },
    orderBy: [{ IOrden: "asc" }, { IdEstadoAvaluo: "asc" }],
  });
  return statuses.map((status) => ({ key: status.SClave.toLowerCase(), name: status.SNombre }));
}

export async function getValuationByPublicId(
  id: string,
  organizationId: number,
): Promise<ValuationDetail | null> {
  // A malformed id is simply not found; Postgres would reject it as a UUID.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
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

  return mapValuationDetail(valuation, content, valuation.BBloqueado);
}

/**
 * One version of the valuation (V1, V2…) as it was saved, to read it in the
 * history: the same detail as the editor's, with that version's document.
 * Null when the valuation or the version does not exist.
 */
export async function getValuationVersionByPublicId(
  id: string,
  organizationId: number,
  versionNumber: number,
): Promise<ValuationDetail | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !Number.isSafeInteger(versionNumber) || versionNumber < 1) return null;
  const valuation = await prisma.avaluo.findFirst({
    where: { UIdentificadorPublico: id, IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null },
    include: valuationDetailInclude,
  });
  if (!valuation) return null;
  const version = await prisma.versionAvaluo.findFirst({
    where: { IdAvaluo: valuation.IdAvaluo, INumeroVersion: versionNumber },
    orderBy: { IdVersionAvaluo: "desc" },
    include: versionContentInclude,
  });
  if (!version) return null;
  // A version prints with the rules it was concluded with; one never concluded, with the current ones.
  return { ...(await mapValuationDetail(valuation, version, version.DFechaFinalizacion !== null)), locked: true };
}

/** The names of the appraiser's own kinds, the class and what is valued, as the meta carries them. */
function ownKindNamesOf(
  characteristics: unknown,
  propertyKind: string,
): Pick<ValuationListItem, "propertyKindOther" | "valuationKindOther" | "appraisalKindOther" | "appraisalClass" | "essence"> {
  const names = readOwnKindNames(characteristics);
  const subject = readAppraisalSubject(characteristics, propertyKind);
  return {
    ...(names.tipoBienOtro ? { propertyKindOther: names.tipoBienOtro } : {}),
    ...(names.tipoAvaluoOtro ? { valuationKindOther: names.tipoAvaluoOtro } : {}),
    ...(names.claseAvaluoOtro ? { appraisalKindOther: names.claseAvaluoOtro } : {}),
    appraisalClass: subject.appraisalClass,
    essence: subject.essence,
  };
}


async function mapValuationDetail(
  valuation: AvaluoWithRelations,
  content: VersionTrabajo | null,
  concluded: boolean,
): Promise<ValuationDetail> {
  const { essence } = readAppraisalSubject(valuation.propiedadSujeto?.JCaracteristicas, valuation.tipoInmueble.SClave);
  const printVersion = printVersionOf(content?.JConfiguracionCalculo, concluded);
  const sections = buildCanonicalValuationSections(content?.seccionesDocumentos ?? [], valuation.tipoInmueble.SClave, essence, { fullTexts: printsWith(printVersion, 1) });
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
    appraisalKind: valuation.tipoAvaluo.SClave.toLowerCase(),
    ...ownKindNamesOf(valuation.propiedadSujeto?.JCaracteristicas, valuation.tipoInmueble.SClave),
    status: valuation.estadoAvaluo.SClave.toLowerCase(),
    locked: valuation.BBloqueado,
    printVersion,
    reviewApprovedAt: valuation.DFechaRevisionAprobada,
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
  "METODOS_ALTERNATIVOS",
  "FOTOS_SUJETO",
  "CROQUIS_COMPARABLES",
  "HOMOLOGACION",
  "INDIRECTOS",
  "CONCLUSIONES",
]);

/**
 * `fullTexts`: a title or label longer than its column is read whole from its
 * `JConfiguracion` (B-14; the column keeps 180 or 250 characters). Off, as
 * read before, for a dictamen concluded with print rules 0 (print-version.ts).
 */
export function buildCanonicalValuationSections(
  sections: DbSection[],
  propertyKind?: string | null,
  essence?: string | null,
  { fullTexts = true }: { fullTexts?: boolean } = {},
): ValuationSectionDto[] {
  const read: TextReader = fullTexts ? storedFullText : (_row, stored) => stored;
  const byCanonical = new Map<string, DbSection[]>();
  for (const section of sections) {
    if (isCustomSectionId(section.SClave)) continue;
    const canonical = getCanonicalSectionKey(section.SClave);
    const group = byCanonical.get(canonical) ?? [];
    group.push(section);
    byCanonical.set(canonical, group);
  }

  // Every section takes the place it was saved in: the editor saves each
  // section's position as its index, the registry's included, so a section the
  // appraiser moved (Conclusión before Fotografías) is read back there. A
  // registry section never saved takes its place in the registry, which is the
  // index a new valuation stores it with.
  const placed: { order: number; rank: number; section: ValuationSectionDto }[] = getOrderedValuationSections().map((definition, index) => {
    const persisted = selectCanonicalSection(byCanonical.get(definition.key) ?? []);
    return persisted
      ? { order: persisted.IOrden, rank: index, section: mapSection(persisted, definition, read, propertyKind, essence) }
      : { order: index, rank: index, section: createEmptySection(definition, propertyKind, essence) };
  });
  const registryCount = placed.length;
  const custom = sections
    .filter((section) => isCustomSectionId(section.SClave) && !isRemovedSectionConfig(section.JConfiguracion))
    .sort((a, b) => a.IOrden - b.IOrden || a.IdSeccionDocumento - b.IdSeccionDocumento);
  custom.forEach((section, index) => {
    placed.push({ order: section.IOrden, rank: registryCount + index, section: mapCustomSection(section, read) });
  });
  // On a tie (older saves), the sections the appraiser added go before the registry section at that place.
  return placed
    .sort((a, b) => a.order - b.order || Number(b.rank >= registryCount) - Number(a.rank >= registryCount) || a.rank - b.rank)
    .map(({ section }) => section);
}

/** Chapter or annex, where the section starts and the approaches it leaves out, as saved. */
function sectionStructureDto(metadata: SectionMetadata) {
  return {
    ...(metadata.documentRole ? { documentRole: metadata.documentRole } : {}),
    ...(metadata.annexTitle ? { annexTitle: metadata.annexTitle } : {}),
    ...(metadata.pageBreak ? { pageBreak: metadata.pageBreak } : {}),
    ...(metadata.excludedFromReport?.length ? { excludedFromReport: metadata.excludedFromReport } : {}),
    ...(metadata.captureHeaders ? { captureHeaders: metadata.captureHeaders } : {}),
  };
}

function mapCustomSection(section: DbSection, read: TextReader): ValuationSectionDto {
  const sectionMetadata = hydrateSectionMetadata(section.JConfiguracion);
  const blocks = section.nodos
    .filter((node) => node.IdNodoPadre === null && node.DFechaEliminacion === null)
    .sort((a, b) => a.IOrden - b.IOrden)
    .map((node) => mapNodeToBlock(node, section.SClave, read));
  return {
    id: section.SClave,
    label: section.SClave,
    title: section.SNombre,
    enabled: section.BVisible !== false && sectionMetadata.enabled !== false,
    required: false,
    sortOrder: section.IOrden,
    startOnNewPage: sectionMetadata.startOnNewPage ?? false,
    flowSpacingBeforePx: sectionMetadata.flowSpacingBeforePx,
    ...sectionStructureDto(sectionMetadata),
    custom: true,
    titleEdited: true,
    blocks,
    _count: { blocks: blocks.length },
  };
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

/**
 * The sections a valuation with nothing saved yet reads back: every section of
 * the registry with its default blocks. «Nueva plantilla» starts from them, so
 * a template begins as a new valuation does.
 */
export function newValuationSections(propertyKind?: string | null): ValuationSectionDto[] {
  return getOrderedValuationSections().map((definition) => createEmptySection(definition, propertyKind));
}

function createEmptySection(definition: ValuationSectionDefinition, propertyKind?: string | null, essence?: string | null): ValuationSectionDto {
  const blocks = DEFAULT_DOCUMENT_TEMPLATE_KEYS.has(definition.key)
    ? templateBlocks(definition.key, propertyKind, essence)
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

function mapSection(section: DbSection, definition: ValuationSectionDefinition, read: TextReader, propertyKind?: string | null, essence?: string | null): ValuationSectionDto {
  const sectionMetadata = hydrateSectionMetadata(section.JConfiguracion);
  const rootNodes = section.nodos
    .filter((node) => node.IdNodoPadre === null && node.DFechaEliminacion === null)
    .sort((a, b) => a.IOrden - b.IOrden);

  const blocks = DEFAULT_DOCUMENT_TEMPLATE_KEYS.has(definition.key)
    && isEmptySectionPlaceholder(section, rootNodes, definition.label)
    ? templateBlocks(definition.key, propertyKind, essence)
    : rootNodes.map((node) => mapNodeToBlock(node, definition.key, read));

  // The registry's label, unless the appraiser renamed the tab; its name is then what was saved.
  const renamed = sectionMetadata.titleEdited === true && section.SNombre.trim().length > 0;
  // A required section is never deleted, whatever was stored.
  const removed = sectionMetadata.removed === true && !definition.required;
  return {
    id: sectionKeyToWorkspaceId(definition.key),
    label: definition.key,
    title: renamed ? section.SNombre : definition.label,
    enabled: !removed && section.BVisible !== false && sectionMetadata.enabled !== false,
    required: definition.required,
    sortOrder: definition.order,
    startOnNewPage: sectionMetadata.startOnNewPage ?? false,
    flowSpacingBeforePx: sectionMetadata.flowSpacingBeforePx,
    thousandsSeparator: sectionMetadata.thousandsSeparator,
    ...(sectionMetadata.bindingMargin ? { bindingMargin: sectionMetadata.bindingMargin } : {}),
    ...(sectionMetadata.titleBars ? { titleBars: sectionMetadata.titleBars } : {}),
    ...(sectionMetadata.titleBand ? { titleBand: sectionMetadata.titleBand } : {}),
    ...(sectionMetadata.palette ? { palette: sectionMetadata.palette } : {}),
    ...(sectionMetadata.freeBlockOrder ? { freeBlockOrder: true } : {}),
    ...(sectionMetadata.advertiserData ? { advertiserData: true } : {}),
    ...(sectionMetadata.aiToolsLegend ? { aiToolsLegend: true } : {}),
    ...(sectionMetadata.layoutVersion ? { layoutVersion: sectionMetadata.layoutVersion } : {}),
    ...sectionStructureDto(sectionMetadata),
    ...(renamed ? { titleEdited: true } : {}),
    ...(removed ? { removed: true } : {}),
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
  // The placeholder root is titled with the section name it was created with,
  // which may be an older label than the registry's current one.
  const placeholderTitles = [sectionLabel, section.SNombre].map(normalizeTemplateIdentity);
  return placeholderTitles.includes(title)
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

function templateBlocks(sectionKey: string, propertyKind?: string | null, essence?: string | null): ValuationBlockDto[] {
  const template = getInitialSectionTemplate(sectionKey, propertyKind, essence);
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

function mapNodeToBlock(node: DbNode, label: string, read: TextReader): ValuationBlockDto {
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
    title: savedTitle(read(node, node.STitulo)),
    ...(blockMetadata.titleHidden ? { titleHidden: true } : {}),
    enabled: node.BVisible,
    required: node.BObligatorio,
    sortOrder: node.IOrden,
    startOnNewPage: blockMetadata.startOnNewPage ?? false,
    ...(blockMetadata.pageBreak ? { pageBreak: blockMetadata.pageBreak } : {}),
    ...(blockMetadata.pageOrientation ? { pageOrientation: blockMetadata.pageOrientation } : {}),
    contentLayout: blockMetadata.contentLayout,
    blockFlow: blockMetadata.blockFlow,
    conceptPresentation: blockMetadata.conceptPresentation,
    flowSpacingBeforePx: blockMetadata.flowSpacingBeforePx,
    ...(blockMetadata.headerFields ? { headerFields: blockMetadata.headerFields } : {}),
    ...(blockMetadata.coverImageSize ? { coverImageSize: blockMetadata.coverImageSize } : {}),
    ...(blockMetadata.valueChart ? { valueChart: true } : {}),
    concepts: conceptNodes.map((child) => mapConceptNode(child, read)),
    subBlocks: subBlockNodes.map((child) => {
      const subChildren = child.nodosHijos
        .filter((grandChild) => grandChild.DFechaEliminacion === null)
        .sort((a, b) => a.IOrden - b.IOrden);
      return {
        id: child.SClave,
        title: savedTitle(read(child, child.STitulo)),
        ...hydrateApartadoMetadata(child.JConfiguracion),
        sortOrder: child.IOrden,
        concepts: subChildren.filter((grandChild) => nodeKind(grandChild) === "concept").map((grandChild) => mapConceptNode(grandChild, read)),
        tables: mapNodeTables(child, read),
        images: subChildren.filter((grandChild) => nodeKind(grandChild) === "image").map((grandChild) => mapImageNode(grandChild, read)),
      };
    }),
    tables: mapNodeTables(node, read),
    images: imageNodes.map((child) => mapImageNode(child, read)),
  };
}

function mapConceptNode(node: {
  IdNodoDocumento: number;
  SClave: string;
  STitulo: string;
  JConfiguracion: Prisma.JsonValue | null;
  valores: Prisma.ValorNodoDocumentoGetPayload<object>[];
}, read: TextReader): ValuationConceptDto {
  const value = node.valores[0];
  return {
    id: node.SClave,
    // A title the appraiser deleted is stored as «Campo sin título» (the column takes no empty text): it reads back empty (FAL-31).
    label: savedTitle(read(node, node.STitulo)),
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
}, read: TextReader): ValuationImageDto {
  const value = node.valores[0];
  return {
    id: node.SClave,
    title: read(node, node.STitulo),
    url: value ? stringifyValue(value) : "",
    ...hydrateImageMetadata(node.JConfiguracion),
  };
}

/**
 * Resolve an image source to a fresh renderable URL.
 *
 * Uses extractStorageKey to normalize the source, then gives the address
 * the browser can keep using: it does not expire while the editor is open.
 */
async function resolveImageUrl(rawSrc: string): Promise<string> {
  if (!rawSrc) return "";

  if (isS3Source(rawSrc)) {
    const key = extractStorageKey(rawSrc);
    try {
      return await stableDownloadUrl(key);
    } catch {
      return rawSrc;
    }
  }

  // Non-S3 source → return as-is
  return rawSrc;
}

function mapNodeTables(node: Pick<DbNode, "tablasDocumentos">, read: TextReader): ValuationTableDto[] {
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
        title: read(table, table.SNombre),
        enabled: jsonRecord(table.JConfiguracion)?.enabled !== false,
        schema,
        columns: columns.map((column) => {
          const config = jsonRecord(column.JConfiguracion);
          const clientId = typeof config?.clientId === "string" ? config.clientId : null;
          const sourceKey = typeof config?.sourceKey === "string" ? config.sourceKey : null;
          return {
            id: clientId ?? sourceKey ?? column.SClave,
            name: read(column, column.SNombre, "fullLabel"),
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
        title: read(table, table.SNombre),
        columns: JSON.stringify(columns.map((column) => read(column, column.SNombre, "fullLabel"))),
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

/** How a title or label is read: as stored, or whole (B-14). */
type TextReader = (row: { JConfiguracion: Prisma.JsonValue | null }, stored: string, key?: "fullTitle" | "fullLabel") => string;

/** A text longer than its column is saved cut, with the whole of it in `fullTitle` (`fullLabel` for a column) of its JConfiguracion. */
const storedFullText: TextReader = (row, stored, key = "fullTitle") => {
  const full = jsonRecord(row.JConfiguracion)?.[key];
  return typeof full === "string" && full.trim() ? full : stored;
};

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
  const fechaAvaluo = caratula.DFechaAvaluo ? toDateInput(caratula.DFechaAvaluo) : "";
  const fechaVigencia = caratula.DFechaVigencia ? toDateInput(caratula.DFechaVigencia) : "";
  return {
    numeroAvaluo: caratula.SNumeroAvaluo ?? "",
    folio: caratula.SFolio ?? "",
    solicitante: caratula.SNombreSolicitante ?? "",
    propietario: caratula.SNombrePropietario ?? "",
    objeto: caratula.SObjetoAvaluo ?? "",
    proposito: caratula.SPropositoAvaluo ?? "",
    // A carátula saved before signatures were a list shows its single signer first.
    firmas: resolveSignatures(caratula.JFirmas, { name: caratula.SNombreValuador, registration: caratula.SRegistroValuador }),
    valorTotal: caratula.NValorTotal?.toString() ?? "",
    valorConLetra: caratula.SValorConLetra ?? "",
    fechaAvaluo,
    mesesVigencia: caratula.IMesesVigencia ?? validityMonthsBetween(fechaAvaluo, fechaVigencia),
    fechaVigencia,
    // Never framed: centered, as the cover printed before the framing existed.
    enfoqueImagenPrincipal: normalizeCoverImageFocus({
      x: caratula.IEnfoqueImagenX ?? COVER_IMAGE_FOCUS_CENTER.x,
      y: caratula.IEnfoqueImagenY ?? COVER_IMAGE_FOCUS_CENTER.y,
    }),
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
