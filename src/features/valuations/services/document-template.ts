/**
 * Document templates ("plantillas") — the structure of a valuation kept to
 * start others from: its sections, Blocks, Apartados, concept titles and
 * types, tables with their headers and formulas, and, when chosen, the
 * captured values and the images.
 *
 * What the calculation writes is never kept: its Blocks come back from the
 * calculation of each valuation. Images of Datos generales are files of the
 * source valuation and stay with it.
 *
 * Pure: no side effects, no rendering.
 */

import { isGeneratedBlock } from "../calculation/market-document";
import type { AppSection, Block } from "../model";
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

export type TemplateOptions = Required<Pick<CopyOptions, "includeData" | "includeImages">>;

function templateBlock(section: AppSection, block: Block, options: TemplateOptions): Block {
  const includeImages = options.includeImages && !isRelationManagedImageSection(section.id);
  const kept = blockWithoutData(block, { includeData: options.includeData, includeImages });
  // The template keeps the address of a stored image that does not expire, not a signed one that does.
  const durable = <T extends { images: Block["images"] }>(container: T): T => ({
    ...container,
    images: container.images.map((image) => (isS3Source(image.src) ? { ...image, src: storedImageUrl(extractStorageKey(image.src)) } : image)),
  });
  return { ...durable(kept), apartados: kept.apartados.map(durable) };
}

/** The template of a valuation's document. */
export function buildDocumentTemplate(sections: AppSection[], options: TemplateOptions): DocumentTemplateContent {
  return {
    format: DOCUMENT_TEMPLATE_FORMAT,
    includeData: options.includeData,
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
