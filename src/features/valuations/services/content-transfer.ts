/**
 * Content Transfer Engine — pure cross-container content movement.
 *
 * Moves a single Concept/Image/Table between Block and Apartado containers
 * while preserving the exact same business object and ID.
 *
 * All operations are atomic: one call returns the complete updated parent
 * Block state. No partial mutations.
 *
 * This module is pure — no side effects, no persistence, no rendering.
 */

import type {
  Block,
  BlockFlowV2,
  ContentLayoutColumnV2,
  ContentLayoutRowV2,
  ContentLayout,
  Apartado,
} from "../model";
import {
  insertContentRowIntoBlockFlowV2,
  removeContentRowsFromBlockFlowV2,
  resolveBlockFlowV2,
} from "./block-flow";
import { CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW } from "./content-layout";
import { resolveContentLayout } from "./content-layout";

/* ================================================================== */
/*  TYPES                                                              */
/* ================================================================== */

export type ContentContainerRef =
  | { kind: "block"; blockId: string }
  | { kind: "apartado"; blockId: string; apartadoId: string };

export type TransferableContentType = "concept" | "image" | "table";

export type ContentTransferDescriptor = {
  itemType: TransferableContentType;
  itemId: string;
  source: ContentContainerRef;
  destination: ContentContainerRef;
  destinationPlacement:
    | { type: "new-row" }
    | { type: "new-row-after"; anchorRowId: string }
    | { type: "new-row-before"; anchorRowId: string }
    | { type: "before-column"; anchorColumnId: string }
    | { type: "after-column"; anchorColumnId: string };
  blockFlowPlacement?: {
    targetStructuralRowId: string;
    placement: "before" | "after";
  };
};

export type ContentTransferResult = {
  changed: boolean;
  block: Block;
  reason?: string;
};

/* ================================================================== */
/*  INTERNAL HELPERS — layout column operations                        */
/* ================================================================== */

/**
 * Find the column containing a specific item ref in a ContentLayout.
 */
function findColumnByItemRef(
  rows: ContentLayoutRowV2[],
  itemType: TransferableContentType,
  itemId: string,
): { rowIndex: number; colIndex: number; column: ContentLayoutColumnV2 } | null {
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    for (let ci = 0; ci < row.columns.length; ci++) {
      const col = row.columns[ci];
      if (col.items.length > 0 && col.items[0].type === itemType && col.items[0].id === itemId) {
        return { rowIndex: ri, colIndex: ci, column: col };
      }
    }
  }
  return null;
}

/**
 * Generate a deterministic row ID that doesn't collide with existing IDs.
 */
function generateRowId(rows: ContentLayoutRowV2[]): string {
  const usedIndices = new Set<number>();
  for (const row of rows) {
    const match = /^r-(\d+)$/.exec(row.id);
    if (match) {
      usedIndices.add(parseInt(match[1], 10));
    }
  }
  let n = 0;
  while (usedIndices.has(n)) n++;
  return `r-${n}`;
}

/**
 * Remove empty rows from a layout.
 */
function removeEmptyRows(rows: ContentLayoutRowV2[]): ContentLayoutRowV2[] {
  return rows.filter((row) => row.columns.length > 0);
}

/**
 * Collect all existing column IDs from a layout into a Set.
 */
function collectExistingColumnIds(layout: ContentLayout): Set<string> {
  const ids = new Set<string>();
  for (const row of layout.rows) {
    for (const col of row.columns) {
      ids.add(col.id);
    }
  }
  return ids;
}

/**
 * Generate a unique column ID within a layout that doesn't collide
 * with any existing column IDs.
 *
 * Strategy: find the highest c-{n} index across all existing columns,
 * then increment.
 */
function generateUniqueColumnId(layout: ContentLayout): string {
  let maxIdx = -1;
  for (const row of layout.rows) {
    for (const col of row.columns) {
      const match = /^c-(\d+)$/.exec(col.id);
      if (match) {
        const idx = parseInt(match[1], 10);
        if (idx > maxIdx) maxIdx = idx;
      }
    }
  }
  return `c-${maxIdx + 1}`;
}

/**
 * Ensure a column has a unique ID within the destination layout.
 * If the column's current ID already exists in the layout, regenerate it.
 * Only the column ID changes — item refs and business data are preserved.
 *
 * Loops until a provably unique candidate is found.
 */
function ensureUniqueColumnId(
  column: ContentLayoutColumnV2,
  layout: ContentLayout,
): ContentLayoutColumnV2 {
  const existing = collectExistingColumnIds(layout);
  if (!existing.has(column.id)) return column;

  // ID collision — regenerate with loop guarantee
  let candidate = generateUniqueColumnId(layout);
  while (existing.has(candidate)) {
    // Extract numeric suffix and increment
    const match = /^c-(\d+)$/.exec(candidate);
    if (match) {
      candidate = `c-${parseInt(match[1], 10) + 1}`;
    } else {
      // Fallback: append suffix
      candidate = `${candidate}-dup`;
    }
  }
  return { ...column, id: candidate };
}

/**
 * Extract a column from a ContentLayout layout.
 * Returns the updated layout, the extracted column, and the row it was in.
 */
function extractColumnFromLayout(
  layout: ContentLayout,
  itemType: TransferableContentType,
  itemId: string,
): { layout: ContentLayout; column: ContentLayoutColumnV2; sourceRowId: string } | null {
  const found = findColumnByItemRef(layout.rows, itemType, itemId);
  if (!found) return null;

  const { rowIndex, colIndex, column } = found;
  const sourceRow = layout.rows[rowIndex];

  // Remove column from row
  const newColumns = sourceRow.columns.filter((_, ci) => ci !== colIndex);
  const newRows = [...layout.rows];
  newRows[rowIndex] = { ...sourceRow, columns: newColumns };

  // Remove empty rows
  const cleanedRows = removeEmptyRows(newRows);

  return {
    layout: { version: 2, rows: cleanedRows },
    column,
    sourceRowId: sourceRow.id,
  };
}

/**
 * Insert a column into a new row in a ContentLayout.
 * Returns the new layout and the new row ID.
 */
function insertColumnIntoNewRow(
  layout: ContentLayout,
  column: ContentLayoutColumnV2,
): { layout: ContentLayout; newRowId: string } {
  const newRow: ContentLayoutRowV2 = {
    id: generateRowId(layout.rows),
    columns: [column],
  };
  return {
    layout: { version: 2, rows: [...layout.rows, newRow] },
    newRowId: newRow.id,
  };
}

/**
 * Insert a column BEFORE an anchor column in a ContentLayout.
 */
function insertBeforeColumn(
  layout: ContentLayout,
  column: ContentLayoutColumnV2,
  anchorColumnId: string,
): { layout: ContentLayout; changed: boolean } {
  for (let ri = 0; ri < layout.rows.length; ri++) {
    const row = layout.rows[ri];
    const ci = row.columns.findIndex((c) => c.id === anchorColumnId);
    if (ci >= 0) {
      // Capacity check
      if (row.columns.length >= CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW) {
        return { layout, changed: false };
      }
      const newColumns = [...row.columns];
      newColumns.splice(ci, 0, column);
      const newRows = [...layout.rows];
      newRows[ri] = { ...row, columns: newColumns };
      return { layout: { version: 2, rows: newRows }, changed: true };
    }
  }
  return { layout, changed: false };
}

/**
 * Insert a column AFTER an anchor column in a ContentLayout.
 */
function insertAfterColumn(
  layout: ContentLayout,
  column: ContentLayoutColumnV2,
  anchorColumnId: string,
): { layout: ContentLayout; changed: boolean } {
  for (let ri = 0; ri < layout.rows.length; ri++) {
    const row = layout.rows[ri];
    const ci = row.columns.findIndex((c) => c.id === anchorColumnId);
    if (ci >= 0) {
      // Capacity check
      if (row.columns.length >= CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW) {
        return { layout, changed: false };
      }
      const newColumns = [...row.columns];
      newColumns.splice(ci + 1, 0, column);
      const newRows = [...layout.rows];
      newRows[ri] = { ...row, columns: newColumns };
      return { layout: { version: 2, rows: newRows }, changed: true };
    }
  }
  return { layout, changed: false };
}

/**
 * Insert a column into a new row next to an anchor row in a ContentLayout.
 * Returns the new layout and the new row ID.
 */
function insertColumnNextToRow(
  layout: ContentLayout,
  column: ContentLayoutColumnV2,
  anchorRowId: string,
  side: "before" | "after",
): { layout: ContentLayout; newRowId: string } | null {
  const anchorIdx = layout.rows.findIndex((r) => r.id === anchorRowId);
  if (anchorIdx < 0) return null;

  const newRow: ContentLayoutRowV2 = {
    id: generateRowId(layout.rows),
    columns: [column],
  };

  const newRows = [...layout.rows];
  newRows.splice(side === "before" ? anchorIdx : anchorIdx + 1, 0, newRow);

  return {
    layout: { version: 2, rows: newRows },
    newRowId: newRow.id,
  };
}

/** The outcome of inserting a column at a destination placement. */
type ColumnInsertion =
  | { changed: true; layout: ContentLayout; newRowId?: string }
  | { changed: false; reason: string };

/**
 * Insert a column at `placement` in a ContentLayout: in a new row (at the
 * end, or next to an anchor row) or beside an anchor column.
 */
function insertColumnAtPlacement(
  layout: ContentLayout,
  column: ContentLayoutColumnV2,
  placement: ContentTransferDescriptor["destinationPlacement"],
): ColumnInsertion {
  switch (placement.type) {
    case "new-row": {
      const result = insertColumnIntoNewRow(layout, column);
      return { changed: true, layout: result.layout, newRowId: result.newRowId };
    }
    case "new-row-before":
    case "new-row-after": {
      const result = insertColumnNextToRow(
        layout,
        column,
        placement.anchorRowId,
        placement.type === "new-row-before" ? "before" : "after",
      );
      if (!result) return { changed: false, reason: "anchor row not found in destination layout" };
      return { changed: true, layout: result.layout, newRowId: result.newRowId };
    }
    case "before-column":
    case "after-column": {
      const result = placement.type === "before-column"
        ? insertBeforeColumn(layout, column, placement.anchorColumnId)
        : insertAfterColumn(layout, column, placement.anchorColumnId);
      return result.changed
        ? { changed: true, layout: result.layout }
        : { changed: false, reason: "destination insertion rejected (capacity or invalid anchor)" };
    }
  }
}

/* ================================================================== */
/*  INTERNAL HELPERS — container access                                */
/* ================================================================== */

/**
 * Get the actual container object (Block or SubBlock) for a container ref.
 * Returns undefined if the referenced container doesn't exist.
 */
function getSourceContainer(
  block: Block,
  ref: ContentContainerRef,
): Block | Apartado | undefined {
  if (ref.kind === "block") return block;
  return block.apartados.find((s) => s.id === ref.apartadoId);
}

function getContainerLayout(
  block: Block,
  ref: ContentContainerRef,
): ContentLayout | undefined {
  if (ref.kind === "block") {
    const cl = block.contentLayout;
    if (cl && typeof cl === "object" && "version" in cl && (cl as { version: number }).version === 2) {
      return cl as ContentLayout;
    }
    // Resolve (or bootstrap when missing) using the canonical resolver
    return resolveContentLayout(block);
  }
  const sb = block.apartados.find((s) => s.id === ref.apartadoId);
  if (!sb) return undefined;
  const cl = sb.contentLayout;
  if (cl && typeof cl === "object" && "version" in cl && (cl as { version: number }).version === 2) {
    return cl as ContentLayout;
  }
  // Resolve (or bootstrap when missing) using the canonical resolver
  return resolveContentLayout(sb);
}

function setContainerLayout(
  block: Block,
  ref: ContentContainerRef,
  layout: ContentLayout,
): Block {
  if (ref.kind === "block") {
    return { ...block, contentLayout: layout };
  }
  return {
    ...block,
    apartados: block.apartados.map((sb) =>
      sb.id === ref.apartadoId ? { ...sb, contentLayout: layout } : sb,
    ),
  };
}

function getBusinessArray(
  block: Block,
  ref: ContentContainerRef,
  arrayKey: "concepts" | "images" | "tables",
): unknown[] {
  if (ref.kind === "block") {
    return block[arrayKey] as unknown[];
  }
  const sb = block.apartados.find((s) => s.id === ref.apartadoId);
  if (!sb) return [];
  return (sb as Record<string, unknown>)[arrayKey] as unknown[];
}

function setBusinessArray(
  block: Block,
  ref: ContentContainerRef,
  arrayKey: "concepts" | "images" | "tables",
  items: unknown[],
): Block {
  if (ref.kind === "block") {
    return { ...block, [arrayKey]: items };
  }
  return {
    ...block,
    apartados: block.apartados.map((sb) =>
      sb.id === ref.apartadoId ? { ...sb, [arrayKey]: items } : sb,
    ),
  };
}

/* ================================================================== */
/*  BLOCKFLOW CLEANUP HELPER                                           */
/* ================================================================== */

/**
 * Handle BlockFlowV2 cleanup when a source row disappears after extraction.
 * Removes stale content-row references from BlockFlowV2.
 */
function handleBlockFlowCleanup(
  block: Block,
  source: ContentContainerRef,
  sourceLayout: ContentLayout,
): Block {
  if (source.kind !== "block") return block;

  const flow = block.blockFlow;
  if (!flow || typeof flow !== "object" || !("version" in flow)) return block;
  if ((flow as { version: number }).version !== 2) return block;

  const bf = flow as BlockFlowV2;
  const liveRowIds = new Set(sourceLayout.rows.map((r) => r.id));
  const cleanedFlow = removeContentRowsFromBlockFlowV2(bf, liveRowIds);

  return { ...block, blockFlow: cleanedFlow };
}

/* ================================================================== */
/*  MAIN SERVICE                                                       */
/* ================================================================== */

/**
 * Move a single Concept/Image/Table between containers within the same Block.
 *
 * Returns the complete updated parent Block state, or changed:false with
 * a reason if the operation is invalid.
 *
 * Business object ownership moves atomically — the exact same object
 * (with preserved ID and all fields) is transferred.
 *
 * @throws never — all failures return changed:false with reason
 */
export function moveContentItemAcrossContainers(
  block: Block,
  descriptor: ContentTransferDescriptor,
): ContentTransferResult {
  const {
    itemType,
    itemId,
    source,
    destination,
    destinationPlacement,
    blockFlowPlacement,
  } = descriptor;

  /* ---- Validate same block ---- */
  if (source.blockId !== destination.blockId) {
    return { changed: false, block, reason: "cross-block transfer not supported" };
  }
  if (source.blockId !== block.id) {
    return { changed: false, block, reason: "block ID mismatch" };
  }

  /* ---- Validate source ---- */
  // Always use resolved layout for source extraction — includes dynamically
  // appended content that may not yet be in the persisted V2 layout.
  const sourceContainer = getSourceContainer(block, source);
  if (!sourceContainer) {
    return { changed: false, block, reason: "source container not found" };
  }
  const sourceLayout = resolveContentLayout(sourceContainer);

  const sourceBusinessArray = getBusinessArray(block, source, `${itemType}s` as "concepts" | "images" | "tables");
  const sourceItem = sourceBusinessArray.find((item) => (item as { id: string }).id === itemId);
  if (!sourceItem) {
    return { changed: false, block, reason: "item not found in source business array" };
  }

  const extraction = extractColumnFromLayout(sourceLayout, itemType, itemId);
  if (!extraction) {
    return { changed: false, block, reason: "item ref not found in source layout" };
  }

  /* ---- Validate destination ---- */
  const destLayout = getContainerLayout(block, destination);

  // Ensure the extracted column has a unique ID within the destination layout.
  // Domain column IDs (c-0-0) are position-based and may collide across containers.
  const columnToInsert = destLayout
    ? ensureUniqueColumnId(extraction.column, destLayout)
    : extraction.column;

  /* ---- Handle Block destination with new-row + missing blockFlowPlacement ---- */
  if (destination.kind === "block" && destinationPlacement.type === "new-row" && !blockFlowPlacement) {
    return { changed: false, block, reason: "Block destination new-row requires blockFlowPlacement" };
  }

  /* ---- Handle apartado destination without layout ---- */
  if (destination.kind === "apartado" && !destLayout) {
    // Verify the apartado actually exists
    const apartadoExists = block.apartados.some((s) => s.id === destination.apartadoId);
    if (!apartadoExists) {
      return { changed: false, block, reason: "destination apartado not found" };
    }

    // Create empty V2 layout for the apartado
    const { layout: newDestLayout } = insertColumnIntoNewRow(
      { version: 2, rows: [] },
      columnToInsert,
    );

    // Apply source extraction first, then destination layout
    let newBlock = setContainerLayout(block, source, extraction.layout);
    newBlock = setContainerLayout(newBlock, destination, newDestLayout);

    // Move business object
    newBlock = moveBusinessObject(newBlock, source, destination, itemType, itemId);

    // Handle BlockFlow cleanup for source row disappearance
    newBlock = handleBlockFlowCleanup(newBlock, source, extraction.layout);

    return { changed: true, block: newBlock };
  }

  if (!destLayout) {
    return { changed: false, block, reason: "destination has no layout" };
  }

  /* ---- Insert into destination ---- */
  const insertion = insertColumnAtPlacement(destLayout, columnToInsert, destinationPlacement);
  if (!insertion.changed) return { changed: false, block, reason: insertion.reason };
  const newDestLayout = insertion.layout;
  const newDestRowId = insertion.newRowId;

  /* ---- Apply layout changes ---- */
  let newBlock = setContainerLayout(block, source, extraction.layout);
  newBlock = setContainerLayout(newBlock, destination, newDestLayout);

  /* ---- Move business object ---- */
  newBlock = moveBusinessObject(newBlock, source, destination, itemType, itemId);

  /* ---- Handle BlockFlowV2 updates ---- */
  if (destination.kind === "block" && newDestRowId && blockFlowPlacement) {
    const flow = newBlock.blockFlow;
    if (!flow || (typeof flow === "object" && "version" in flow && (flow as { version: number }).version !== 2)) {
      // No V2 flow exists — need to handle this case
      // For now, only proceed if there's already a V2 flow
      // The caller should ensure BlockFlowV2 exists before creating new rows
      if (!flow || (typeof flow === "object" && "rows" in flow)) {
        // Looks like V2, proceed
      } else {
        return { changed: false, block: newBlock, reason: "BlockFlowV2 required for new-row Block destination" };
      }
    }

    const bf = flow as BlockFlowV2;

    // Resolve the actual item ID from the structural row
    const targetStructuralRow = bf.rows.find((r) => r.id === blockFlowPlacement.targetStructuralRowId);
    if (!targetStructuralRow) {
      return { changed: false, block: newBlock, reason: "structural target not found in BlockFlow" };
    }
    const targetItem = targetStructuralRow.items[0];
    if (!targetItem) {
      return { changed: false, block: newBlock, reason: "structural target row is empty" };
    }
    const anchorItemId = targetItem.type === "content-row" ? targetItem.rowId : targetItem.apartadoId;

    const insertResult = insertContentRowIntoBlockFlowV2(bf, {
      newContentRowId: newDestRowId,
      anchorContentRowId: anchorItemId,
      placement: blockFlowPlacement.placement,
    });

    if (insertResult.changed) {
      newBlock = { ...newBlock, blockFlow: insertResult.flow };
    }
  }

  /* ---- Handle BlockFlow cleanup for source row disappearance ---- */
  newBlock = handleBlockFlowCleanup(newBlock, source, extraction.layout);

  return { changed: true, block: newBlock };
}

/**
 * Move a business object from one container to another.
 * Returns updated Block with the object removed from source and added to destination.
 */
function moveBusinessObject(
  block: Block,
  source: ContentContainerRef,
  destination: ContentContainerRef,
  itemType: TransferableContentType,
  itemId: string,
): Block {
  const arrayKey = `${itemType}s` as "concepts" | "images" | "tables";

  // Remove from source
  const sourceItems = getBusinessArray(block, source, arrayKey);
  const newSourceItems = sourceItems.filter((item) => (item as { id: string }).id !== itemId);
  let newBlock = setBusinessArray(block, source, arrayKey, newSourceItems);

  // Add to destination
  const destItems = getBusinessArray(newBlock, destination, arrayKey);
  const sourceItem = sourceItems.find((item) => (item as { id: string }).id === itemId);
  if (sourceItem) {
    newBlock = setBusinessArray(newBlock, destination, arrayKey, [...destItems, sourceItem]);
  }

  return newBlock;
}

/* ================================================================== */
/*  ACROSS BLOCKS                                                      */
/* ================================================================== */

export type ContentBlockTransferResult = {
  changed: boolean;
  sourceBlock: Block;
  destinationBlock: Block;
  reason?: string;
};

/**
 * Move a single Concept/Image/Table from a container of one Block to a
 * container of ANOTHER Block (Block or Apartado on either side).
 *
 * The same business object travels (ID and all fields preserved): it leaves
 * the source arrays, layout and flow, and enters the destination ones at
 * `destinationPlacement`. Both Blocks come back with the layout and flow the
 * move was computed on, so they stay consistent with each other.
 *
 * Returns changed:false (and the Blocks it was given) when the item or a
 * container is missing, or the destination row is full. Never mutates input.
 */
export function moveContentItemAcrossBlocks(
  sourceBlock: Block,
  destinationBlock: Block,
  descriptor: ContentTransferDescriptor,
): ContentBlockTransferResult {
  const { itemType, itemId, source, destination, destinationPlacement, blockFlowPlacement } = descriptor;
  const unchanged = (reason: string): ContentBlockTransferResult =>
    ({ changed: false, sourceBlock, destinationBlock, reason });

  if (source.blockId !== sourceBlock.id || destination.blockId !== destinationBlock.id) {
    return unchanged("block ID mismatch");
  }
  if (sourceBlock.id === destinationBlock.id) return unchanged("same block: use moveContentItemAcrossContainers");

  /* ---- Take the item out of its Block ---- */
  const sourceContainer = getSourceContainer(sourceBlock, source);
  if (!sourceContainer) return unchanged("source container not found");

  const arrayKey = `${itemType}s` as "concepts" | "images" | "tables";
  const sourceItems = getBusinessArray(sourceBlock, source, arrayKey);
  const item = sourceItems.find((candidate) => (candidate as { id: string }).id === itemId);
  if (!item) return unchanged("item not found in source business array");

  const extraction = extractColumnFromLayout(resolveContentLayout(sourceContainer), itemType, itemId);
  if (!extraction) return unchanged("item ref not found in source layout");

  /* ---- Put it into the other Block ---- */
  const destinationContainer = getSourceContainer(destinationBlock, destination);
  if (!destinationContainer) return unchanged("destination container not found");

  const destinationLayout = resolveContentLayout(destinationContainer);
  // The flow as shown before the item arrives: a new Block row is placed against it.
  const destinationFlow = destination.kind === "block"
    ? resolveBlockFlowV2(setContainerLayout(destinationBlock, destination, destinationLayout))
    : undefined;
  const destinationHasRows = Boolean(destinationFlow?.rows.length);
  if (destinationHasRows && destinationPlacement.type === "new-row" && !blockFlowPlacement) {
    return unchanged("Block destination new-row requires blockFlowPlacement");
  }

  const insertion = insertColumnAtPlacement(
    destinationLayout,
    ensureUniqueColumnId(extraction.column, destinationLayout),
    destinationPlacement,
  );
  if (!insertion.changed) return unchanged(insertion.reason);

  let nextDestination = setContainerLayout(destinationBlock, destination, insertion.layout);
  nextDestination = setBusinessArray(nextDestination, destination, arrayKey, [
    ...getBusinessArray(destinationBlock, destination, arrayKey),
    item,
  ]);

  // An empty Block has nothing to place the row against: its flow is derived from the layout.
  if (destinationFlow && destinationHasRows && insertion.newRowId && blockFlowPlacement) {
    const anchor = destinationFlow.rows.find((row) => row.id === blockFlowPlacement.targetStructuralRowId)?.items[0];
    if (!anchor) return unchanged("structural target not found in BlockFlow");
    const inserted = insertContentRowIntoBlockFlowV2(destinationFlow, {
      newContentRowId: insertion.newRowId,
      anchorContentRowId: anchor.type === "content-row" ? anchor.rowId : anchor.apartadoId,
      placement: blockFlowPlacement.placement,
    });
    if (!inserted.changed) return unchanged("structural target not found in BlockFlow");
    nextDestination = { ...nextDestination, blockFlow: inserted.flow };
  }

  let nextSource = setContainerLayout(sourceBlock, source, extraction.layout);
  nextSource = setBusinessArray(
    nextSource,
    source,
    arrayKey,
    sourceItems.filter((candidate) => candidate !== item),
  );
  nextSource = handleBlockFlowCleanup(nextSource, source, extraction.layout);

  return { changed: true, sourceBlock: nextSource, destinationBlock: nextDestination };
}
