/**
 * BlockFlow — optional ordered composition layer inside Block.
 *
 * BlockFlow is a reference-only model that describes the visual ordering
 * of content rows and Apartados (SubBlocks) within a Block. It stores
 * NO business data — only references to existing row IDs and apartado IDs.
 *
 * Format (`version: 2`): structural rows, each holding 1–2 cell items.
 *
 * When absent, the current visual order is:
 *   1. Every direct ContentLayout row in existing order
 *   2. Every Apartado/SubBlock in existing order
 *
 * This module is pure — no side effects, no persistence, no rendering.
 */

import type {
  Block,
  BlockFlowApartadoRef,
  BlockFlowCellItem,
  BlockFlowStructuralRow,
  BlockFlowV2,
  ContentLayout,
} from "../model";
import { isContentLayout, resolveContentLayout } from "./content-layout";
import {
  moveContentLayout,
  type ContentLayoutMoveDescriptor,
} from "./content-layout-v2-operations";

/* ================================================================== */
/*  TYPE GUARDS                                                        */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  V2 type guard                                                      */
/* ------------------------------------------------------------------ */

/**
 * Type guard: returns true if `value` is a valid BlockFlow V2.
 *
 * Checks:
 *  - version === 2
 *  - rows is an array
 *  - each row has a valid string id and items array
 *  - each cell item is a valid content-row or apartado reference
 */
export function isBlockFlowV2(value: unknown): value is BlockFlowV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if (obj.version !== 2) return false;
  if (!Array.isArray(obj.rows)) return false;
  for (const row of obj.rows) {
    if (!row || typeof row !== "object") return false;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id) return false;
    if (!Array.isArray(r.items)) return false;
    for (const item of r.items) {
      if (!item || typeof item !== "object") return false;
      const it = item as Record<string, unknown>;
      if (it.type === "content-row") {
        if (typeof it.rowId !== "string" || !it.rowId) return false;
      } else if (it.type === "apartado") {
        if (typeof it.apartadoId !== "string" || !it.apartadoId) return false;
      } else {
        return false;
      }
    }
  }
  return true;
}

/* ================================================================== */
/*  STRUCTURAL ROW VALIDATION                                          */
/* ================================================================== */

/**
 * Structural row composition rule.
 *
 * Valid:
 *  - CONTENT ROW: exactly 1 item with type === "content-row"
 *  - APARTADO ROW: 1–2 items, all with type === "apartado"
 *
 * Invalid (rejected/normalized away):
 *  - empty row (0 items)
 *  - 3+ apartados
 *  - mixed content-row + apartado
 *  - 2 content-row refs
 *  - duplicate refs within same row
 */
export function isValidStructuralRow(row: BlockFlowStructuralRow): boolean {
  if (!row.items || row.items.length === 0) return false;

  const hasContentRow = row.items.some((item) => item.type === "content-row");
  const hasApartado = row.items.some((item) => item.type === "apartado");

  // Mixed: content-row + apartado → invalid
  if (hasContentRow && hasApartado) return false;

  // Content row: exactly 1 content-row item
  if (hasContentRow) {
    return row.items.length === 1;
  }

  // Apartado row: 1–2 apartado items
  if (hasApartado) {
    if (row.items.length > 2) return false;
    // Check for duplicate apartado IDs
    const ids = row.items.map((item) => {
      const it = item as Record<string, unknown>;
      return it.apartadoId;
    });
    return new Set(ids).size === ids.length;
  }

  return false;
}

/* ================================================================== */
/*  STABLE ID GENERATION                                               */
/* ================================================================== */

/**
 * Generate a stable structural row ID from a content-row reference.
 *
 * Strategy: `bf-c-{rowId}` — deterministic, stable, no positional index.
 */
export function contentRowStructuralId(rowId: string): string {
  return `bf-c-${rowId}`;
}

/**
 * Generate a stable structural row ID from an apartado reference.
 *
 * Strategy: `bf-a-{apartadoId}` — deterministic, stable, no positional index.
 */
export function apartadoStructuralId(apartadoId: string): string {
  return `bf-a-${apartadoId}`;
}

/**
 * Generate a new unique structural row ID for newly created rows.
 *
 * Uses crypto.randomUUID() for stable unique identity.
 * Only for NEW rows created by mutation operations.
 */
export function newStructuralRowId(): string {
  return `bf-${crypto.randomUUID()}`;
}

/* ================================================================== */
/*  INTERNAL HELPERS                                                    */
/* ================================================================== */

/**
 * Extract row IDs from the persisted ContentLayout, in persisted order. This
 * reads the raw stored layout, not the reconciled one (which may strip empty
 * rows). A block whose layout was never saved (a template block the user only
 * filled in) uses the layout bootstrapped from its content, the same one the
 * renderers build; otherwise its concepts and tables would never show.
 */
function extractLiveRowIds(block: Block): string[] {
  const cl = isContentLayout(block.contentLayout) ? block.contentLayout : resolveContentLayout(block);
  return cl.rows
    .filter((r) => r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string")
    .map((r) => (r as { id: string }).id);
}

/**
 * Extract apartado IDs from block.apartados in array order.
 */
function extractLiveApartadoIds(block: Block): string[] {
  return block.apartados.map((s) => s.id);
}

/* ================================================================== */
/*  V2 NORMALIZATION / RECONCILIATION                                  */
/* ================================================================== */

/**
 * Normalize a BlockFlow V2 structural row:
 *
 *  - Remove empty rows
 *  - Remove mixed content-row + apartado rows → split into separate rows
 *  - Remove rows with 3+ apartados → keep first 2, extras become singleton rows
 *  - Remove duplicate refs within a row (keep first)
 *  - Remove rows that become empty after cleanup
 */
function normalizeStructuralRow(
  row: BlockFlowStructuralRow,
): BlockFlowStructuralRow[] {
  if (!row.items || row.items.length === 0) return [];

  const hasContentRow = row.items.some((item) => item.type === "content-row");
  const hasApartado = row.items.some((item) => item.type === "apartado");

  // Mixed content-row + apartado → split into separate rows
  if (hasContentRow && hasApartado) {
    const result: BlockFlowStructuralRow[] = [];
    for (const item of row.items) {
      if (item.type === "content-row") {
        result.push({
          id: contentRowStructuralId(item.rowId),
          items: [item],
        });
      } else {
        result.push({
          id: apartadoStructuralId(item.apartadoId),
          items: [item],
        });
      }
    }
    return result;
  }

  // Content row: must have exactly 1 content-row item
  if (hasContentRow) {
    const contentItem = row.items.find((item) => item.type === "content-row");
    if (!contentItem || row.items.length !== 1) return [];
    return [{ id: row.id, items: [contentItem] }];
  }

  // Apartado row: 1–2 items, deduplicate
  if (hasApartado) {
    const seen = new Set<string>();
    const deduped: BlockFlowCellItem[] = [];
    for (const item of row.items) {
      if (item.type === "apartado") {
        if (!seen.has(item.apartadoId)) {
          seen.add(item.apartadoId);
          deduped.push(item);
        }
      }
    }

    if (deduped.length === 0) return [];
    // Keep max 2; extras become singleton rows
    if (deduped.length <= 2) {
      return [{ id: row.id, items: deduped }];
    }
    // 3+ apartados: first row gets 2, rest become singletons
    const result: BlockFlowStructuralRow[] = [
      { id: row.id, items: deduped.slice(0, 2) },
    ];
    for (let i = 2; i < deduped.length; i++) {
      const item = deduped[i];
      if (item.type === "apartado") {
        result.push({
          id: apartadoStructuralId(item.apartadoId),
          items: [item],
        });
      }
    }
    return result;
  }

  return [];
}

/**
 * Normalize a BlockFlow V2 against the live Block state.
 *
 * Rules:
 *  - Preserve valid structural row order
 *  - Preserve valid structural row IDs
 *  - Remove stale content-row refs
 *  - Remove stale apartado refs
 *  - Remove duplicates across rows (keep first occurrence)
 *  - Remove empty/invalid structural rows
 *  - Enforce max 2 Apartados per row
 *  - Split malformed mixed rows safely
 *  - Append missing live content rows
 *  - Append missing live apartados deterministically
 *
 * Never mutates input.
 */
export function normalizeBlockFlowV2(
  block: Block,
  flow: BlockFlowV2,
): BlockFlowV2 {
  const liveRowIds = new Set(extractLiveRowIds(block));
  const liveApartadoIds = new Set(extractLiveApartadoIds(block));

  const seenRowRefs = new Set<string>();
  const seenApartadoRefs = new Set<string>();
  const normalizedRows: BlockFlowStructuralRow[] = [];

  // Pass 1: normalize and filter existing rows
  for (const row of flow.rows) {
    if (!row || typeof row !== "object" || !Array.isArray(row.items)) continue;
    const fixed = normalizeStructuralRow(row);
    for (const r of fixed) {
      const kept: BlockFlowCellItem[] = [];
      for (const item of r.items) {
        if (item.type === "content-row") {
          if (!liveRowIds.has(item.rowId)) continue;
          if (seenRowRefs.has(item.rowId)) continue;
          seenRowRefs.add(item.rowId);
          kept.push(item);
        } else if (item.type === "apartado") {
          if (!liveApartadoIds.has(item.apartadoId)) continue;
          if (seenApartadoRefs.has(item.apartadoId)) continue;
          seenApartadoRefs.add(item.apartadoId);
          kept.push(item);
        }
      }
      if (kept.length > 0) {
        normalizedRows.push({ id: r.id, items: kept });
      }
    }
  }

  // Pass 2: append missing live content rows (as singleton rows)
  for (const rowId of extractLiveRowIds(block)) {
    if (!seenRowRefs.has(rowId)) {
      normalizedRows.push({
        id: contentRowStructuralId(rowId),
        items: [{ type: "content-row", rowId }],
      });
      seenRowRefs.add(rowId);
    }
  }

  // Pass 3: append missing live apartados (as singleton rows)
  for (const apartadoId of extractLiveApartadoIds(block)) {
    if (!seenApartadoRefs.has(apartadoId)) {
      normalizedRows.push({
        id: apartadoStructuralId(apartadoId),
        items: [{ type: "apartado", apartadoId }],
      });
      seenApartadoRefs.add(apartadoId);
    }
  }

  if (normalizedRows.length === 0) return { version: 2, rows: [] };
  return { version: 2, rows: normalizedRows };
}

/* ================================================================== */
/*  V2 GENERATION — create default V2 from block state                 */
/* ================================================================== */

/**
 * Generate a BlockFlow V2 from the current Block state.
 *
 * Each content row and apartado becomes its own singleton structural row.
 * Returns undefined when the block has no content rows and no sub-blocks.
 */
export function generateBlockFlowV2(block: Block): BlockFlowV2 | undefined {
  const rows: BlockFlowStructuralRow[] = [];

  for (const rowId of extractLiveRowIds(block)) {
    rows.push({
      id: contentRowStructuralId(rowId),
      items: [{ type: "content-row", rowId }],
    });
  }
  for (const apartadoId of extractLiveApartadoIds(block)) {
    rows.push({
      id: apartadoStructuralId(apartadoId),
      items: [{ type: "apartado", apartadoId }],
    });
  }

  if (rows.length === 0) return undefined;
  return { version: 2, rows };
}

/* ================================================================== */
/*  RESOLUTION — main entry points                                     */
/* ================================================================== */

/**
 * Resolve the effective BlockFlow V2 for a block.
 *
 * 1. If block has a valid blockFlow → normalize it against live state
 * 2. Otherwise → generate the default flow from block state
 *    (every content row, then every apartado)
 *
 * Returns undefined only when the block has no content rows and no sub-blocks.
 */
export function resolveBlockFlowV2(block: Block): BlockFlowV2 | undefined {
  const raw = block.blockFlow;

  if (raw && isBlockFlowV2(raw)) {
    return normalizeBlockFlowV2(block, raw);
  }

  return generateBlockFlowV2(block);
}

/* ================================================================== */
/*  NATIVE V2 STRUCTURAL MOVE — apartado movement within BlockFlow V2  */
/* ================================================================== */

export type BlockFlowV2ApartadoTarget =
  | {
      type: "structural-row";
      rowId: string;
      placement: "before" | "after";
    }
  | {
      type: "apartado";
      apartadoId: string;
      placement: "left" | "right";
    };

export type BlockFlowV2ApartadoDescriptor = {
  apartadoId: string;
  target: BlockFlowV2ApartadoTarget;
};

export type BlockFlowV2MoveResult = {
  flow: BlockFlowV2;
  changed: boolean;
};

/**
 * Find the structural row containing a given apartado.
 * Returns null if not found.
 */
function findApartadoRow(
  rows: BlockFlowStructuralRow[],
  apartadoId: string,
): BlockFlowStructuralRow | null {
  for (const row of rows) {
    if (row.items.some((item) => item.type === "apartado" && item.apartadoId === apartadoId)) {
      return row;
    }
  }
  return null;
}

/**
 * Extract the apartado ref from a row and return the remaining row.
 * If the row becomes empty, returns null for the remaining row.
 */
function extractApartadoFromRow(
  row: BlockFlowStructuralRow,
  apartadoId: string,
): { extracted: BlockFlowApartadoRef; remaining: BlockFlowStructuralRow | null } {
  const extracted = row.items.find(
    (item) => item.type === "apartado" && item.apartadoId === apartadoId,
  ) as BlockFlowApartadoRef | undefined;

  if (!extracted) {
    throw new Error(`Apartado ${apartadoId} not found in row ${row.id}`);
  }

  const remaining = row.items.filter(
    (item) => !(item.type === "apartado" && item.apartadoId === apartadoId),
  );

  if (remaining.length === 0) {
    return { extracted, remaining: null };
  }

  return {
    extracted,
    remaining: { ...row, items: remaining },
  };
}

/**
 * Move an Apartado natively within a BlockFlowV2.
 *
 * Supports:
 *  - BEFORE/AFTER a structural row (content or apartado)
 *  - LEFT/RIGHT of another Apartado (pairing into a structural row)
 *
 * Movement rules:
 *  - Source apartado is extracted from its current row
 *  - Empty source row is removed
 *  - Content rows do NOT accept lateral (left/right) apartado placement
 *  - Max 2 apartados per structural row enforced
 *  - Paired apartados are never lost
 *
 * Never mutates the input flow.
 */
export function moveBlockFlowV2Apartado(
  flow: BlockFlowV2,
  descriptor: BlockFlowV2ApartadoDescriptor,
): BlockFlowV2MoveResult {
  const { apartadoId, target } = descriptor;

  // Find and extract source
  const sourceRow = findApartadoRow(flow.rows, apartadoId);
  if (!sourceRow) return { flow, changed: false };

  // Same-position check: if target is the same apartado, no-op
  if (target.type === "apartado" && target.apartadoId === apartadoId) {
    return { flow, changed: false };
  }

  const { extracted, remaining: sourceRemaining } = extractApartadoFromRow(sourceRow, apartadoId);

  // Build new rows: remove source row (if empty) or replace with remaining
  const rowsWithoutSource = flow.rows.filter((r) => r.id !== sourceRow.id);
  const rowsWithSourceRemaining = sourceRemaining
    ? [...rowsWithoutSource.slice(0, flow.rows.indexOf(sourceRow)), sourceRemaining, ...rowsWithoutSource.slice(flow.rows.indexOf(sourceRow))]
    : rowsWithoutSource;

  // ---- BEFORE / AFTER a structural row ----
  if (target.type === "structural-row") {
    const targetIdx = rowsWithSourceRemaining.findIndex((r) => r.id === target.rowId);
    if (targetIdx < 0) return { flow, changed: false };

    const newRow: BlockFlowStructuralRow = {
      id: newStructuralRowId(),
      items: [extracted],
    };

    const insertIdx = target.placement === "before" ? targetIdx : targetIdx + 1;
    // Adjust insert index if source was before target and got removed
    const adjustedIdx = sourceRow.id === target.rowId
      ? insertIdx
      : (flow.rows.indexOf(sourceRow) < targetIdx && !sourceRemaining ? insertIdx - 1 : insertIdx);

    const newRows = [...rowsWithSourceRemaining];
    newRows.splice(adjustedIdx, 0, newRow);

    return { flow: { version: 2, rows: newRows }, changed: true };
  }

  // ---- LEFT / RIGHT of another Apartado ----
  if (target.type === "apartado") {
    const targetRow = findApartadoRow(rowsWithSourceRemaining, target.apartadoId);
    if (!targetRow) return { flow, changed: false };

    // Content rows do not accept lateral apartado placement
    const isTargetContentRow = targetRow.items.some((item) => item.type === "content-row");
    if (isTargetContentRow) return { flow, changed: false };

    // Max 2 apartados: reject if target row already has 2 (and source is not one of them)
    const targetApartadoCount = targetRow.items.filter((item) => item.type === "apartado").length;
    if (targetApartadoCount >= 2) return { flow, changed: false };

    // Determine insertion index within the target row
    const targetApartadoIdx = targetRow.items.findIndex(
      (item) => item.type === "apartado" && item.apartadoId === target.apartadoId,
    );
    if (targetApartadoIdx < 0) return { flow, changed: false };

    const insertIdx = target.placement === "left" ? targetApartadoIdx : targetApartadoIdx + 1;

    // Create new row with the apartado inserted
    const newTargetItems = [...targetRow.items];
    newTargetItems.splice(insertIdx, 0, extracted);

    const newRows = rowsWithSourceRemaining.map((r) =>
      r.id === targetRow.id ? { ...r, items: newTargetItems } : r,
    );

    return { flow: { version: 2, rows: newRows }, changed: true };
  }

  return { flow, changed: false };
}

/* ================================================================== */
/*  BUTTON MOVE — one-step apartado vertical movement                  */
/* ================================================================== */

export type ApartadoMoveDirection = "up" | "down";

/**
 * Move an Apartado one vertical step within BlockFlowV2.
 *
 * PAIRED source: splits the selected Apartado from its pair.
 *   - UP: becomes singleton BEFORE the surviving source row
 *   - DOWN: becomes singleton AFTER the surviving source row
 *
 * SINGLETON source: crosses exactly ONE adjacent structural row.
 *   - UP: moves before the previous structural row
 *   - DOWN: moves after the next structural row
 *
 * Content rows count as structural boundaries.
 * Vertical buttons NEVER create new pairs.
 * Delegates entirely to moveBlockFlowV2Apartado().
 * Never mutates input.
 */
export function moveBlockFlowV2ApartadoOneStep(
  flow: BlockFlowV2,
  apartadoId: string,
  direction: ApartadoMoveDirection,
): BlockFlowV2MoveResult {
  const sourceRow = findApartadoRow(flow.rows, apartadoId);
  if (!sourceRow) return { flow, changed: false };

  const sourceRowIdx = flow.rows.indexOf(sourceRow);
  const apartadoCount = sourceRow.items.filter(
    (i) => i.type === "apartado",
  ).length;
  const isPaired = apartadoCount === 2;

  let targetRowId: string;
  let placement: "before" | "after";

  if (isPaired) {
    // PAIRED: split by targeting source row's own ID
    targetRowId = sourceRow.id;
    placement = direction === "up" ? "before" : "after";
  } else {
    // SINGLETON: target adjacent structural row
    const targetRowIdx =
      direction === "up" ? sourceRowIdx - 1 : sourceRowIdx + 1;
    if (targetRowIdx < 0 || targetRowIdx >= flow.rows.length) {
      return { flow, changed: false };
    }
    targetRowId = flow.rows[targetRowIdx].id;
    placement = direction === "up" ? "before" : "after";
  }

  return moveBlockFlowV2Apartado(flow, {
    apartadoId,
    target: { type: "structural-row", rowId: targetRowId, placement },
  });
}

/**
 * Check whether an Apartado can move one vertical step in the given direction.
 */
export function canMoveBlockFlowV2ApartadoOneStep(
  flow: BlockFlowV2,
  apartadoId: string,
  direction: ApartadoMoveDirection,
): boolean {
  const sourceRow = findApartadoRow(flow.rows, apartadoId);
  if (!sourceRow) return false;

  const sourceRowIdx = flow.rows.indexOf(sourceRow);
  const apartadoCount = sourceRow.items.filter(
    (i) => i.type === "apartado",
  ).length;
  const isPaired = apartadoCount === 2;

  if (isPaired) return true;

  if (direction === "up") return sourceRowIdx > 0;
  return sourceRowIdx < flow.rows.length - 1;
}

/* ================================================================== */
/*  CONTENT ROW SYNC — synchronize BlockFlowV2 with ContentLayout    */
/* ================================================================== */

export type ContentRowInsertDescriptor = {
  /** The ContentLayout row ID of the newly created row. */
  newContentRowId: string;
  /** The ContentLayout row ID of the anchor row (the target of the drop). */
  anchorContentRowId: string;
  /** Whether to insert before or after the anchor structural row. */
  placement: "before" | "after";
};

export type ContentRowInsertResult = {
  flow: BlockFlowV2;
  changed: boolean;
};

/**
 * Insert a new content-row structural row into BlockFlowV2.
 *
 * Finds the structural row containing { type: "content-row", rowId: anchorContentRowId }
 * and inserts a NEW singleton structural row containing
 * { type: "content-row", rowId: newContentRowId } at the specified position.
 *
 * Rules:
 *  - Anchor must exist in the flow
 *  - New row must not already exist (duplicate rejected)
 *  - New structural row gets stable unique ID via crypto.randomUUID()
 *  - Does not create mixed content-row + apartado rows
 *  - Never mutates input
 */
export function insertContentRowIntoBlockFlowV2(
  flow: BlockFlowV2,
  descriptor: ContentRowInsertDescriptor,
): ContentRowInsertResult {
  const { newContentRowId, anchorContentRowId, placement } = descriptor;

  // Check for duplicate: new row already exists in flow
  const alreadyExists = flow.rows.some((row) =>
    row.items.some((item) => item.type === "content-row" && item.rowId === newContentRowId),
  );
  if (alreadyExists) return { flow, changed: false };

  // Find the structural row containing the anchor (content-row or apartado)
  const anchorRowIdx = flow.rows.findIndex((row) =>
    row.items.some((item) => {
      if (item.type === "content-row") return item.rowId === anchorContentRowId;
      if (item.type === "apartado") return item.apartadoId === anchorContentRowId;
      return false;
    }),
  );
  if (anchorRowIdx < 0) return { flow, changed: false };

  // Create the new singleton structural row
  const newRow: BlockFlowStructuralRow = {
    id: newStructuralRowId(),
    items: [{ type: "content-row", rowId: newContentRowId }],
  };

  const insertIdx = placement === "before" ? anchorRowIdx : anchorRowIdx + 1;
  const newRows = [...flow.rows];
  newRows.splice(insertIdx, 0, newRow);

  return { flow: { version: 2, rows: newRows }, changed: true };
}

/**
 * Remove all content-row structural references from BlockFlowV2 that
 * are NOT in the set of live ContentLayout row IDs.
 *
 * This is used to clean up stale content-row references when a
 * ContentLayout row disappears (e.g., source row emptied after move).
 *
 * Also removes any structural rows that become empty after cleanup.
 * Never mutates input.
 */
export function removeContentRowsFromBlockFlowV2(
  flow: BlockFlowV2,
  liveContentRowIds: Set<string>,
): BlockFlowV2 {
  const newRows: BlockFlowStructuralRow[] = [];

  for (const row of flow.rows) {
    const kept: BlockFlowCellItem[] = [];
    for (const item of row.items) {
      if (item.type === "content-row") {
        if (liveContentRowIds.has(item.rowId)) {
          kept.push(item);
        }
      } else {
        // Apartado items are always kept
        kept.push(item);
      }
    }
    if (kept.length > 0) {
      newRows.push({ id: row.id, items: kept });
    }
  }

  return { version: 2, rows: newRows };
}

/* ================================================================== */
/*  CONTENT COLUMN → BLOCK FLOW BOUNDARY                               */
/* ================================================================== */

export type ContentColumnBoundaryDescriptor = {
  /** The ID of the source column to move. */
  sourceColumnId: string;
  /** The structural row ID to place the new content row relative to. */
  targetStructuralRowId: string;
  /** Before or after the target structural row. */
  placement: "before" | "after";
};

export type ContentColumnBoundaryResult = {
  /** Updated ContentLayout with the column moved to a new row. */
  contentLayout: ContentLayout;
  /** Updated BlockFlowV2 with the new structural row inserted. */
  blockFlow: BlockFlowV2;
  /** Whether anything changed. */
  changed: boolean;
};

/**
 * Move a content column to a new position at a structural boundary in BlockFlowV2.
 *
 * This is a SAME-BLOCK operation. The column already belongs to block.concepts/images/tables.
 * Business ownership is NOT moved — only the layout positions change.
 *
 * Steps:
 *  1. Remove the column from its current ContentLayout row.
 *  2. If the source row becomes empty, remove it.
 *  3. Create a NEW ContentLayout row containing only the dragged column.
 *  4. Insert the new row into the ContentLayout at the appropriate position.
 *  5. Insert a new BlockFlowV2 structural content-row reference at the target.
 *  6. Remove stale BlockFlow content-row ref if source row disappeared.
 *
 * Never mutates input contentLayout or blockFlow.
 */
export function moveContentColumnToBlockFlowBoundary(
  contentLayout: ContentLayout,
  blockFlow: BlockFlowV2,
  descriptor: ContentColumnBoundaryDescriptor,
): ContentColumnBoundaryResult {
  const { sourceColumnId, targetStructuralRowId, placement } = descriptor;

  // 1. Find the target structural row to determine the ContentLayout anchor
  const targetStructuralRow = blockFlow.rows.find((r) => r.id === targetStructuralRowId);
  if (!targetStructuralRow) {
    return { contentLayout, blockFlow, changed: false };
  }

  // 2. Determine the ContentLayout target row ID based on structural row type
  const targetItem = targetStructuralRow.items[0];
  let contentTargetRowId: string | undefined;
  let isTargetContentRow = false;

  if (targetItem && targetItem.type === "content-row") {
    contentTargetRowId = targetItem.rowId;
    isTargetContentRow = true;
  }

  // 3. Execute the ContentLayout move
  let newLayout: ContentLayout;
  let layoutChanged: boolean;

  if (isTargetContentRow && contentTargetRowId) {
    // Target is a content row — use before/after on that row
    const moveDescriptor: ContentLayoutMoveDescriptor = {
      sourceColumnId,
      targetRowId: contentTargetRowId,
      placement: placement === "before" ? "new-row-before" : "new-row-after",
    };
    const layoutResult = moveContentLayout(contentLayout, moveDescriptor);
    newLayout = layoutResult.layout;
    layoutChanged = layoutResult.changed;
  } else {
    // Target is an apartado — remove source column and add new row at end
    // Find and remove the source column
    const sourceMoveResult = moveContentLayout(contentLayout, {
      sourceColumnId,
      targetRowId: contentLayout.rows[0]?.id ?? "",
      placement: "new-row-after",
    });

    if (!sourceMoveResult.changed) {
      return { contentLayout, blockFlow, changed: false };
    }

    // The source move already created a new row — we just need to position it
    // For apartado targets, the new row stays where the operation placed it
    newLayout = sourceMoveResult.layout;
    layoutChanged = true;
  }

  if (!layoutChanged) {
    return { contentLayout, blockFlow, changed: false };
  }

  // 4. Detect newly created ContentLayout row ID
  const oldRowIds = new Set(contentLayout.rows.map((r) => r.id));
  const newRowIds = new Set(newLayout.rows.map((r) => r.id));
  let newContentRowId: string | undefined;
  for (const id of newRowIds) {
    if (!oldRowIds.has(id)) {
      newContentRowId = id;
      break;
    }
  }

  if (!newContentRowId) {
    // No new row created — no BlockFlow change
    return { contentLayout: newLayout, blockFlow, changed: true };
  }

  // 5. Detect removed source rows
  const removedRowIds: string[] = [];
  for (const id of oldRowIds) {
    if (!newRowIds.has(id)) removedRowIds.push(id);
  }

  // 6. Update BlockFlowV2
  let updatedFlow = blockFlow;

  // Remove stale content-row references for disappeared rows
  if (removedRowIds.length > 0) {
    updatedFlow = removeContentRowsFromBlockFlowV2(updatedFlow, newRowIds);
  }

  // Insert new structural content-row at the target boundary
  // Use the actual item ID (rowId or apartadoId), not the structural row ID
  const anchorItemId = targetItem.type === "content-row"
    ? targetItem.rowId
    : targetItem.apartadoId;

  const insertResult = insertContentRowIntoBlockFlowV2(updatedFlow, {
    newContentRowId,
    anchorContentRowId: anchorItemId,
    placement,
  });

  if (insertResult.changed) {
    updatedFlow = insertResult.flow;
  }

  return {
    contentLayout: newLayout,
    blockFlow: updatedFlow,
    changed: true,
  };
}
