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
import { imageMetadataFromContent } from "@/features/valuations/metadata";
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
  valuador: "",
  registroValuador: "",
  valorTotal: "",
  valorConLetra: "",
  fechaAvaluo: "",
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

export function mergeDatosImages(
  sections: AppSection[],
  storedImages: DatosImageResponse[],
) {
  return sections.map((section) => {
    if (section.id !== "datos" && section.id !== "datosGenerales") return section;
    return {
      ...section,
      blocks: section.blocks.map((block) => {
        const blockImages = storedImages.filter(
          (image) => image.blockId === block.id && !image.subBlockId,
        );
        return {
          ...block,
          images: mergeStoredImages(block.images, blockImages),
          apartados: block.apartados.map((subBlock) => ({
            ...subBlock,
            images: mergeStoredImages(
              subBlock.images,
              storedImages.filter(
                (image) => image.blockId === block.id && image.subBlockId === subBlock.id,
              ),
            ),
          })),
        };
      }),
    };
  });
}

function mergeStoredImages(current: ImageContent[], stored: DatosImageResponse[]) {
  const storedById = new Map(stored.map((image) => [image.id, image]));
  const merged = current.map((image) => {
    const storedImage = storedById.get(image.id);
    if (!storedImage) return image;
    storedById.delete(image.id);
    return { ...image, src: storedImage.url ?? "" };
  });
  return [
    ...merged,
    ...[...storedById.values()].map((image) => ({
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
    valuador: initialValuation?.caratula?.valuador || initialValuation?.user.name || "",
    registroValuador: initialValuation?.caratula?.registroValuador || "",
    valorTotal: initialValuation?.caratula?.valorTotal || "",
    valorConLetra: initialValuation?.caratula?.valorConLetra || "",
    fechaAvaluo: initialValuation?.caratula?.fechaAvaluo || "",
    fechaVigencia: initialValuation?.caratula?.fechaVigencia || "",
  };
}

/** Meta the editor starts from: the stored valuation, or the defaults for a draft. */
export function initialMetaFor(initialValuation: ValuationDetail | null | undefined): ValuationMeta {
  return initialValuation ? valuationMetaFromDb(initialValuation) : initialMeta;
}

/** Sections the editor starts from: the stored valuation, or the code templates for a draft. */
export function initialSectionsFor(initialValuation: ValuationDetail | null | undefined): AppSection[] {
  return ensureCompanyHeaderFields(
    ensureTerrenoSections(
      initialValuation
        ? resequenceSections(normalizeInitialSections(initialValuation))
        : resequenceSections(createInitialSections()),
    ),
  );
}
