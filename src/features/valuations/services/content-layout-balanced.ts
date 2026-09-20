import { CONTENT_LAYOUT_MAX_ITEMS_PER_ROW } from "./content-layout-policy";

/* ------------------------------------------------------------------ */
/*  Balanced row distribution                                         */
/* ------------------------------------------------------------------ */

/**
 * Compute balanced row sizes for N items.
 *
 * Rules:
 *  - Maximum `maxPerRow` items per row (default 3).
 *  - Rows are as even as possible (difference ≤ 1).
 *  - No single-item tail row: if the last row would have 1 item,
 *    redistribute from the previous row to produce two rows of 2.
 *  - Item order is preserved by the caller — this function only
 *    determines how many items go in each row.
 *
 * Examples:
 *  0 → []
 *  1 → [1]
 *  2 → [2]
 *  3 → [3]
 *  4 → [2, 2]          (not [3, 1])
 *  5 → [3, 2]
 *  6 → [3, 3]
 *  7 → [3, 2, 2]       (not [3, 3, 1])
 *  8 → [3, 3, 2]
 *  9 → [3, 3, 3]
 * 10 → [3, 3, 2, 2]    (not [3, 3, 3, 1])
 * 11 → [3, 3, 3, 2]
 * 12 → [3, 3, 3, 3]
 *
 * Never mutates inputs. Pure function.
 */
export function computeBalancedRowSizes(
  itemCount: number,
  maxPerRow: number = CONTENT_LAYOUT_MAX_ITEMS_PER_ROW,
): number[] {
  if (itemCount <= 0) return [];
  if (itemCount <= maxPerRow) return [itemCount];

  const baseRowSize = maxPerRow;
  const fullRows = Math.floor(itemCount / baseRowSize);
  const remainder = itemCount % baseRowSize;

  const rows: number[] = [];

  // Fill complete rows of maxPerRow
  for (let i = 0; i < fullRows; i++) {
    rows.push(baseRowSize);
  }

  // Distribute remainder
  if (remainder > 0) {
    rows.push(remainder);
  }

  // Rebalance: if last row has only 1 item, steal from previous row
  if (rows.length >= 2 && rows[rows.length - 1] === 1) {
    rows.pop();
    rows[rows.length - 1] -= 1;
    rows.push(2);
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/*  Span assignment for balanced rows                                  */
/* ------------------------------------------------------------------ */

/**
 * Given the number of items in a row, compute the uniform span
 * for each item so that items fill the 12-column grid evenly.
 *
 * 1 item  → span 12
 * 2 items → span 6 each
 * 3 items → span 4 each
 *
 * These are all valid ContentLayoutSpan values (4, 6, 12).
 * Never mutates inputs. Pure function.
 */
export function balancedRowSpan(itemsInRow: number): 4 | 6 | 12 {
  if (itemsInRow <= 1) return 12;
  if (itemsInRow === 2) return 6;
  return 4;
}
