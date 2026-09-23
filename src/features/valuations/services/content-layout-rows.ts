import type { ContentLayoutItem } from "../model";
import {
  CONTENT_LAYOUT_MAX_ITEMS_PER_ROW,
  canFitContentLayoutItem,
} from "./content-layout-policy";
import { balancedRowSpan } from "./content-layout-balanced";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * A visual row in the content layout grid.
 */
export type ContentLayoutRow = {
  items: ContentLayoutItem[];
  usedSpan: number;
  /** Uniform span for items in this row (derived from row length). */
  span: 4 | 6 | 12;
};

/* ------------------------------------------------------------------ */
/*  Legacy span-based row derivation                                   */
/* ------------------------------------------------------------------ */

/**
 * Derive visual rows from a flat ordered list of content layout items
 * using the span-based algorithm.
 *
 * Rules (from content-layout-policy):
 *  - CONTENT_LAYOUT_COLUMNS-column logical grid.
 *  - Maximum CONTENT_LAYOUT_MAX_ITEMS_PER_ROW items per row.
 *  - A row starts with the first item and accumulates items in order.
 *  - If the next item doesn't fit, start a new row.
 *  - Item order is preserved exactly.
 *  - Input is never mutated.
 *  - Empty input returns [].
 */
export function deriveContentLayoutRows(
  items: ContentLayoutItem[],
): ContentLayoutRow[] {
  if (!items.length) return [];

  const rows: ContentLayoutRow[] = [];
  let currentItems: ContentLayoutItem[] = [];
  let currentSpan = 0;

  for (const item of items) {
    const fits = canFitContentLayoutItem({
      usedSpan: currentSpan,
      itemCount: currentItems.length,
      nextSpan: item.span,
    });

    if (!fits && currentItems.length > 0) {
      rows.push({ items: currentItems, usedSpan: currentSpan, span: balancedRowSpan(currentItems.length) });
      currentItems = [];
      currentSpan = 0;
    }

    currentItems.push(item);
    currentSpan += item.span;
  }

  if (currentItems.length > 0) {
    rows.push({ items: currentItems, usedSpan: currentSpan, span: balancedRowSpan(currentItems.length) });
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/*  Explicit row-break detection                                       */
/* ------------------------------------------------------------------ */

/**
 * Returns true if any item in the layout has `rowBreakBefore: true`.
 */
export function hasExplicitRowBreaks(items: ContentLayoutItem[]): boolean {
  return items.some((item) => item.rowBreakBefore === true);
}

/* ------------------------------------------------------------------ */
/*  Explicit row-break derivation                                      */
/* ------------------------------------------------------------------ */

/**
 * Derive rows from explicit `rowBreakBefore` markers.
 *
 * Rules:
 *  - Each item with `rowBreakBefore: true` starts a new row
 *    (except the first item, whose break is ignored).
 *  - Consecutive items without breaks accumulate in the current row.
 *  - If a segment exceeds 3 items, it is split into sub-rows of 3
 *    (with the remainder in the final sub-row).
 *  - Item order is preserved exactly.
 *  - Input is never mutated.
 *  - Returns empty array when no explicit breaks exist
 *    (caller should fall back to legacy balanced derivation).
 */
export function deriveExplicitRows(items: ContentLayoutItem[]): ContentLayoutRow[] {
  if (!items.length) return [];

  // Check if any explicit breaks exist
  if (!hasExplicitRowBreaks(items)) return [];

  // Group items by break markers
  const segments: ContentLayoutItem[][] = [];
  let currentSegment: ContentLayoutItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // First item always starts segment 0 (ignore its break)
    if (i > 0 && item.rowBreakBefore === true) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
      }
      currentSegment = [];
    }
    currentSegment.push(item);
  }
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  // Split segments exceeding max 3 items
  const rows: ContentLayoutRow[] = [];
  for (const segment of segments) {
    for (let offset = 0; offset < segment.length; offset += CONTENT_LAYOUT_MAX_ITEMS_PER_ROW) {
      const chunk = segment.slice(offset, offset + CONTENT_LAYOUT_MAX_ITEMS_PER_ROW);
      rows.push({
        items: chunk,
        usedSpan: chunk.reduce((sum, item) => sum + item.span, 0),
        span: balancedRowSpan(chunk.length),
      });
    }
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/*  Unified row derivation                                             */
/* ------------------------------------------------------------------ */

/**
 * Derive visual rows from a flat ordered list of content layout items.
 *
 * Dispatch strategy:
 *  - If any item has `rowBreakBefore: true`, use explicit row-break derivation.
 *  - Otherwise, fall back to the legacy balanced derivation.
 *
 * This is the single entry point that both EditableContentLayout and
 * ContentLayoutGrid should use.
 */
export function deriveLayoutRows(items: ContentLayoutItem[]): ContentLayoutRow[] {
  if (hasExplicitRowBreaks(items)) {
    return deriveExplicitRows(items);
  }
  return deriveContentLayoutRows(items);
}
