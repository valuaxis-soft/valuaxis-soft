import type { AppSection, Block, Concept } from "@/features/valuations/model";
import { COMPANY_HEADER_BLOCK_ID } from "@/features/valuations/services/caratula-company-header";

export type CaratulaBlockKind = "intermediate" | "assumptions" | "conclusion";
export const UNTITLED_CARATULA_CONCEPT = "Campo sin título";

export function getCaratulaBlockKind(block: Pick<Block, "id" | "title">): CaratulaBlockKind {
  const identity = normalize(`${block.id} ${block.title}`);
  if (identity.includes("SUPUESTOS")) return "assumptions";
  if (identity.includes("CONCLUSION")) return "conclusion";
  return "intermediate";
}

const LEGACY_RANK: Record<CaratulaBlockKind, number> = { intermediate: 1, assumptions: 2, conclusion: 3 };

/**
 * The carátula prints its blocks in the order of the editor, like any section
 * (video 5.5). Before, it printed its own blocks first, then the
 * assumptions and the conclusion, wherever they were in the list: a carátula
 * saved then is put in that order once, so it prints as it did, and marked so
 * the order the appraiser gives it from now on is kept.
 */
export function withCaratulaFreeBlockOrder<T extends Pick<AppSection, "id" | "freeBlockOrder" | "blocks">>(section: T): T {
  if (section.id !== "caratula" || section.freeBlockOrder) return section;
  const rank = (block: Block) => (block.id === COMPANY_HEADER_BLOCK_ID ? 0 : LEGACY_RANK[getCaratulaBlockKind(block)]);
  const blocks = section.blocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => rank(a.block) - rank(b.block) || a.index - b.index)
    .map(({ block }) => block);
  return { ...section, blocks, freeBlockOrder: true };
}

/** A new block of the carátula goes before its assumptions and its conclusion, where its data print; at the end without them. */
export function withCaratulaBlockAdded(blocks: Block[], block: Block): Block[] {
  const index = blocks.findIndex((item) => item.id !== COMPANY_HEADER_BLOCK_ID && getCaratulaBlockKind(item) !== "intermediate");
  return index < 0 ? [...blocks, block] : [...blocks.slice(0, index), block, ...blocks.slice(index)];
}

/** The first conclusion block of the carátula: the one that prints the commercial value and its words. */
export function primaryCaratulaConclusionId(blocks: ReadonlyArray<Pick<Block, "id" | "title" | "enabled">>): string | null {
  return blocks.find((block) => block.id !== COMPANY_HEADER_BLOCK_ID && getCaratulaBlockKind(block) === "conclusion")?.id ?? null;
}

export function hasUntitledConcepts(blocks: Pick<Block, "concepts" | "apartados">[]) {
  return blocks.some(
    (block) =>
      block.concepts.some((concept) => !concept.label.trim()) ||
      block.apartados.some((subBlock) => subBlock.concepts.some((concept) => !concept.label.trim())),
  );
}

export function isConclusionNarrativeConcept(concept: Pick<Concept, "label">) {
  const label = normalize(concept.label);
  return (
    !label.includes("VALOR COMERCIAL") &&
    !label.includes("CIFRA EN LETRAS") &&
    !label.includes("PERITO VALUADOR")
  );
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

/**
 * Whether a block of the carátula prints in the dictamen and with its title.
 * A block with nothing in it (the section's own empty block, «CARATULA», that
 * a valuation started without a template keeps) prints nothing: not even its
 * title, which used to print as a hollow frame and, filled, stood out over
 * «CONCLUSIÓN» (24 Nov 2026). A title that only repeats the section's name
 * prints no bar; the block's content still prints.
 */
export function caratulaBlockPrinting(
  block: Pick<Block, "title" | "concepts" | "apartados" | "tables" | "images">,
  section: Pick<AppSection, "title" | "label">,
): { prints: boolean; title: boolean } {
  const empty = !block.concepts.length && !block.apartados.length && !block.tables.length && !block.images.length;
  const title = normalize(block.title.trim());
  const sectionNames = [section.title, section.label, "CARATULA"].filter(Boolean).map((name) => normalize(String(name).trim()));
  return { prints: !empty, title: !sectionNames.includes(title) };
}
