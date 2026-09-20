import type {
  Block,
  ContentLayoutColumnV2,
  ContentLayoutItem,
  ContentLayoutItemRef,
  ContentLayoutPersisted,
  ContentLayoutRowV2,
  ContentLayout,
  Apartado,
} from "../model";
import { resolveContentLayout as resolveContentLayoutLegacy } from "./content-layout-legacy";
import { deriveLayoutRows } from "./content-layout-rows";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Maximum number of columns allowed per row. */
export const CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW = 3;

/* ------------------------------------------------------------------ */
/*  Column ID repair                                                   */
/* ------------------------------------------------------------------ */

/**
 * Ensure all column IDs within a row are unique.
 *
 * If two columns share the same `id`, the first keeps its original ID
 * and later duplicates receive deterministic collision-free IDs derived
 * from their position. All business content (items) is preserved.
 *
 * Never mutates input. Deterministic: same input → same output.
 */
function ensureUniqueColumnIds(
  columns: ContentLayoutColumnV2[],
): ContentLayoutColumnV2[] {
  const usedIds = new Set<string>();
  const result: ContentLayoutColumnV2[] = [];

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (!usedIds.has(col.id)) {
      usedIds.add(col.id);
      result.push(col);
    } else {
      let candidate = `${col.id}-dup-${i}`;
      let attempt = 1;
      while (usedIds.has(candidate)) {
        candidate = `${col.id}-dup-${i}-${attempt}`;
        attempt++;
      }
      usedIds.add(candidate);
      result.push({ ...col, id: candidate });
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Type guard                                                         */
/* ------------------------------------------------------------------ */

/**
 * Type guard: returns true if `value` is a structurally plausible ContentLayout.
 *
 * Checks the overall shape:
 *  - `value` is a non-null object
 *  - `version` is exactly `2`
 *  - `rows` is an array
 *  - Each row is an object with `columns` array
 *  - Each column is an object with `items` array
 *
 * Does NOT enforce:
 *  - non-empty ids (normalization handles that)
 *  - max-columns (normalization handles that)
 *  - valid ref types (normalization handles that)
 *
 * This is a shape detector, not a strict validator. Use
 * normalizeContentLayout for full validation and cleanup.
 */
export function isContentLayout(value: unknown): value is ContentLayout {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  if (obj.version !== 2) return false;
  if (!Array.isArray(obj.rows)) return false;

  for (const row of obj.rows) {
    if (!row || typeof row !== "object") return false;
    const r = row as Record<string, unknown>;
    if (!Array.isArray(r.columns)) return false;

    for (const col of r.columns) {
      if (!col || typeof col !== "object") return false;
      const c = col as Record<string, unknown>;
      if (!Array.isArray(c.items)) return false;
    }
  }

  return true;
}

/* ------------------------------------------------------------------ */
/*  Deterministic ID strategy                                          */
/* ------------------------------------------------------------------ */

/**
 * Deterministic ID for a V2 row.
 *
 * Strategy: `r-{ rowIndex }` (0-indexed).
 *
 * - Deterministic: same input order → same row indices → same IDs.
 * - Collision-safe: each row gets a unique index.
 * - Generic: no section/block-specific information.
 * - Stable across repeated conversions of identical input.
 */
function deterministicRowId(rowIndex: number): string {
  return `r-${rowIndex}`;
}

/**
 * Deterministic ID for a V2 column.
 *
 * Strategy: `c-{ rowIndex }-{ colIndex }` (0-indexed).
 *
 * - Deterministic: same input order → same indices → same IDs.
 * - Collision-safe: (rowIndex, colIndex) pair is unique.
 * - Generic: no section/block-specific information.
 * - Stable across repeated conversions of identical input.
 */
function deterministicColumnId(rowIndex: number, colIndex: number): string {
  return `c-${rowIndex}-${colIndex}`;
}

/* ------------------------------------------------------------------ */
/*  Conversion: V1 → V2                                                */
/* ------------------------------------------------------------------ */

/** A container that owns separate concept/image/table arrays. */
type ContentContainer = Pick<Block | Apartado, "concepts" | "images" | "tables"> & {
  contentLayout?: ContentLayoutPersisted;
};

/**
 * Convert a V1 flat ContentLayoutItem[] to a V2 ContentLayout.
 *
 * The conversion preserves the CURRENT visible V1 layout exactly:
 *
 *  1. Reconciles the V1 layout against the container (removes stale refs,
 *     deduplicates, appends missing items).
 *  2. Derives visual rows using the existing V1 row derivation
 *     (respects explicit rowBreakBefore or balanced fallback).
 *  3. Each V1 visual row → one V2 Row.
 *  4. Each V1 item → one V2 Column containing `[{ type, id }]`.
 *  5. V1 `span` is ignored.
 *  6. `rowBreakBefore` is NOT copied into V2 (used only for row derivation).
 *  7. Mixed Concept/Image/Table order is preserved exactly.
 *  8. Empty container returns `{ version: 2, rows: [] }`.
 *
 * Row and column IDs are deterministic:
 *  - Row: `r-{rowIndex}`
 *  - Column: `c-{rowIndex}-{colIndex}`
 *
 * Never mutates the input container or layout.
 */
export function convertContentLayoutV1ToV2(
  container: ContentContainer,
  v1Layout?: ContentLayoutItem[],
): ContentLayout {
  // Build a container with the V1 layout attached for reconciliation.
  // Only override contentLayout when an explicit v1Layout is provided;
  // otherwise use the container's stored layout.
  const containerForReconcile = v1Layout !== undefined
    ? { ...container, contentLayout: v1Layout }
    : container;
  const reconciled = resolveContentLayoutLegacy(containerForReconcile);

  if (reconciled.length === 0) {
    return { version: 2, rows: [] };
  }

  // Derive V1 visual rows (respects explicit rowBreakBefore or balanced fallback)
  const v1Rows = deriveLayoutRows(reconciled);

  if (v1Rows.length === 0) {
    return { version: 2, rows: [] };
  }

  // Convert each V1 row → V2 row
  const rows: ContentLayoutRowV2[] = v1Rows.map((v1Row, rowIndex) => ({
    id: deterministicRowId(rowIndex),
    columns: v1Row.items.map((item, colIndex) => ({
      id: deterministicColumnId(rowIndex, colIndex),
      items: [{ type: item.type, id: item.id }],
    })),
  }));

  return { version: 2, rows };
}

/* ------------------------------------------------------------------ */
/*  Normalization                                                      */
/* ------------------------------------------------------------------ */

/**
 * Normalize a ContentLayout:
 *
 *  - Never mutates input.
 *  - Removes malformed rows (missing/empty id).
 *  - Removes malformed columns (missing/empty id).
 *  - Removes malformed item refs (missing type or id).
 *  - Removes duplicate content refs globally (keeps first occurrence).
 *  - Removes empty columns (after ref cleanup).
 *  - Removes empty rows (after column cleanup).
 *  - Enforces maximum CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW columns per row.
 *    Overflow columns are split into additional rows preserving order.
 *  - If a column contains multiple valid refs, keeps only the first
 *    (multi-item columns not yet implemented).
 */
export function normalizeContentLayout(layout: ContentLayout): ContentLayout {
  const seen = new Set<string>();
  const normalizedRows: ContentLayoutRowV2[] = [];

  for (const row of layout.rows) {
    // Validate row
    if (!row || typeof row !== "object") continue;
    if (typeof row.id !== "string" || !row.id) continue;
    if (!Array.isArray(row.columns)) continue;

    const normalizedColumns: ContentLayoutColumnV2[] = [];

    for (const col of row.columns) {
      // Validate column
      if (!col || typeof col !== "object") continue;
      if (typeof col.id !== "string" || !col.id) continue;
      if (!Array.isArray(col.items)) continue;

      // Validate and deduplicate item refs
      const validRefs: ContentLayoutItemRef[] = [];
      for (const ref of col.items) {
        if (!ref || typeof ref !== "object") continue;
        const r = ref as Record<string, unknown>;
        if (r.type !== "concept" && r.type !== "image" && r.type !== "table") continue;
        if (typeof r.id !== "string" || !r.id) continue;

        const refKey = `${r.type}:${r.id}`;
        if (seen.has(refKey)) continue; // duplicate globally
        seen.add(refKey);

        validRefs.push({ type: r.type as ContentLayoutItemRef["type"], id: r.id as string });
      }

      // Keep only first valid ref (multi-item columns not yet implemented)
      if (validRefs.length > 0) {
        normalizedColumns.push({
          id: col.id,
          items: [validRefs[0]],
          ...(col.conceptPresentation ? { conceptPresentation: col.conceptPresentation } : {}),
        });
      }
      // Empty column after cleanup → removed
    }

    // Enforce max columns per row — split overflow into additional rows
    if (normalizedColumns.length === 0) continue;

    // Repair any duplicate column IDs (preserves all business content)
    const repairedColumns = ensureUniqueColumnIds(normalizedColumns);

    const totalChunks = Math.ceil(repairedColumns.length / CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW);
    for (let offset = 0; offset < repairedColumns.length; offset += CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW) {
      const chunk = repairedColumns.slice(offset, offset + CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW);
      const chunkIdx = Math.floor(offset / CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW);
      const id = totalChunks === 1 ? row.id : `${row.id}-split-${chunkIdx}`;
      normalizedRows.push({ id, columns: chunk });
    }
  }

  return { version: 2, rows: normalizedRows };
}

/* ------------------------------------------------------------------ */
/*  V2 Reconciliation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Collect the IDs from the container's live content arrays into Sets.
 */
function buildLiveIdSets(container: ContentContainer) {
  return {
    conceptIds: new Set(container.concepts.map((c) => c.id)),
    tableIds: new Set(container.tables.map((t) => t.id)),
    imageIds: new Set(container.images.map((img) => img.id)),
  };
}

/**
 * Check whether a ref points to a live item in the container.
 */
function isRefLive(
  ref: ContentLayoutItemRef,
  live: { conceptIds: Set<string>; tableIds: Set<string>; imageIds: Set<string> },
): boolean {
  const idSet =
    ref.type === "concept" ? live.conceptIds : ref.type === "table" ? live.tableIds : live.imageIds;
  return idSet.has(ref.id);
}

/**
 * Reconcile a ContentLayout against the live container.
 *
 * Rules:
 *  - Remove stale refs (ID no longer in container's live arrays).
 *  - Remove duplicate refs globally (keep first occurrence).
 *  - Preserve existing row/column order for every surviving ref.
 *  - Remove empty columns (after ref cleanup).
 *  - Remove empty rows (after column cleanup).
 *  - Enforce max 3 columns per row (split overflow).
 *  - Do NOT destroy existing user row structure.
 *  - Never mutates the input.
 */
export function reconcileContentLayout(
  container: ContentContainer,
  layout: ContentLayout,
): ContentLayout {
  const live = buildLiveIdSets(container);
  const seen = new Set<string>();
  const reconciledRows: ContentLayoutRowV2[] = [];

  for (const row of layout.rows) {
    if (!row || typeof row !== "object") continue;
    if (typeof row.id !== "string" || !row.id) continue;
    if (!Array.isArray(row.columns)) continue;

    const reconciledColumns: ContentLayoutColumnV2[] = [];

    for (const col of row.columns) {
      if (!col || typeof col !== "object") continue;
      if (typeof col.id !== "string" || !col.id) continue;
      if (!Array.isArray(col.items)) continue;

      // Keep only valid, live, non-duplicate refs
      const validRefs: ContentLayoutItemRef[] = [];
      for (const ref of col.items) {
        if (!ref || typeof ref !== "object") continue;
        const r = ref as Record<string, unknown>;
        if (r.type !== "concept" && r.type !== "image" && r.type !== "table") continue;
        if (typeof r.id !== "string" || !r.id) continue;

        const typedRef: ContentLayoutItemRef = {
          type: r.type as ContentLayoutItemRef["type"],
          id: r.id as string,
        };

        const refKey = `${typedRef.type}:${typedRef.id}`;
        if (seen.has(refKey)) continue; // duplicate globally
        if (!isRefLive(typedRef, live)) continue; // stale

        seen.add(refKey);
        validRefs.push(typedRef);
      }

      // Keep only first valid ref (multi-item columns not yet implemented)
      if (validRefs.length > 0) {
        reconciledColumns.push({
          id: col.id,
          items: [validRefs[0]],
          ...(col.conceptPresentation ? { conceptPresentation: col.conceptPresentation } : {}),
        });
      }
    }

    // Enforce max columns per row — split overflow into additional rows
    if (reconciledColumns.length === 0) continue;

    // Repair any duplicate column IDs (preserves all business content)
    const repairedReconciledColumns = ensureUniqueColumnIds(reconciledColumns);

    const totalChunks = Math.ceil(repairedReconciledColumns.length / CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW);
    for (let offset = 0; offset < repairedReconciledColumns.length; offset += CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW) {
      const chunk = repairedReconciledColumns.slice(offset, offset + CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW);
      const chunkIdx = Math.floor(offset / CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW);
      // Only add split suffix when a row is actually split into multiple chunks
      const id = totalChunks === 1 ? row.id : `${row.id}-split-${chunkIdx}`;
      reconciledRows.push({ id, columns: chunk });
    }
  }

  return { version: 2, rows: reconciledRows };
}

/* ------------------------------------------------------------------ */
/*  Missing content detection                                          */
/* ------------------------------------------------------------------ */

/**
 * Collect live content refs from the container that are not referenced
 * in the given reconciled layout. Returns them in legacy type order:
 * concepts → tables → images.
 */
function collectMissingRefs(
  container: ContentContainer,
  referencedRefs: Set<string>,
): ContentLayoutItemRef[] {
  const missing: ContentLayoutItemRef[] = [];

  for (const concept of container.concepts) {
    const key = `concept:${concept.id}`;
    if (!referencedRefs.has(key)) {
      missing.push({ type: "concept", id: concept.id });
    }
  }
  for (const table of container.tables) {
    const key = `table:${table.id}`;
    if (!referencedRefs.has(key)) {
      missing.push({ type: "table", id: table.id });
    }
  }
  for (const image of container.images) {
    const key = `image:${image.id}`;
    if (!referencedRefs.has(key)) {
      missing.push({ type: "image", id: image.id });
    }
  }

  return missing;
}

/* ------------------------------------------------------------------ */
/*  Append missing content                                             */
/* ------------------------------------------------------------------ */

/**
 * Find the highest row index from existing `r-{n}` IDs.
 * Returns -1 if no rows exist or no IDs match the pattern.
 */
function findMaxRowIndex(rows: ContentLayoutRowV2[]): number {
  let max = -1;
  for (const row of rows) {
    const match = /^r-(\d+)$/.exec(row.id);
    if (match) {
      const idx = parseInt(match[1], 10);
      if (idx > max) max = idx;
    }
  }
  return max;
}

/**
 * Append missing live content to a reconciled V2 layout.
 *
 * Strategy:
 *  - For each missing ref (in legacy type order: concepts → tables → images):
 *    - If the last row has fewer than 3 columns, add a new column there.
 *    - Otherwise, create a new row with one column.
 *  - Preserves all existing row/column structure.
 *  - Generated IDs use an offset from the highest existing row index
 *    to avoid collisions with existing IDs.
 *  - Never mutates the input.
 */
export function appendMissingContentToV2(
  container: ContentContainer,
  layout: ContentLayout,
): ContentLayout {
  const live = buildLiveIdSets(container);

  // Collect all currently referenced refs
  const referencedRefs = new Set<string>();
  for (const row of layout.rows) {
    if (!row || !Array.isArray(row.columns)) continue;
    for (const col of row.columns) {
      if (!col || !Array.isArray(col.items)) continue;
      for (const ref of col.items) {
        if (ref && typeof ref === "object") {
          const r = ref as Record<string, unknown>;
          if (
            (r.type === "concept" || r.type === "image" || r.type === "table") &&
            typeof r.id === "string" && r.id
          ) {
            referencedRefs.add(`${r.type}:${r.id}`);
          }
        }
      }
    }
  }

  const missing = collectMissingRefs(container, referencedRefs);
  if (missing.length === 0) return layout;

  // Determine offset for new row IDs to avoid collisions
  const maxExistingRowIdx = findMaxRowIndex(layout.rows);
  let nextRowIdx = maxExistingRowIdx + 1;

  // Build new rows — start with a shallow copy
  const resultRows: ContentLayoutRowV2[] = layout.rows.map((row) => ({
    ...row,
    columns: row.columns.map((col) => ({
      ...col,
      items: [...col.items],
    })),
  }));

  for (const ref of missing) {
    // Check that the ref is actually live
    if (!isRefLive(ref, live)) continue;

    if (resultRows.length > 0) {
      const lastRow = resultRows[resultRows.length - 1];
      if (lastRow.columns.length < CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW) {
        // Fill last row — use the row's own index from resultRows, not length
        const lastRowIdx = resultRows.length - 1;
        lastRow.columns.push({
          id: deterministicColumnId(lastRowIdx, lastRow.columns.length),
          items: [ref],
        });
        continue;
      }
    }

    // Create new row — use nextRowIdx for both row ID and column ID
    const newRowRowIdx = nextRowIdx;
    const newRow: ContentLayoutRowV2 = {
      id: deterministicRowId(nextRowIdx++),
      columns: [
        {
          id: deterministicColumnId(newRowRowIdx, 0),
          items: [ref],
        },
      ],
    };
    resultRows.push(newRow);
  }

  return { version: 2, rows: resultRows };
}

/* ------------------------------------------------------------------ */
/*  Canonical resolver                                                 */
/* ------------------------------------------------------------------ */

/**
 * Resolve the content layout for a container, always returning a
 * normalized ContentLayout.
 *
 * Behavior:
 *  1. If container.contentLayout is valid V2:
 *     - Normalize it
 *     - Reconcile refs against the live container
 *     - Append any missing live content
 *  2. If container.contentLayout is V1:
 *     - Convert deterministically using convertContentLayoutV1ToV2()
 *  3. If container.contentLayout is missing:
 *     - Bootstrap from legacy arrays using the existing V1 visible behavior
 *     - Then convert to V2
 *
 * Always returns: { version: 2, rows: [...] }
 *
 * Preserves user row structure — does not rebuild existing layout.
 * Never mutates the input container or layout.
 */
export function resolveContentLayout(container: ContentContainer): ContentLayout {
  const { contentLayout } = container;

  // --- Path 3: missing layout → bootstrap from legacy arrays → convert ---
  if (contentLayout === undefined || contentLayout === null) {
    return convertContentLayoutV1ToV2(container);
  }

  // --- Path 2: V1 array → convert ---
  if (Array.isArray(contentLayout)) {
    if (contentLayout.length === 0) {
      return convertContentLayoutV1ToV2(container);
    }
    return convertContentLayoutV1ToV2(container, contentLayout);
  }

  // --- Path 1: V2 object → normalize, reconcile, append ---
  if (isContentLayout(contentLayout)) {
    const normalized = normalizeContentLayout(contentLayout);
    const reconciled = reconcileContentLayout(container, normalized);
    return appendMissingContentToV2(container, reconciled);
  }

  // --- Fallback: malformed → bootstrap from legacy ---
  return convertContentLayoutV1ToV2(container);
}

/**
 * Ensure a block has a persisted ContentLayout.
 *
 * When content is added to a block's concepts/images/tables arrays,
 * this function reconciles the ContentLayout against current business objects:
 * - removes stale refs for deleted items
 * - appends new rows for new items
 * - preserves existing row/column order and IDs
 *
 * Returns the updated block with contentLayout reconciled.
 */
export function ensureContentLayout(block: Block): Block {
  const layout = resolveContentLayout(block);
  return { ...block, contentLayout: layout };
}
