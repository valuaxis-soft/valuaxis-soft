import type {
  ContentLayoutColumnV2,
  ContentLayoutRowV2,
  ContentLayout,
} from "../model";
import { CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW } from "./content-layout";

/* ------------------------------------------------------------------ */
/*  Descriptor model                                                   */
/* ------------------------------------------------------------------ */

/**
 * Semantic placement for a column move operation.
 *
 * Uses explicit destinations, NOT flat indexes.
 */
export type ContentLayoutPlacement =
  | "before-column"
  | "after-column"
  | "new-row-before"
  | "new-row-after";

/**
 * Descriptor for a single column movement operation.
 *
 * sourceColumnId: the column to move
 * targetRowId:    the destination row
 * targetColumnId: optional — the anchor column for before/after placement
 *                 (required for before-column / after-column)
 * placement:      semantic destination
 */
export type ContentLayoutMoveDescriptor = {
  sourceColumnId: string;
  targetRowId: string;
  targetColumnId?: string;
  placement: ContentLayoutPlacement;
};

/**
 * Descriptor for a row movement operation.
 */
export type ContentLayoutRowMoveDescriptor = {
  sourceRowId: string;
  targetRowId: string;
  placement: "before" | "after";
};

/* ------------------------------------------------------------------ */
/*  Result type                                                        */
/* ------------------------------------------------------------------ */

/**
 * Result of a layout operation.
 * - `layout`: the new layout (same reference if unchanged)
 * - `changed`: whether the layout was modified
 */
export type ContentLayoutOperationResult = {
  layout: ContentLayout;
  changed: boolean;
};

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function findRowIndex(rows: ContentLayoutRowV2[], rowId: string): number {
  return rows.findIndex((r) => r.id === rowId);
}

function findColumnGlobal(
  rows: ContentLayoutRowV2[],
  columnId: string,
): { rowIndex: number; colIndex: number; column: ContentLayoutColumnV2 } | null {
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    for (let ci = 0; ci < row.columns.length; ci++) {
      if (row.columns[ci].id === columnId) {
        return { rowIndex: ri, colIndex: ci, column: row.columns[ci] };
      }
    }
  }
  return null;
}

/**
 * Generate a deterministic row ID that doesn't collide with existing IDs.
 * Uses the pattern `r-{n}` where n is the first unused index.
 */
function generateRowId(existingRows: ContentLayoutRowV2[]): string {
  const usedIndices = new Set<number>();
  for (const row of existingRows) {
    const match = /^r-(\d+)$/.exec(row.id);
    if (match) {
      usedIndices.add(parseInt(match[1], 10));
    }
  }
  let n = 0;
  while (usedIndices.has(n)) n++;
  return `r-${n}`;
}

function removeEmptyRows(rows: ContentLayoutRowV2[]): ContentLayoutRowV2[] {
  return rows.filter((row) => row.columns.length > 0);
}

/* ------------------------------------------------------------------ */
/*  Core: same-row column moves                                        */
/* ------------------------------------------------------------------ */

function moveColumnBeforeInRow(
  rows: ContentLayoutRowV2[],
  sourceColumnId: string,
  targetRowId: string,
  targetColumnId: string,
): { rows: ContentLayoutRowV2[]; changed: boolean } {
  const source = findColumnGlobal(rows, sourceColumnId);
  if (!source) return { rows, changed: false };

  const targetRowIdx = findRowIndex(rows, targetRowId);
  if (targetRowIdx < 0) return { rows, changed: false };

  const targetRow = rows[targetRowIdx];
  const targetColIdx = targetRow.columns.findIndex((c) => c.id === targetColumnId);
  if (targetColIdx < 0) return { rows, changed: false };

  // Same row: remove + re-insert (count stays same, capacity always OK)
  if (source.rowIndex === targetRowIdx) {
    const newColumns = [...targetRow.columns];
    newColumns.splice(source.colIndex, 1);
    const newTargetIdx = newColumns.findIndex((c) => c.id === targetColumnId);
    newColumns.splice(newTargetIdx, 0, source.column);
    const newRows = [...rows];
    newRows[targetRowIdx] = { ...targetRow, columns: newColumns };
    return { rows: newRows, changed: true };
  }

  // Cross-row: capacity check
  if (targetRow.columns.length >= CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW) {
    return { rows, changed: false };
  }

  // Remove from source, insert into target
  const sourceRow = rows[source.rowIndex];
  const newSourceColumns = sourceRow.columns.filter((c) => c.id !== sourceColumnId);
  const newTargetColumns = [...targetRow.columns];
  newTargetColumns.splice(targetColIdx, 0, source.column);

  const newRows = [...rows];
  newRows[source.rowIndex] = { ...sourceRow, columns: newSourceColumns };
  newRows[targetRowIdx] = { ...targetRow, columns: newTargetColumns };

  return { rows: removeEmptyRows(newRows), changed: true };
}

function moveColumnAfterInRow(
  rows: ContentLayoutRowV2[],
  sourceColumnId: string,
  targetRowId: string,
  targetColumnId: string,
): { rows: ContentLayoutRowV2[]; changed: boolean } {
  const source = findColumnGlobal(rows, sourceColumnId);
  if (!source) return { rows, changed: false };

  const targetRowIdx = findRowIndex(rows, targetRowId);
  if (targetRowIdx < 0) return { rows, changed: false };

  const targetRow = rows[targetRowIdx];
  const targetColIdx = targetRow.columns.findIndex((c) => c.id === targetColumnId);
  if (targetColIdx < 0) return { rows, changed: false };

  // Same row
  if (source.rowIndex === targetRowIdx) {
    const newColumns = [...targetRow.columns];
    newColumns.splice(source.colIndex, 1);
    const newTargetIdx = newColumns.findIndex((c) => c.id === targetColumnId);
    newColumns.splice(newTargetIdx + 1, 0, source.column);
    const newRows = [...rows];
    newRows[targetRowIdx] = { ...targetRow, columns: newColumns };
    return { rows: newRows, changed: true };
  }

  // Cross-row: capacity check
  if (targetRow.columns.length >= CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW) {
    return { rows, changed: false };
  }

  const sourceRow = rows[source.rowIndex];
  const newSourceColumns = sourceRow.columns.filter((c) => c.id !== sourceColumnId);
  const newTargetColumns = [...targetRow.columns];
  newTargetColumns.splice(targetColIdx + 1, 0, source.column);

  const newRows = [...rows];
  newRows[source.rowIndex] = { ...sourceRow, columns: newSourceColumns };
  newRows[targetRowIdx] = { ...targetRow, columns: newTargetColumns };

  return { rows: removeEmptyRows(newRows), changed: true };
}

/* ------------------------------------------------------------------ */
/*  Core: new-row column moves                                         */
/* ------------------------------------------------------------------ */

/**
 * Move a column to a new row inserted BEFORE the target row.
 *
 * Algorithm:
 *  1. Remove source column from its current position.
 *  2. If source row is now empty, remove it from the row array.
 *  3. Create a new row containing only the source column.
 *  4. Insert the new row immediately before the target row.
 *  5. Clean up any empty rows.
 */
function moveColumnToNewRowBefore(
  rows: ContentLayoutRowV2[],
  sourceColumnId: string,
  targetRowId: string,
): { rows: ContentLayoutRowV2[]; changed: boolean } {
  const source = findColumnGlobal(rows, sourceColumnId);
  if (!source) return { rows, changed: false };

  const targetRowIdx = findRowIndex(rows, targetRowId);
  if (targetRowIdx < 0) return { rows, changed: false };

  // 1. Remove source from its row
  const sourceRow = rows[source.rowIndex];
  const remainingCols = sourceRow.columns.filter((c) => c.id !== sourceColumnId);

  // 2. Build rows without source row (if empty) or with updated source row
  let intermediateRows: ContentLayoutRowV2[];
  if (remainingCols.length === 0) {
    // Source row is empty — remove it
    intermediateRows = [...rows.slice(0, source.rowIndex), ...rows.slice(source.rowIndex + 1)];
  } else {
    intermediateRows = [...rows];
    intermediateRows[source.rowIndex] = { ...sourceRow, columns: remainingCols };
  }

  // 3. Create new row
  const newRow: ContentLayoutRowV2 = {
    id: generateRowId(rows),
    columns: [source.column],
  };

  // 4. Calculate insert index in intermediate rows
  //    We want to insert the new row BEFORE the target row.
  let insertIdx: number;
  if (remainingCols.length === 0) {
    // Source row was removed — target shifted down by 1
    insertIdx = source.rowIndex < targetRowIdx ? targetRowIdx - 1 : targetRowIdx;
  } else if (source.rowIndex === targetRowIdx) {
    // Same row: new row goes after remaining items of source row
    insertIdx = source.rowIndex + 1;
  } else {
    // Source row NOT removed, different rows — target at original index
    insertIdx = targetRowIdx;
  }

  const resultRows = [...intermediateRows];
  resultRows.splice(insertIdx, 0, newRow);

  return { rows: removeEmptyRows(resultRows), changed: true };
}

/**
 * Move a column to a new row inserted AFTER the target row.
 *
 * Algorithm:
 *  1. Remove source column from its current position.
 *  2. If source row is now empty, remove it from the row array.
 *  3. Create a new row containing only the source column.
 *  4. Insert the new row immediately after the target row.
 *  5. Clean up any empty rows.
 */
function moveColumnToNewRowAfter(
  rows: ContentLayoutRowV2[],
  sourceColumnId: string,
  targetRowId: string,
): { rows: ContentLayoutRowV2[]; changed: boolean } {
  const source = findColumnGlobal(rows, sourceColumnId);
  if (!source) return { rows, changed: false };

  const targetRowIdx = findRowIndex(rows, targetRowId);
  if (targetRowIdx < 0) return { rows, changed: false };

  // 1. Remove source from its row
  const sourceRow = rows[source.rowIndex];
  const remainingCols = sourceRow.columns.filter((c) => c.id !== sourceColumnId);

  // 2. Build rows without source row (if empty) or with updated source row
  let intermediateRows: ContentLayoutRowV2[];
  if (remainingCols.length === 0) {
    intermediateRows = [...rows.slice(0, source.rowIndex), ...rows.slice(source.rowIndex + 1)];
  } else {
    intermediateRows = [...rows];
    intermediateRows[source.rowIndex] = { ...sourceRow, columns: remainingCols };
  }

  // 3. Create new row
  const newRow: ContentLayoutRowV2 = {
    id: generateRowId(rows),
    columns: [source.column],
  };

  // 4. Calculate insert index in intermediate rows
  //    We want to insert AFTER the target row.
  //    When source row is NOT removed, intermediateRows has same count as original,
  //    so intermediateRows[targetRowIdx] IS the target row → insert at targetRowIdx + 1.
  let insertIdx: number;
  if (remainingCols.length === 0) {
    // Source row was removed — target shifted down by 1
    insertIdx = source.rowIndex < targetRowIdx ? targetRowIdx : targetRowIdx + 1;
  } else {
    // Source row NOT removed — target at original index
    insertIdx = targetRowIdx + 1;
  }

  const resultRows = [...intermediateRows];
  resultRows.splice(insertIdx, 0, newRow);

  return { rows: removeEmptyRows(resultRows), changed: true };
}

/* ------------------------------------------------------------------ */
/*  Row movement operations                                            */
/* ------------------------------------------------------------------ */

function moveRowBefore(
  rows: ContentLayoutRowV2[],
  sourceRowId: string,
  targetRowId: string,
): { rows: ContentLayoutRowV2[]; changed: boolean } {
  const sourceIdx = findRowIndex(rows, sourceRowId);
  if (sourceIdx < 0) return { rows, changed: false };

  const targetIdx = findRowIndex(rows, targetRowId);
  if (targetIdx < 0) return { rows, changed: false };

  if (sourceIdx === targetIdx) return { rows, changed: false };

  const newRows = [...rows];
  const [sourceRow] = newRows.splice(sourceIdx, 1);
  const adjustedTargetIdx = sourceIdx < targetIdx ? targetIdx - 1 : targetIdx;
  newRows.splice(adjustedTargetIdx, 0, sourceRow);

  return { rows: newRows, changed: true };
}

function moveRowAfter(
  rows: ContentLayoutRowV2[],
  sourceRowId: string,
  targetRowId: string,
): { rows: ContentLayoutRowV2[]; changed: boolean } {
  const sourceIdx = findRowIndex(rows, sourceRowId);
  if (sourceIdx < 0) return { rows, changed: false };

  const targetIdx = findRowIndex(rows, targetRowId);
  if (targetIdx < 0) return { rows, changed: false };

  if (sourceIdx === targetIdx) return { rows, changed: false };

  const newRows = [...rows];
  const [sourceRow] = newRows.splice(sourceIdx, 1);
  const adjustedTargetIdx = sourceIdx < targetIdx ? targetIdx - 1 : targetIdx;
  newRows.splice(adjustedTargetIdx + 1, 0, sourceRow);

  return { rows: newRows, changed: true };
}

/* ------------------------------------------------------------------ */
/*  Cleanup operation                                                  */
/* ------------------------------------------------------------------ */

function cleanRows(
  rows: ContentLayoutRowV2[],
): { rows: ContentLayoutRowV2[]; changed: boolean } {
  const cleanedRows = rows
    .map((row) => ({
      ...row,
      columns: row.columns.filter((col) => col.items.length > 0),
    }))
    .filter((row) => row.columns.length > 0);

  const changed = cleanedRows.length !== rows.length ||
    cleanedRows.some((row, i) => row.columns.length !== rows[i].columns.length);

  return { rows: cleanedRows, changed };
}

/* ------------------------------------------------------------------ */
/*  Find column by item ref ID                                         */
/* ------------------------------------------------------------------ */

/**
 * Find the column containing an item with the given ref ID.
 *
 * Searches all rows and columns for a ContentLayoutItemRef whose `id`
 * matches `itemId`. Returns the column's global position and the column
 * itself, or null if not found.
 */
function findColumnByItemId(
  rows: ContentLayoutRowV2[],
  itemId: string,
): { rowIndex: number; colIndex: number; column: ContentLayoutColumnV2 } | null {
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    for (let ci = 0; ci < row.columns.length; ci++) {
      const col = row.columns[ci];
      if (col.items.some((ref) => ref.id === itemId)) {
        return { rowIndex: ri, colIndex: ci, column: col };
      }
    }
  }
  return null;
}

/**
 * Collect the flat item order from all rows (left-to-right, top-to-bottom).
 */
function flatItemOrder(rows: ContentLayoutRowV2[]): string[] {
  const order: string[] = [];
  for (const row of rows) {
    for (const col of row.columns) {
      for (const ref of col.items) {
        order.push(ref.id);
      }
    }
  }
  return order;
}

/* ------------------------------------------------------------------ */
/*  Full-row: order-preserving split                                   */
/* ------------------------------------------------------------------ */

/**
 * Split the row containing `targetItemId` so the target occupies its own row,
 * preserving the original left-to-right / top-to-bottom item order.
 *
 * Given source row: [left..., target, right...]
 * Produces:
 *   row(left...)          if non-empty
 *   row(target only)
 *   row(right...)         if non-empty
 *
 * All other rows remain EXACTLY unchanged.
 * Flat item order is preserved invariant.
 *
 * If the target is already alone in its row, returns layout unchanged.
 * If the target is not found, returns layout unchanged.
 */
export function setItemFullRowPreservingOrder(
  layout: ContentLayout,
  targetItemId: string,
): ContentLayoutOperationResult {
  const found = findColumnByItemId(layout.rows, targetItemId);
  if (!found) return { layout, changed: false };

  const { rowIndex: sourceRowIdx, column: targetCol } = found;
  const sourceRow = layout.rows[sourceRowIdx];

  // Already alone in a single-column row → no-op
  if (sourceRow.columns.length === 1) {
    return { layout, changed: false };
  }

  const targetColIdx = sourceRow.columns.findIndex((c) => c.id === targetCol.id);

  // Split columns around the target
  const leftCols = sourceRow.columns.slice(0, targetColIdx);
  const rightCols = sourceRow.columns.slice(targetColIdx + 1);

  // Build the replacement rows (in order: left, target, right)
  const replacementRows: ContentLayoutRowV2[] = [];

  if (leftCols.length > 0) {
    // Retain the original source row ID for the left fragment
    replacementRows.push({ id: sourceRow.id, columns: leftCols });
  }

  // Target gets its own row with a new deterministic ID
  replacementRows.push({
    id: generateRowId(layout.rows),
    columns: [targetCol],
  });

  if (rightCols.length > 0) {
    // Right fragment gets a new ID
    replacementRows.push({
      id: generateRowId([...layout.rows, ...replacementRows]),
      columns: rightCols,
    });
  }

  // Assemble: before source, replacement, after source
  const resultRows: ContentLayoutRowV2[] = [
    ...layout.rows.slice(0, sourceRowIdx),
    ...replacementRows,
    ...layout.rows.slice(sourceRowIdx + 1),
  ];

  return { layout: { version: 2, rows: resultRows }, changed: true };
}

/* ------------------------------------------------------------------ */
/*  Full-row: target-anchored merge (deactivate)                       */
/* ------------------------------------------------------------------ */

/**
 * Share the target item (currently alone in its row) by bringing an
 * adjacent business item INTO the target's row. The target NEVER moves.
 *
 * Target-anchor invariant:
 *  - TARGET stays in its current row (row ID preserved)
 *  - TARGET's column ID preserved
 *  - TARGET's flat index unchanged
 *  - Neighbor moves into TARGET's row
 *
 * Strategy:
 *  1. If NEXT row exists → bring its FIRST column into TARGET row (after target).
 *     If NEXT becomes empty, remove it.
 *  2. Else if PREVIOUS row exists → bring its LAST column into TARGET row
 *     (before target). If PREVIOUS becomes empty, remove it.
 *  3. Else → no-op (no neighbor to bring in).
 *
 * Flat item order is preserved invariant.
 *
 * If the target is NOT alone in its row, returns layout unchanged.
 * If the target is not found, returns layout unchanged.
 */
export function mergeItemToAdjacentRow(
  layout: ContentLayout,
  targetItemId: string,
): ContentLayoutOperationResult {
  const found = findColumnByItemId(layout.rows, targetItemId);
  if (!found) return { layout, changed: false };

  const { rowIndex: targetRowIdx, column: targetCol } = found;
  const targetRow = layout.rows[targetRowIdx];

  // Must be alone in a single-column row to merge
  if (targetRow.columns.length !== 1) {
    return { layout, changed: false };
  }

  const nextRowIdx = targetRowIdx + 1;
  const prevRowIdx = targetRowIdx - 1;
  const nextRow = nextRowIdx < layout.rows.length ? layout.rows[nextRowIdx] : null;
  const prevRow = prevRowIdx >= 0 ? layout.rows[prevRowIdx] : null;

  // Case 1: NEXT row exists → bring its first column into TARGET row
  if (nextRow && nextRow.columns.length > 0) {
    const [firstCol, ...remainingCols] = nextRow.columns;
    const newRows = [...layout.rows];

    // TARGET row gains the neighbor's first column (append after target)
    newRows[targetRowIdx] = {
      ...targetRow,
      columns: [targetCol, firstCol],
    };

    // Remove or update NEXT row
    if (remainingCols.length === 0) {
      // NEXT row is now empty — remove it
      newRows.splice(nextRowIdx, 1);
    } else {
      // NEXT row still has items — update it
      newRows[nextRowIdx] = { ...nextRow, columns: remainingCols };
    }

    return { layout: { version: 2, rows: newRows }, changed: true };
  }

  // Case 2: no NEXT, but PREVIOUS exists → bring its last column into TARGET row
  if (prevRow && prevRow.columns.length > 0) {
    const lastColIdx = prevRow.columns.length - 1;
    const lastCol = prevRow.columns[lastColIdx];
    const remainingPrevCols = prevRow.columns.slice(0, lastColIdx);
    const newRows = [...layout.rows];

    // TARGET row gains the neighbor's last column (prepend before target)
    newRows[targetRowIdx] = {
      ...targetRow,
      columns: [lastCol, targetCol],
    };

    // Remove or update PREVIOUS row
    if (remainingPrevCols.length === 0) {
      // PREVIOUS row is now empty — remove it
      // Adjust target index since we're removing the row before it
      newRows.splice(prevRowIdx, 1);
    } else {
      // PREVIOUS row still has items — update it
      newRows[prevRowIdx] = { ...prevRow, columns: remainingPrevCols };
    }

    return { layout: { version: 2, rows: newRows }, changed: true };
  }

  // Case 3: neither neighbor has items → no-op
  return { layout, changed: false };
}

/* ------------------------------------------------------------------ */
/*  High-level movement API                                            */
/* ------------------------------------------------------------------ */

/**
 * Move a column within a layout using semantic placement descriptors.
 *
 * This is the canonical single-column movement operation.
 * All movement invariants are centralized here.
 *
 * Returns a result with the new layout and whether anything changed.
 * If the operation is invalid or rejected, returns the original layout unchanged.
 *
 * Movement invariants:
 *  - Source column is removed from its current position.
 *  - Source row is removed if it becomes empty.
 *  - Destination capacity (max 3 columns) is enforced.
 *  - Unaffected row/column IDs are preserved.
 *  - Unaffected content order is preserved.
 *  - No mutation of the input layout.
 */
export function moveContentLayout(
  layout: ContentLayout,
  descriptor: ContentLayoutMoveDescriptor,
): ContentLayoutOperationResult {
  const { sourceColumnId, targetRowId, targetColumnId, placement } = descriptor;

  // Validate source exists
  const source = findColumnGlobal(layout.rows, sourceColumnId);
  if (!source) return { layout, changed: false };

  // Validate target row exists
  const targetRowIdx = findRowIndex(layout.rows, targetRowId);
  if (targetRowIdx < 0) return { layout, changed: false };

  // Source == target column: no-op
  if (targetColumnId && sourceColumnId === targetColumnId) {
    return { layout, changed: false };
  }

  switch (placement) {
    case "before-column": {
      if (!targetColumnId) return { layout, changed: false };
      const { rows, changed } = moveColumnBeforeInRow(layout.rows, sourceColumnId, targetRowId, targetColumnId);
      return { layout: { version: 2, rows }, changed };
    }

    case "after-column": {
      if (!targetColumnId) return { layout, changed: false };
      const { rows, changed } = moveColumnAfterInRow(layout.rows, sourceColumnId, targetRowId, targetColumnId);
      return { layout: { version: 2, rows }, changed };
    }

    case "new-row-before": {
      const { rows, changed } = moveColumnToNewRowBefore(layout.rows, sourceColumnId, targetRowId);
      return { layout: { version: 2, rows }, changed };
    }

    case "new-row-after": {
      const { rows, changed } = moveColumnToNewRowAfter(layout.rows, sourceColumnId, targetRowId);
      return { layout: { version: 2, rows }, changed };
    }

    default:
      return { layout, changed: false };
  }
}

/**
 * Move a row within a layout.
 *
 * Returns a result with the new layout and whether anything changed.
 * If the operation is invalid, returns the original layout unchanged.
 */
export function moveContentLayoutRow(
  layout: ContentLayout,
  descriptor: ContentLayoutRowMoveDescriptor,
): ContentLayoutOperationResult {
  const { sourceRowId, targetRowId, placement } = descriptor;

  const { rows, changed } = placement === "before"
    ? moveRowBefore(layout.rows, sourceRowId, targetRowId)
    : moveRowAfter(layout.rows, sourceRowId, targetRowId);

  return { layout: { version: 2, rows }, changed };
}

/**
 * Remove empty rows and columns from a layout.
 */
export function cleanContentLayout(
  layout: ContentLayout,
): ContentLayoutOperationResult {
  const { rows, changed } = cleanRows(layout.rows);
  return { layout: { version: 2, rows }, changed };
}
