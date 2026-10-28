import type { ValuationMeta } from "@/features/valuations/services/valuation-constants";
import type { AppSection, Block, CaratulaFormData, Concept, TableContent } from "@/features/valuations/model";
import { ensureTableV2 } from "@/features/valuations/services/table";

export const EDITOR_HISTORY_LIMIT = 50;
export const TEXT_EDIT_GROUP_MS = 1200;

export type EditorSnapshot = {
  caratula: CaratulaFormData;
  meta: ValuationMeta;
  sections: AppSection[];
};

/**
 * Where a change of the document is, so undoing or redoing it brings the
 * editor there: its section, and the table cell, table, concept or block it
 * touched, the most precise one known.
 */
export type EditorFocus = {
  sectionId: string;
  blockId?: string;
  conceptId?: string;
  tableId?: string;
  rowId?: string;
  columnId?: string;
};

export type EditorHistoryOptions = {
  groupKey?: string;
  /** Skip structural normalization for leaf content patches (Concept value/title). */
  normalize?: boolean;
  /** Where the change is, when the caller knows it better than a comparison of the document would. */
  focus?: EditorFocus;
};

/** A state the history goes back (or forward) to, and where the change that left it is. */
export type EditorHistoryEntry = {
  snapshot: EditorSnapshot;
  focus?: EditorFocus;
};

export type EditorHistory = {
  future: EditorHistoryEntry[];
  lastGroupKey: string | null;
  lastPushedAt: number;
  past: EditorHistoryEntry[];
};

export function emptyEditorHistory(): EditorHistory {
  return {
    future: [],
    lastGroupKey: null,
    lastPushedAt: 0,
    past: [],
  };
}

export function editorSnapshotChanged(current: EditorSnapshot, next: EditorSnapshot) {
  return current.caratula !== next.caratula ||
    current.meta !== next.meta ||
    current.sections !== next.sections;
}

export function textEditGroupKey(scope: string, patch: object) {
  const entries = Object.entries(patch).sort(([left], [right]) => left.localeCompare(right));
  if (!entries.length || entries.some(([, value]) => typeof value !== "string")) return undefined;
  const keys = entries.map(([key]) => key);
  return `${scope}:${keys.join(",")}`;
}

/* ------------------------------------------------------------------ */
/*  Where a change is                                                  */
/* ------------------------------------------------------------------ */

const differs = (left: unknown, right: unknown) => left !== right && JSON.stringify(left) !== JSON.stringify(right);

/** The one cell a table edit changed; null when it changed more (rows, columns, several cells) or nothing. */
export function changedTableCell(before: TableContent, after: TableContent): { rowId: string; columnId: string } | null {
  if (before === after) return null;
  const left = ensureTableV2(before);
  const right = ensureTableV2(after);
  if (left.rows.length !== right.rows.length || left.columns.length !== right.columns.length) return null;
  let found: { rowId: string; columnId: string } | null = null;
  for (const [index, row] of right.rows.entries()) {
    const previous = left.rows[index];
    if (!previous || previous.id !== row.id) return null;
    if (previous.cells === row.cells) continue;
    for (const column of right.columns) {
      if (!differs(previous.cells[column.id], row.cells[column.id])) continue;
      if (found) return null;
      found = { rowId: row.id, columnId: column.id };
    }
  }
  return found;
}

function changedConcept(left: Concept[], right: Concept[]) {
  const before = new Map(left.map((concept) => [concept.id, concept]));
  return right.find((concept) => differs(before.get(concept.id), concept))?.id
    ?? left.find((concept) => !right.some((item) => item.id === concept.id))?.id;
}

function changedTable(left: TableContent[], right: TableContent[]): Pick<EditorFocus, "tableId" | "rowId" | "columnId"> | null {
  const before = new Map(left.map((table) => [table.id, table]));
  const table = right.find((item) => differs(before.get(item.id), item));
  if (!table) return null;
  const previous = before.get(table.id);
  const cell = previous ? changedTableCell(previous, table) : null;
  return { tableId: table.id, ...(cell ?? {}) };
}

function locateInBlock(left: Block, right: Block): Omit<EditorFocus, "sectionId"> {
  const containers = [
    { before: left, after: right },
    ...right.apartados.map((apartado) => ({ before: left.apartados.find((item) => item.id === apartado.id), after: apartado })),
  ];
  for (const { before, after } of containers) {
    if (!before || !differs(before, after)) continue;
    const table = changedTable(before.tables, after.tables);
    if (table) return { blockId: right.id, ...table };
    const conceptId = changedConcept(before.concepts, after.concepts);
    if (conceptId) return { blockId: right.id, conceptId };
  }
  return { blockId: right.id };
}

/**
 * Where the document differs from one state to the other, for an undo or a
 * redo that knows no better: the first section that changed and, in it, the
 * first table cell, table, concept or block. Null when only the carátula
 * form or the valuation's data changed.
 */
export function locateEditorChange(from: AppSection[], to: AppSection[]): EditorFocus | null {
  if (from === to) return null;
  const before = new Map(from.map((section) => [section.id, section]));
  for (const section of to) {
    const previous = before.get(section.id);
    if (!previous) return { sectionId: section.id };
    if (!differs(previous, section)) continue;
    const previousBlocks = new Map(previous.blocks.map((block) => [block.id, block]));
    for (const block of section.blocks) {
      const previousBlock = previousBlocks.get(block.id);
      if (!previousBlock) return { sectionId: section.id, blockId: block.id };
      if (differs(previousBlock, block)) return { sectionId: section.id, ...locateInBlock(previousBlock, block) };
    }
    return { sectionId: section.id };
  }
  // A section went away: the editor goes to its neighbor.
  const removed = from.findIndex((section) => !to.some((item) => item.id === section.id));
  const neighbor = removed >= 0 ? to[Math.min(removed, to.length - 1)] : undefined;
  return neighbor ? { sectionId: neighbor.id } : null;
}
