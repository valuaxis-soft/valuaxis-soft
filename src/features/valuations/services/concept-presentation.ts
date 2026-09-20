/**
 * Concept presentation configuration.
 *
 * Owned by the content container (Block or SubBlock/Apartado) or
 * individually by ContentLayoutColumnV2 cells.
 *
 * Controls the label/value alignment guide in Preview rendering.
 * The guide is a FIXED document-space pixel distance from the left edge
 * of the Concept cell. This ensures stability when cell width changes
 * (e.g. adding/removing a sibling Concept in the same row).
 *
 * Custom mode stores an OFFSET from the canonical default (120px).
 * effectiveGuidePx = DEFAULT_GUIDE_PX + offsetPx.
 *
 * Cascade: cell custom → container custom → canonical default (120px).
 *
 * Legacy valuations with undefined configuration use the canonical default.
 * Old percentage-based and absolute-px metadata are safely converted on read.
 */

/** Presentation mode: absent = default, custom = offset from default. */
export type ConceptPresentation = {
  mode?: "custom";
  /** Offset in px from DEFAULT_GUIDE_PX. Positive = rightward. */
  labelGuideOffsetPx?: number;
};

/* ── Canonical constants ────────────────────────────────────────── */

/**
 * Default guide position in document-space pixels.
 *
 * Derived from the original theme grid minimum label column width:
 * minmax(120px, 0.9fr) established 120px as the natural label boundary.
 * This produces a balanced label/value split in 2-column rows.
 */
export const DEFAULT_GUIDE_PX = 120;

/** Minimum offset from default (0 = default position). */
export const MIN_OFFSET_PX = 0;

/**
 * Maximum offset from default.
 * Derived from MAX absolute guide (260px) - DEFAULT (120px) = 140px.
 */
export const MAX_OFFSET_PX = 140;

/* ── Legacy constants (for backward compat) ──────────────────────── */

/** Canonical page content width used for legacy % → px conversion. */
const LEGACY_PAGE_CONTENT_WIDTH = 690;

/* ── Resolver ────────────────────────────────────────────────────── */

/**
 * Resolve the effective label guide position in document-space pixels.
 *
 * - undefined / no mode → DEFAULT_GUIDE_PX (120)
 * - mode=custom, offset present → DEFAULT_GUIDE_PX + offset, clamped
 * - mode=custom, offset missing → DEFAULT_GUIDE_PX
 * - legacy absolute px (labelGuidePx) → converted to offset
 * - legacy percentage → converted to absolute px, then to offset
 * - malformed → DEFAULT_GUIDE_PX
 */
export function resolveConceptLabelGuide(presentation: ConceptPresentation | undefined): number {
  if (!presentation) return DEFAULT_GUIDE_PX;

  // New model: mode=custom with offset
  if (presentation.mode === "custom") {
    const offset = presentation.labelGuideOffsetPx;
    if (typeof offset === "number" && Number.isFinite(offset)) {
      const clamped = Math.min(MAX_OFFSET_PX, Math.max(MIN_OFFSET_PX, Math.round(offset)));
      return DEFAULT_GUIDE_PX + clamped;
    }
    return DEFAULT_GUIDE_PX;
  }

  // Legacy V3: mode=custom with absolute labelGuidePx → convert to offset
  // @ts-expect-error — legacy field check
  if (presentation.labelGuidePx != null) {
    // @ts-expect-error — legacy field check
    const absolutePx = presentation.labelGuidePx;
    if (typeof absolutePx === "number" && Number.isFinite(absolutePx)) {
      const offset = absolutePx - DEFAULT_GUIDE_PX;
      const clamped = Math.min(MAX_OFFSET_PX, Math.max(MIN_OFFSET_PX, Math.round(offset)));
      return DEFAULT_GUIDE_PX + clamped;
    }
    return DEFAULT_GUIDE_PX;
  }

  // Legacy model: labelGuidePreset + labelGuidePercent
  // @ts-expect-error — legacy field check
  const preset = presentation.labelGuidePreset;
  if (preset === "custom") {
    // @ts-expect-error — legacy field check
    const rawPercent = presentation.labelGuidePercent;
    if (typeof rawPercent === "number" && Number.isFinite(rawPercent)) {
      const absolutePx = Math.round(LEGACY_PAGE_CONTENT_WIDTH * (rawPercent / 100));
      const offset = absolutePx - DEFAULT_GUIDE_PX;
      const clamped = Math.min(MAX_OFFSET_PX, Math.max(MIN_OFFSET_PX, Math.round(offset)));
      return DEFAULT_GUIDE_PX + clamped;
    }
    return DEFAULT_GUIDE_PX;
  }

  // Legacy preset (compact/normal/wide) → convert to absolute px, then offset
  const legacyPxMap: Record<string, number> = {
    compact: Math.round(LEGACY_PAGE_CONTENT_WIDTH * 0.36),
    normal: Math.round(LEGACY_PAGE_CONTENT_WIDTH * 0.42),
    wide: Math.round(LEGACY_PAGE_CONTENT_WIDTH * 0.48),
  };
  if (typeof preset === "string" && preset in legacyPxMap) {
    const absolutePx = legacyPxMap[preset];
    const offset = absolutePx - DEFAULT_GUIDE_PX;
    const clamped = Math.min(MAX_OFFSET_PX, Math.max(MIN_OFFSET_PX, Math.round(offset)));
    return DEFAULT_GUIDE_PX + clamped;
  }

  return DEFAULT_GUIDE_PX;
}

/**
 * Resolve the effective label guide for a specific content layout cell.
 *
 * Cascade: cell custom → container custom → canonical default.
 *
 * @param cellPresentation - Optional per-cell override from ContentLayoutColumnV2
 * @param containerPresentation - Container-level default from Block/SubBlock
 */
export function resolveCellConceptGuide(
  cellPresentation: ConceptPresentation | undefined,
  containerPresentation: ConceptPresentation | undefined,
): number {
  // Cell custom override wins — but only if it has a valid offset
  if (cellPresentation?.mode === "custom" && typeof cellPresentation.labelGuideOffsetPx === "number" && Number.isFinite(cellPresentation.labelGuideOffsetPx)) {
    return resolveConceptLabelGuide(cellPresentation);
  }
  // Fall back to container default
  return resolveConceptLabelGuide(containerPresentation);
}

/**
 * Clamp a guide px value to the allowed range, accounting for cell width.
 * Returns the clamped value without mutating persisted state.
 */
export function clampGuidePx(guidePx: number, cellWidth: number): number {
  const minWidthForValue = 80; // minimum space for the value column
  const maxAllowed = Math.max(DEFAULT_GUIDE_PX, cellWidth - minWidthForValue);
  return Math.min(maxAllowed, Math.max(DEFAULT_GUIDE_PX, Math.round(guidePx)));
}

/* ── Cell presentation operations ────────────────────────────────── */

import type { ContentLayout } from "@/features/valuations/model";

/**
 * Update the conceptPresentation on a specific column in a ContentLayout.
 * Returns a new layout — never mutates input.
 */
export function setColumnPresentation(
  layout: ContentLayout,
  columnId: string,
  presentation: ConceptPresentation,
): ContentLayout {
  return {
    ...layout,
    rows: layout.rows.map((row) => ({
      ...row,
      columns: row.columns.map((col) =>
        col.id === columnId
          ? { ...col, conceptPresentation: presentation }
          : col,
      ),
    })),
  };
}

/**
 * Clear the conceptPresentation on a specific column (restore inheritance).
 * Returns a new layout — never mutates input.
 */
export function clearColumnPresentation(
  layout: ContentLayout,
  columnId: string,
): ContentLayout {
  return {
    ...layout,
    rows: layout.rows.map((row) => ({
      ...row,
      columns: row.columns.map((col) => {
        if (col.id !== columnId) return col;
        const { conceptPresentation: _, ...rest } = col;
        return rest;
      }),
    })),
  };
}

/**
 * Find the column ID that contains a specific item (concept/image/table).
 * Returns undefined if not found.
 */
export function findColumnIdForItem(
  layout: ContentLayout,
  itemId: string,
): string | undefined {
  for (const row of layout.rows) {
    for (const col of row.columns) {
      if (col.items.some((ref) => ref.id === itemId)) {
        return col.id;
      }
    }
  }
  return undefined;
}

/**
 * Clear conceptPresentation from all Concept cells in a ContentLayout.
 *
 * Only clears columns whose first item is type="concept".
 * Preserves Image/Table column metadata, row/column IDs, items, and ordering.
 * Returns a new layout — never mutates input.
 */
export function clearConceptCellPresentations(
  layout: ContentLayout,
  conceptIds: Set<string>,
): ContentLayout {
  return {
    ...layout,
    rows: layout.rows.map((row) => ({
      ...row,
      columns: row.columns.map((col) => {
        // Only clear columns that contain a Concept item
        const hasConcept = col.items.some((ref) => ref.type === "concept" && conceptIds.has(ref.id));
        if (!hasConcept || !col.conceptPresentation) return col;
        const { conceptPresentation: _, ...rest } = col;
        return rest;
      }),
    })),
  };
}
