import {
  initialMeta,
  type ValuationMeta,
} from "@/features/valuations/services/valuation-constants";
import type {
  DatosImageResponse,
  DocumentHeaderImageResponse,
} from "@/lib/api-client";
import { valuationMetaFromDb } from "@/features/valuations/mappers/transform-valuation";
import type {
  AppSection,
  CaratulaFormData,
  ImageContent,
  TableContent,
} from "@/features/valuations/model";
import { createInitialSections } from "@/features/valuations/sections";
import { ensureTerrenoSections } from "@/features/valuations/sections/terreno";
import {
  COMPANY_HEADER_BLOCK_ID,
  ensureCompanyHeaderFields,
  readCompanyHeaderFields,
} from "@/features/valuations/services/caratula-company-header";
import { isBoundaryDistanceValueFormat } from "@/features/valuations/services/concept-value-format";
import { COVER_IMAGE_FOCUS_CENTER } from "@/features/valuations/services/cover-image-focus";
import { imageMetadataFromContent } from "@/features/valuations/metadata";
import { applyValuationFormulas } from "@/features/valuations/services/valuation-formulas";
import { initializeCaratulaState } from "@/features/valuations/components/workspace/valuation-caratula-state";
import type { ValuationDetail } from "@/features/valuations/repositories/valuation.repository";
import { resequenceSections } from "./section-numbering";

const emptyCaratula: CaratulaFormData = {
  tituloInmueble: "",
  numeroAvaluo: "",
  folio: "",
  direccionEmpresa: "",
  telefonoEmpresa: "",
  correoEmpresa: "",
  solicitante: "",
  propietario: "",
  objeto: "",
  proposito: "",
  firmas: [],
  valorTotal: "",
  valorConLetra: "",
  fechaAvaluo: "",
  mesesVigencia: null,
  fechaVigencia: "",
};

export function imageContentFromDocumentHeaderImage(image: DocumentHeaderImageResponse): ImageContent {
  return {
    id: image.id,
    title: image.filename,
    src: image.url ?? "",
    enabled: true,
  };
}

export function mergeDocumentHeaderImage(
  sections: AppSection[],
  image: DocumentHeaderImageResponse | null,
) {
  return ensureCompanyHeaderFields(sections).map((section) => {
    if (section.id !== "caratula") return section;
    return {
      ...section,
      blocks: section.blocks.map((block) =>
        block.id === COMPANY_HEADER_BLOCK_ID
          ? { ...block, images: image ? [imageContentFromDocumentHeaderImage(image)] : [] }
          : block,
      ),
    };
  });
}

/**
 * Give the Datos generales images their fresh URLs from the file service.
 *
 * An image is matched by ID wherever it is in the section: it may have been
 * moved since it was uploaded, and the file service only remembers the Block
 * (and Apartado) it was uploaded to. A stored image the section does not hold
 * anywhere (uploaded, not yet saved) is added to that Block or Apartado.
 */
export function mergeDatosImages(
  sections: AppSection[],
  storedImages: DatosImageResponse[],
) {
  return sections.map((section) => {
    if (section.id !== "datos" && section.id !== "datosGenerales") return section;

    const placedIds = new Set(
      section.blocks.flatMap((block) => [
        ...block.images.map((image) => image.id),
        ...block.apartados.flatMap((subBlock) => subBlock.images.map((image) => image.id)),
      ]),
    );
    const storedById = new Map(storedImages.map((image) => [image.id, image]));
    const unplaced = storedImages.filter((image) => !placedIds.has(image.id));

    return {
      ...section,
      blocks: section.blocks.map((block) => ({
        ...block,
        images: mergeStoredImages(
          block.images,
          storedById,
          unplaced.filter((image) => image.blockId === block.id && !image.subBlockId),
        ),
        apartados: block.apartados.map((subBlock) => ({
          ...subBlock,
          images: mergeStoredImages(
            subBlock.images,
            storedById,
            unplaced.filter((image) => image.blockId === block.id && image.subBlockId === subBlock.id),
          ),
        })),
      })),
    };
  });
}

function mergeStoredImages(
  current: ImageContent[],
  storedById: Map<string, DatosImageResponse>,
  added: DatosImageResponse[],
): ImageContent[] {
  return [
    ...current.map((image) => {
      const storedImage = storedById.get(image.id);
      return storedImage ? { ...image, src: storedImage.url ?? "" } : image;
    }),
    ...added.map((image) => ({
      id: image.id,
      title: image.filename,
      src: image.url ?? "",
      enabled: true,
    })),
  ];
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonRows(value: string): string[][] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.map((row) => (Array.isArray(row) ? row.map(String) : []))
      : [];
  } catch {
    return [];
  }
}

function parseJsonBoundaryDistanceFormats(value?: string): NonNullable<TableContent["boundaryDistanceFormats"]> {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((format) => {
      if (!format || typeof format !== "object" || Array.isArray(format)) return {};
      const value = format as { valueFormat?: unknown; customUnit?: unknown };
      return {
        ...(isBoundaryDistanceValueFormat(value.valueFormat) ? { valueFormat: value.valueFormat } : {}),
        ...(typeof value.customUnit === "string" ? { customUnit: value.customUnit } : {}),
      };
    });
  } catch {
    return [];
  }
}

type StoredTableDto = ValuationDetail["sections"][number]["blocks"][number]["tables"][number];

/** Stored tables load as the lossless TableV2; code templates load from the legacy string grid. */
function hydrateTable(table: StoredTableDto, enabled: boolean): TableContent {
  const boundaryDistanceFormats = parseJsonBoundaryDistanceFormats(table.boundaryDistanceFormats);
  const formats = boundaryDistanceFormats.length ? { boundaryDistanceFormats } : {};
  if (table.table) {
    return { ...table.table, ...formats, enabled } as unknown as TableContent;
  }
  return {
    id: table.id,
    title: table.title,
    columns: parseJsonArray(table.columns),
    columnKeys: parseJsonArray(table.columnKeys ?? "[]"),
    rows: parseJsonRows(table.rows),
    ...formats,
    enabled,
  };
}

function normalizeInitialSections(initialValuation: ValuationDetail): AppSection[] {
  return initialValuation.sections.map((section) => ({
    id: section.id,
    label: section.label,
    title: section.title,
    sourceFile: `${section.title}.pdf`,
    enabled: section.enabled ?? true,
    required: section.required,
    startOnNewPage: section.startOnNewPage ?? false,
    flowSpacingBeforePx: section.flowSpacingBeforePx,
      blocks: section.blocks.map((block) => ({
      id: block.id,
      title: block.title,
      sectionLabel: block.label,
      enabled: block.enabled,
      required: block.required,
      startOnNewPage: block.startOnNewPage ?? false,
      contentLayout: block.contentLayout,
      blockFlow: block.blockFlow,
      conceptPresentation: block.conceptPresentation,
      concepts: block.concepts,
      flowSpacingBeforePx: block.flowSpacingBeforePx,
      apartados: block.subBlocks.map((subBlock) => ({
        id: subBlock.id,
        title: subBlock.title,
        enabled: true,
        startOnNewPage: subBlock.startOnNewPage ?? false,
        contentLayout: subBlock.contentLayout,
        conceptPresentation: subBlock.conceptPresentation,
        concepts: subBlock.concepts,
        flowSpacingBeforePx: subBlock.flowSpacingBeforePx,
        tables: subBlock.tables.map((table) => hydrateTable(table, true)),
        images: subBlock.images.map((image) => ({
          id: image.id,
          title: image.title,
          src: image.url,
          ...imageMetadataFromContent({ ...image, enabled: true }),
        })),
      })),
      tables: block.tables.map((table) => hydrateTable(table, table.enabled)),
      images: block.images.map((image) => ({
        id: image.id,
        title: image.title,
        src: image.url,
        ...imageMetadataFromContent(image),
      })),
    })),
  }));
}

export function caratulaFromValuation(
  initialValuation: ValuationDetail | null | undefined,
  meta: ValuationMeta,
  sections: AppSection[],
): CaratulaFormData {
  return {
    ...emptyCaratula,
    ...readCompanyHeaderFields(sections),
    numeroAvaluo: initialValuation?.caratula?.numeroAvaluo || meta.folio,
    folio: initialValuation?.caratula?.folio || meta.folio,
    solicitante: initialValuation?.caratula?.solicitante || meta.client,
    propietario: initialValuation?.caratula?.propietario || meta.client,
    ...initializeCaratulaState(initialValuation?.caratula),
    proposito: initialValuation?.caratula?.proposito || meta.valuationKind,
    firmas: initialValuation?.caratula?.firmas ?? [],
    valorTotal: initialValuation?.caratula?.valorTotal || "",
    valorConLetra: initialValuation?.caratula?.valorConLetra || "",
    fechaAvaluo: initialValuation?.caratula?.fechaAvaluo || "",
    mesesVigencia: initialValuation?.caratula?.mesesVigencia ?? null,
    fechaVigencia: initialValuation?.caratula?.fechaVigencia || "",
    enfoqueImagenPrincipal: initialValuation?.caratula?.enfoqueImagenPrincipal ?? COVER_IMAGE_FOCUS_CENTER,
  };
}

/** Meta the editor starts from: the stored valuation, or the defaults for a draft. */
export function initialMetaFor(initialValuation: ValuationDetail | null | undefined): ValuationMeta {
  return initialValuation ? valuationMetaFromDb(initialValuation) : initialMeta;
}

/**
 * Sections the editor and the dictamen start from: the stored valuation, or the
 * code templates for a draft, with their formulas computed.
 */
export function initialSectionsFor(initialValuation: ValuationDetail | null | undefined): AppSection[] {
  return applyValuationFormulas(
    ensureCompanyHeaderFields(
      ensureTerrenoSections(
        initialValuation
          ? resequenceSections(normalizeInitialSections(initialValuation))
          : resequenceSections(createInitialSections()),
      ),
    ),
  );
}
