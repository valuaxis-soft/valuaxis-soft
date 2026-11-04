/**
 * Document templates ("plantillas") — the structure of a valuation kept to
 * start others from: its sections, Blocks, Apartados, concept titles and
 * types, tables with their headers and formulas, and, when chosen, the
 * images.
 *
 * The client's and the property's data never go into a template (2 Nov
 * 2026: "Departamentos Jalisco" carried a real client): every captured value
 * is left blank except the appraiser's own texts, which are the template's
 * wording — the whole Consideraciones section and the long texts and
 * paragraphs anywhere (declarations, observations). Formats, units, labels
 * and formulas stay.
 *
 * What the calculation writes is never kept: its Blocks come back from the
 * calculation of each valuation. Images of Datos generales are files of the
 * source valuation and stay with it.
 *
 * Pure: no side effects, no rendering.
 */

import { isGeneratedBlock } from "../calculation/market-document";
import type { Apartado, AppSection, Block, Concept } from "../model";
import { getCanonicalSectionKey } from "../sections/section-registry";
import { storedImageUrl } from "@/features/files/services/stored-image-url";
import { extractStorageKey, isRelationManagedImageSection, isS3Source } from "./image-source";
import { blockWithoutData, structureLockReason, type CopyOptions } from "./structure-transfer";

/** The shape of what a template stores; a later shape changes the number. */
export const DOCUMENT_TEMPLATE_FORMAT = 1;

export type DocumentTemplateContent = {
  format: typeof DOCUMENT_TEMPLATE_FORMAT;
  includeData: boolean;
  includeImages: boolean;
  sections: AppSection[];
};

/** `includeData` is accepted for the API's sake but no longer keeps the client's data: see `stripClientData`. */
export type TemplateOptions = Required<Pick<CopyOptions, "includeImages">> & Pick<CopyOptions, "includeData">;

/** The section whose captured texts are the template's wording: the appraiser's considerations. */
const keepsEveryText = (section: Pick<AppSection, "id">) => getCanonicalSectionKey(section.id) === "CONSIDERACIONES";

/** A text of the appraiser's own, not a datum of the client or the property. */
const isNarrativeConcept = (concept: Pick<Concept, "type">) => concept.type === "longText" || concept.type === "paragraph";

/** The values of the narrative concepts of `original`, back on the blank copy. */
function withNarrativeTexts<T extends Pick<Block | Apartado, "concepts">>(copy: T, original: Pick<Block | Apartado, "concepts">): T {
  const texts = new Map(original.concepts.filter(isNarrativeConcept).map((concept) => [concept.id, concept.value]));
  if (!texts.size) return copy;
  return { ...copy, concepts: copy.concepts.map((concept) => (texts.has(concept.id) ? { ...concept, value: texts.get(concept.id) ?? "" } : concept)) };
}

/**
 * The block without the client's and the property's data: its concepts blank
 * (the appraiser's texts kept), its tables with their headers and formulas,
 * its images only when asked. Ids stay: the template starts a document of
 * its own from them.
 */
export function stripClientData(section: Pick<AppSection, "id">, block: Block, options: Pick<CopyOptions, "includeImages">): Block {
  const includeImages = Boolean(options.includeImages) && !isRelationManagedImageSection(section.id);
  if (keepsEveryText(section)) return blockWithoutData(block, { includeData: true, includeImages });
  const blank = blockWithoutData(block, { includeData: false, includeImages });
  const originals = new Map(block.apartados.map((apartado) => [apartado.id, apartado]));
  return {
    ...withNarrativeTexts(blank, block),
    apartados: blank.apartados.map((apartado) => {
      const original = originals.get(apartado.id);
      return original ? withNarrativeTexts(apartado, original) : apartado;
    }),
  };
}

/** The sections without the client's data, as a template keeps them and as a new valuation reads a template. */
export function stripClientDataFromSections(sections: AppSection[], options: Pick<CopyOptions, "includeImages">): AppSection[] {
  return sections.map((section) => ({
    ...section,
    blocks: section.blocks.filter((block) => !isGeneratedBlock(block)).map((block) => stripClientData(section, block, options)),
  }));
}

/**
 * Whether the sections still carry data of a client or a property: a value
 * in a concept that is not the appraiser's text, outside Consideraciones.
 * Templates saved before 2 Nov 2026 with "Incluir datos" do.
 */
export function templateContainsData(sections: ReadonlyArray<Pick<AppSection, "id" | "blocks">>): boolean {
  const holdsData = (container: Pick<Block | Apartado, "concepts">) =>
    container.concepts.some((concept) => !isNarrativeConcept(concept) && concept.value.trim() !== "");
  return sections.some((section) => !keepsEveryText(section)
    && section.blocks.some((block) => !isGeneratedBlock(block) && (holdsData(block) || block.apartados.some(holdsData))));
}

function templateBlock(section: AppSection, block: Block, options: TemplateOptions): Block {
  const kept = stripClientData(section, block, options);
  // The template keeps the address of a stored image that does not expire, not a signed one that does.
  const durable = <T extends { images: Block["images"] }>(container: T): T => ({
    ...container,
    images: container.images.map((image) => (isS3Source(image.src) ? { ...image, src: storedImageUrl(extractStorageKey(image.src)) } : image)),
  });
  return { ...durable(kept), apartados: kept.apartados.map(durable) };
}

/** The template of a valuation's document, without the client's data whatever the options say. */
export function buildDocumentTemplate(sections: AppSection[], options: TemplateOptions): DocumentTemplateContent {
  return {
    format: DOCUMENT_TEMPLATE_FORMAT,
    includeData: false,
    includeImages: options.includeImages,
    sections: sections.map((section) => ({
      ...section,
      blocks: section.blocks
        .filter((block) => !isGeneratedBlock(block))
        .map((block) => templateBlock(section, block, options)),
    })),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSection = (value: unknown): value is AppSection =>
  isRecord(value) && typeof value.id === "string" && typeof value.title === "string" && Array.isArray(value.blocks)
  && value.blocks.every((block) => isRecord(block) && typeof block.id === "string" && Array.isArray(block.concepts)
    && Array.isArray(block.apartados) && Array.isArray(block.tables) && Array.isArray(block.images));

/** The template stored in the database, or null when it is not one this code reads. */
export function readDocumentTemplate(value: unknown): DocumentTemplateContent | null {
  if (!isRecord(value) || value.format !== DOCUMENT_TEMPLATE_FORMAT || !Array.isArray(value.sections)) return null;
  if (!value.sections.every(isSection)) return null;
  return {
    format: DOCUMENT_TEMPLATE_FORMAT,
    includeData: value.includeData === true,
    includeImages: value.includeImages === true,
    sections: value.sections as AppSection[],
  };
}

export type ImportableBlock = { sectionId: string; sectionTitle: string; block: Block };

/**
 * The Blocks of a document that can be brought into another one: the
 * calculation's Blocks, the carátula's and the fixed ones stay where they are.
 */
export function importableBlocks(sections: AppSection[]): ImportableBlock[] {
  return sections.flatMap((section) => section.blocks
    .filter((block) => !isGeneratedBlock(block) && structureLockReason(section, block.id) === null)
    .map((block) => ({ sectionId: section.id, sectionTitle: section.title || section.label || section.id, block })));
}
