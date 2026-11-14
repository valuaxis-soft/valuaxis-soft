/**
 * "Importar" from a template or another valuation of the firm, with its
 * structure (Álvaro, video 5.6, 22:34–29:29): any number of Blocks, of
 * subbloques on their own, or whole sections, chosen in a tree
 * (Sección › Bloque › Subbloque) with check boxes.
 *
 * - Blocks and subbloques go at the end of the section the import is opened
 *   from; a subbloque comes inside a copy of its Block (its title, without
 *   what the Block was not chosen for), so it keeps its structure.
 * - A whole section goes to its section of this valuation (the same section,
 *   or one with the same title): an empty one is replaced, one with content
 *   asks first whether to add at its end or to replace its content. A section
 *   this valuation does not have comes as a new one.
 * - "Incluir datos y autovincular": every imported concept called like one
 *   this valuation already has ("Solicitante") is linked to it and shows its
 *   value; the rest bring their own.
 *
 * Everything goes through the copies of `structure-transfer.ts` (new ids,
 * formulas pointing at the copies) in one change, a single «Deshacer».
 *
 * Pure: no React, no side effects.
 */

import { isGeneratedBlock } from "../calculation/market-document";
import type { Apartado, AppSection, Block } from "../model";
import { autoLinkConcepts } from "./concept-link-suggestions";
import { importableBlocks } from "./document-template";
import { insertSectionByRole } from "./document-structure";
import { CUSTOM_SECTION_ID_PREFIX } from "../sections/section-registry";
import { pasteBlock, structureLockReason, type CopyOptions, type TransferResult } from "./structure-transfer";

/* ================================================================== */
/*  THE TREE AND WHAT IS CHOSEN IN IT                                  */
/* ================================================================== */

export type ImportTreeBlock = {
  key: string;
  block: Block;
  /** The Block has concepts, tables or images of its own, outside its subbloques. */
  hasOwnContent: boolean;
};

export type ImportTreeSection = { section: AppSection; title: string; blocks: ImportTreeBlock[] };

/** The sections of the source with the Blocks that can be imported, in order. */
export function importTree(sections: AppSection[]): ImportTreeSection[] {
  const importable = importableBlocks(sections);
  return sections.flatMap((section) => {
    const blocks = importable
      .filter((item) => item.sectionId === section.id)
      .map((item) => ({
        key: blockKey(section.id, item.block.id),
        block: item.block,
        hasOwnContent: item.block.concepts.length > 0 || item.block.tables.length > 0 || item.block.images.length > 0,
      }));
    return blocks.length ? [{ section, title: section.title || section.label || section.id, blocks }] : [];
  });
}

const blockKey = (sectionId: string, blockId: string) => `${sectionId}/${blockId}`;
/** The Block's own concepts, tables and images, chosen apart from its subbloques. */
export const ownContentKey = (block: ImportTreeBlock) => `${block.key}#own`;
export const apartadoKey = (block: ImportTreeBlock, apartado: Pick<Apartado, "id">) => `${block.key}/${apartado.id}`;

/** The boxes under a Block: its own content (when it has any, or nothing else) and each subbloque. */
export function blockLeaves(block: ImportTreeBlock): string[] {
  const own = block.hasOwnContent || block.block.apartados.length === 0 ? [ownContentKey(block)] : [];
  return [...own, ...block.block.apartados.map((apartado) => apartadoKey(block, apartado))];
}

export const sectionLeaves = (section: ImportTreeSection) => section.blocks.flatMap(blockLeaves);

export type ImportSelection = {
  leaves: ReadonlySet<string>;
  /** Sections chosen by their own box: they come whole, to their section. */
  wholeSections: ReadonlySet<string>;
};

export const EMPTY_SELECTION: ImportSelection = { leaves: new Set(), wholeSections: new Set() };

/** A box over several: checked, unchecked or partly ("indeterminate"). */
export function checkState(selection: ImportSelection, leaves: string[]): boolean | "indeterminate" {
  const chosen = leaves.filter((leaf) => selection.leaves.has(leaf)).length;
  if (chosen === 0) return false;
  return chosen === leaves.length ? true : "indeterminate";
}

/**
 * Checks or unchecks the boxes `leaves`. A section's own box (`section`)
 * chooses it whole; unchecking anything inside a whole section makes it a
 * choice of Blocks again.
 */
export function toggleLeaves(
  selection: ImportSelection,
  tree: ImportTreeSection[],
  leaves: string[],
  checked: boolean,
  section?: string,
): ImportSelection {
  const next = new Set(selection.leaves);
  for (const leaf of leaves) {
    if (checked) next.add(leaf);
    else next.delete(leaf);
  }
  const wholeSections = new Set(selection.wholeSections);
  if (section) {
    if (checked) wholeSections.add(section);
    else wholeSections.delete(section);
  }
  for (const item of tree) {
    if (wholeSections.has(item.section.id) && !sectionLeaves(item).every((leaf) => next.has(leaf))) wholeSections.delete(item.section.id);
  }
  return { leaves: next, wholeSections };
}

/**
 * The Block with only what was chosen of it: as it is when all its boxes are
 * checked; otherwise its title and settings with the chosen subbloques and,
 * when chosen, its own content. Null when nothing of it was chosen.
 */
function chosenPart(block: ImportTreeBlock, leaves: ReadonlySet<string>): Block | null {
  const keys = blockLeaves(block);
  if (!keys.some((key) => leaves.has(key))) return null;
  if (keys.every((key) => leaves.has(key))) return block.block;
  const keepOwn = leaves.has(ownContentKey(block));
  const apartados = block.block.apartados.filter((apartado) => leaves.has(apartadoKey(block, apartado)));
  const kept = new Set(apartados.map((apartado) => apartado.id));
  const flow = block.block.blockFlow;
  return {
    ...block.block,
    ...(keepOwn ? {} : { concepts: [], tables: [], images: [], contentLayout: undefined }),
    apartados,
    // The rows of the flow that held what stays: the copy rebuilds the rest.
    ...(flow
      ? {
          blockFlow: {
            ...flow,
            rows: flow.rows
              .map((row) => ({ ...row, items: row.items.filter((item) => (item.type === "apartado" ? kept.has(item.apartadoId) : keepOwn)) }))
              .filter((row) => row.items.length > 0),
          },
        }
      : {}),
  };
}

/* ================================================================== */
/*  WHERE IT GOES                                                      */
/* ================================================================== */

const normalizedTitle = (title: string) =>
  title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** The section of this valuation a whole section goes to: the same one, or one titled the same; never the carátula. */
export function destinationSectionFor(destination: AppSection[], source: Pick<AppSection, "id" | "title" | "label">): AppSection | null {
  const candidates = destination.filter((section) => section.id !== "caratula" && !section.removed);
  const sameId = candidates.find((section) => section.id === source.id);
  if (sameId) return sameId;
  const title = normalizedTitle(source.title || source.label);
  return title ? candidates.find((section) => normalizedTitle(section.title || section.label) === title) ?? null : null;
}

/** A Block an import replaces: the appraiser's own, not the calculation's nor one with a fixed place. */
const replaceable = (section: AppSection, block: Block) => !isGeneratedBlock(block) && structureLockReason(section, block.id) === null;

const containerHasContent = (container: Block | Apartado) =>
  container.concepts.length > 0 || container.tables.length > 0 || container.images.length > 0;

/** Nothing of the appraiser's in it: its Blocks hold no concepts, tables, images or subbloques. */
export function isEmptySection(section: AppSection): boolean {
  return section.blocks.every((block) => !replaceable(section, block) || (!containerHasContent(block) && block.apartados.length === 0));
}

export type ImportPlanSection = {
  source: AppSection;
  title: string;
  blocks: Block[];
  /** Null: the valuation has no such section, a new one is added. */
  destination: AppSection | null;
  /** The destination has content of its own: adding or replacing is asked. */
  destinationHasContent: boolean;
};

export type ImportPlan = {
  /** Blocks (or the chosen part of them) that go at the end of the section the import was opened from. */
  blocks: Block[];
  sections: ImportPlanSection[];
};

export function planImport(tree: ImportTreeSection[], selection: ImportSelection, destination: AppSection[]): ImportPlan {
  const plan: ImportPlan = { blocks: [], sections: [] };
  for (const item of tree) {
    const parts = item.blocks.map((block) => chosenPart(block, selection.leaves)).filter((block): block is Block => block !== null);
    if (!parts.length) continue;
    if (!selection.wholeSections.has(item.section.id)) {
      plan.blocks.push(...parts);
      continue;
    }
    const target = destinationSectionFor(destination, item.section);
    plan.sections.push({
      source: item.section,
      title: item.title,
      blocks: parts,
      destination: target,
      destinationHasContent: target ? !isEmptySection(target) : false,
    });
  }
  return plan;
}

/** How many Blocks the plan brings, those of whole sections included. */
export const plannedBlockCount = (plan: ImportPlan) => plan.blocks.length + plan.sections.reduce((sum, item) => sum + item.blocks.length, 0);

/* ================================================================== */
/*  IMPORTING                                                          */
/* ================================================================== */

export type ImportOptions = CopyOptions & {
  /** Link the imported concepts called like one of this valuation to it ("Incluir datos y autovincular"). */
  autoLink?: boolean;
  /** A whole section whose destination has content: its Blocks go at its end, or replace them. */
  conflict?: "append" | "replace";
};

export type ImportSummary = {
  blocks: number;
  /** Whole sections imported: replacing an empty one, added to or replacing one with content, or new. */
  sections: number;
  newSections: number;
  /** Concepts linked to a datum the valuation already had. */
  linked: number;
  /** The section to show afterwards: the first new or replaced one, when there is no other. */
  focusSectionId?: string;
};

export type ImportResult = TransferResult & { summary?: ImportSummary };

function allConceptIds(sections: AppSection[]): Set<string> {
  const ids = new Set<string>();
  for (const section of sections) {
    for (const block of section.blocks) {
      for (const concept of block.concepts) ids.add(concept.id);
      for (const apartado of block.apartados) for (const concept of apartado.concepts) ids.add(concept.id);
    }
  }
  return ids;
}

/** A section of this valuation for a source section it does not have: the appraiser's own, with the source's title and role. */
function newSectionFrom(source: AppSection): AppSection {
  return {
    id: `${CUSTOM_SECTION_ID_PREFIX}${crypto.randomUUID()}`,
    label: "",
    title: source.title || source.label || "Sección importada",
    sourceFile: "",
    enabled: true,
    required: false,
    custom: true,
    titleEdited: true,
    ...(source.documentRole ? { documentRole: source.documentRole } : {}),
    ...(source.annexTitle ? { annexTitle: source.annexTitle } : {}),
    ...(source.pageBreak ? { pageBreak: source.pageBreak } : {}),
    blocks: [],
  };
}

/**
 * Brings the plan into the valuation in one change: the Blocks at the end of
 * `currentSectionId`, the whole sections to theirs (see the module). With
 * `autoLink`, the imported concepts called like one of the valuation take its
 * value and stay linked to it.
 */
export function importStructure(sections: AppSection[], currentSectionId: string, plan: ImportPlan, options: ImportOptions = {}): ImportResult {
  if (plannedBlockCount(plan) === 0) return { changed: false, sections, reason: "Elige al menos un bloque, subbloque o sección." };
  const copyOptions: CopyOptions = { includeData: options.includeData, includeImages: options.includeImages };
  const before = allConceptIds(sections);
  let next = sections;
  let focusSectionId: string | undefined;
  let newSections = 0;

  const paste = (sectionId: string, blocks: Block[]): string | null => {
    for (const block of blocks) {
      const result = pasteBlock(next, sectionId, block, copyOptions);
      if (!result.changed) return result.reason ?? "No se pudo importar.";
      next = result.sections;
    }
    return null;
  };

  const blocksFailed = paste(currentSectionId, plan.blocks);
  if (blocksFailed) return { changed: false, sections, reason: blocksFailed };

  for (const item of plan.sections) {
    let target = item.destination ? next.find((section) => section.id === item.destination?.id) ?? null : null;
    if (!target) {
      const created = newSectionFrom(item.source);
      next = insertSectionByRole(next, created, item.source.documentRole === "annex" ? "annex" : "chapter");
      target = created;
      newSections += 1;
    } else if (!item.destinationHasContent || options.conflict === "replace") {
      // An empty section is replaced; one with content only when the appraiser chose to.
      const replaced = target;
      next = next.map((section) => (section.id === replaced.id ? { ...section, blocks: section.blocks.filter((block) => !replaceable(section, block)) } : section));
    }
    focusSectionId ??= target.id === currentSectionId ? undefined : target.id;
    const failed = paste(target.id, item.blocks);
    if (failed) return { changed: false, sections, reason: failed };
  }

  let linked = 0;
  if (options.autoLink) {
    const imported = new Set([...allConceptIds(next)].filter((id) => !before.has(id)));
    const result = autoLinkConcepts(next, imported);
    next = result.sections;
    linked = result.linked;
  }

  return {
    changed: true,
    sections: next,
    summary: {
      blocks: plannedBlockCount(plan),
      sections: plan.sections.length,
      newSections,
      linked,
      ...(focusSectionId ? { focusSectionId } : {}),
    },
  };
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What the notice says after importing: «Se importaron 2 bloques; 3 conceptos quedaron vinculados a datos de tu avalúo». */
export function importSummaryText(summary: ImportSummary, autoLink: boolean): string {
  const sections = summary.sections
    ? ` (${count(summary.sections, "sección completa", "secciones completas")}${summary.newSections ? `, ${count(summary.newSections, "nueva", "nuevas")}` : ""})`
    : "";
  const imported = `${summary.blocks === 1 ? "Se importó" : "Se importaron"} ${count(summary.blocks, "bloque", "bloques")}${sections}`;
  if (!autoLink) return `${imported}.`;
  if (!summary.linked) return `${imported}; ningún concepto coincidió con un dato de tu avalúo.`;
  return `${imported}; ${count(summary.linked, "concepto quedó vinculado", "conceptos quedaron vinculados")} a datos de tu avalúo.`;
}
