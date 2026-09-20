import type { ContentLayoutItemType } from "../model";

/* ------------------------------------------------------------------ */
/*  Grid constants                                                    */
/* ------------------------------------------------------------------ */

/** Number of columns in the logical layout grid. */
export const CONTENT_LAYOUT_COLUMNS = 12;

/** Maximum number of items allowed in a single row. */
export const CONTENT_LAYOUT_MAX_ITEMS_PER_ROW = 3;

/** Set of all valid span values for a content layout item. */
export const CONTENT_LAYOUT_SPANS = [4, 6, 8, 12] as const;

/** Union type of all valid content layout spans. */
export type ContentLayoutSpan = (typeof CONTENT_LAYOUT_SPANS)[number];

/* ------------------------------------------------------------------ */
/*  Span validation                                                   */
/* ------------------------------------------------------------------ */

/** Type guard: returns true if `span` is one of the allowed values. */
export function isValidContentLayoutSpan(span: unknown): span is ContentLayoutSpan {
  return span === 4 || span === 6 || span === 8 || span === 12;
}

/* ------------------------------------------------------------------ */
/*  Fit check                                                         */
/* ------------------------------------------------------------------ */

/**
 * Check whether the next item can be placed in the current row
 * without exceeding the grid column limit or the per-row item cap.
 */
export function canFitContentLayoutItem({
  usedSpan,
  itemCount,
  nextSpan,
}: {
  usedSpan: number;
  itemCount: number;
  nextSpan: number;
}): boolean {
  return (
    itemCount < CONTENT_LAYOUT_MAX_ITEMS_PER_ROW &&
    usedSpan + nextSpan <= CONTENT_LAYOUT_COLUMNS
  );
}

/* ------------------------------------------------------------------ */
/*  Default span mapping (legacy layout generation)                   */
/* ------------------------------------------------------------------ */

type ConceptLayoutSpan = "full" | "half";
type ImageLayoutWidth = "normal" | "wide" | "full";

/** Default span for a concept given its layoutSpan metadata. */
export function defaultConceptSpan(layoutSpan?: ConceptLayoutSpan): 6 | 12 {
  return layoutSpan === "full" ? 12 : 6;
}

/** Default span for an image given its layoutWidth metadata. */
export function defaultImageSpan(layoutWidth?: ImageLayoutWidth): 8 | 12 {
  if (layoutWidth === "full") return 12;
  // Both "normal" (70%) and "wide" (88%) map to span 8.
  // Fine-grained width is controlled by layoutWidthPercent at render time.
  return 8;
}

/** Default span for a table (always full-width). */
export function defaultTableSpan(): 12 {
  return 12;
}

/**
 * Compute the default span for any content type based on its metadata.
 *
 * This is the single source of truth for legacy span mappings.
 * Consumers (editor, preview, PDF) should use this instead of
 * duplicating the numeric rules.
 */
export function defaultSpan(
  type: ContentLayoutItemType,
  metadata?: { layoutSpan?: ConceptLayoutSpan; layoutWidth?: ImageLayoutWidth },
): 4 | 6 | 8 | 12 {
  if (type === "concept") return defaultConceptSpan(metadata?.layoutSpan);
  if (type === "image") return defaultImageSpan(metadata?.layoutWidth);
  return defaultTableSpan();
}
