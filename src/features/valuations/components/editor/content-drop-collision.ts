/**
 * Which drop slot a content drag is pointing at.
 *
 * While a Concept/Image/Table is dragged the editor shows every position it
 * can go to as a slot. The pointer does not have to be exactly on a slot:
 * anywhere over the content, the closest row slot is the destination, so a
 * drop always lands where the highlight was.
 *
 * Pure geometry — no drag library, no DOM.
 */

export type DropSlotRect = { top: number; left: number; width: number; height: number };

export type DropSlotCandidate = {
  id: string;
  rect: DropSlotRect;
  /**
   * - "row": a horizontal slot between rows (a new row).
   * - "column": a vertical slot beside a column (same row).
   * - "area": a whole empty container.
   */
  axis: "row" | "column" | "area";
};

/**
 * Another column of the row the dragged item is in. Dropping onto it means
 * "go to its other side", which is the slot `slotId`.
 */
export type DropSlotSibling = { rect: DropSlotRect; slotId: string };

/** How far outside the slots the pointer may be and still snap to one. */
const SNAP_MARGIN_PX = 24;

function contains(rect: DropSlotRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

/** Distance from a point to a rectangle (0 when inside). */
function distanceToRect(rect: DropSlotRect, x: number, y: number): number {
  const dx = Math.max(rect.left - x, 0, x - (rect.left + rect.width));
  const dy = Math.max(rect.top - y, 0, y - (rect.top + rect.height));
  return Math.hypot(dx, dy);
}

/** Distance from the pointer to the line the slot draws: horizontal for rows, vertical for columns. */
function distanceToSlotLine(candidate: DropSlotCandidate, x: number, y: number): number {
  const { rect } = candidate;
  return candidate.axis === "column"
    ? Math.abs(x - (rect.left + rect.width / 2))
    : Math.abs(y - (rect.top + rect.height / 2));
}

/**
 * Pick the slot the pointer is aiming at, or null when it aims at none.
 *
 * 1. A row or column slot under the pointer wins; when two overlap (a corner),
 *    the one whose line is closer.
 * 2. Otherwise, over a column that shares the item's row (`siblings`), the
 *    slot on that column's far side: the two swap places.
 * 3. Otherwise, over the dragged item's own place (`home`), nothing: letting
 *    go there leaves the item where it was.
 * 4. Otherwise an empty container under the pointer.
 * 5. Otherwise the closest ROW slot, as long as the pointer is still around
 *    the content. Column slots are never snapped to: putting two items side
 *    by side has to be deliberate.
 */
export function pickContentDropSlot(
  pointer: { x: number; y: number },
  candidates: DropSlotCandidate[],
  home?: DropSlotRect | null,
  siblings: DropSlotSibling[] = [],
): string | null {
  const { x, y } = pointer;

  let best: DropSlotCandidate | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (candidate.axis === "area" || !contains(candidate.rect, x, y)) continue;
    const distance = distanceToSlotLine(candidate, x, y);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  if (best) return best.id;

  const sibling = siblings.find((item) => contains(item.rect, x, y));
  if (sibling) return sibling.slotId;

  if (home && contains(home, x, y)) return null;

  const area = candidates.find((candidate) => candidate.axis === "area" && contains(candidate.rect, x, y));
  if (area) return area.id;

  for (const candidate of candidates) {
    if (candidate.axis === "column") continue;
    const distance = distanceToRect(candidate.rect, x, y);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  if (!best) return null;

  // Snap only while the pointer is over (or just beside) the content.
  let top = Infinity;
  let left = Infinity;
  let bottom = -Infinity;
  let right = -Infinity;
  for (const { rect } of candidates) {
    top = Math.min(top, rect.top);
    left = Math.min(left, rect.left);
    bottom = Math.max(bottom, rect.top + rect.height);
    right = Math.max(right, rect.left + rect.width);
  }
  const isAroundContent =
    x >= left - SNAP_MARGIN_PX && x <= right + SNAP_MARGIN_PX &&
    y >= top - SNAP_MARGIN_PX && y <= bottom + SNAP_MARGIN_PX;

  return isAroundContent ? best.id : null;
}
