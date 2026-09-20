import type {
  Block,
  ContentLayoutItem,
  ContentLayoutPersisted,
  Apartado,
} from "../model";
import {
  defaultSpan,
  isValidContentLayoutSpan,
} from "./content-layout-policy";

/**
 * A container that owns separate concept/image/table arrays.
 * Matches the shape of Block and SubBlock.
 * contentLayout accepts both V1 (ContentLayoutItem[]) and V2 (ContentLayoutV2)
 * during the transition period. The runtime only processes V1 arrays.
 */
type ContentContainer = Pick<Block | Apartado, "concepts" | "images" | "tables"> & {
  contentLayout?: ContentLayoutPersisted;
};

/**
 * Generate an initial ordered layout from the legacy separate arrays.
 *
 * Legacy render order (from editor and preview):
 *   concepts → tables → images
 *
 * Every item receives a span based on its current layout metadata.
 * Items with `enabled === false` are included to preserve identity.
 */
export function generateContentLayout(container: ContentContainer): ContentLayoutItem[] {
  const items: ContentLayoutItem[] = [];

  for (const concept of container.concepts) {
    items.push({ type: "concept", id: concept.id, span: defaultSpan("concept", concept) });
  }
  for (const table of container.tables) {
    items.push({ type: "table", id: table.id, span: defaultSpan("table") });
  }
  for (const image of container.images) {
    items.push({ type: "image", id: image.id, span: defaultSpan("image", image) });
  }

  return items;
}

/**
 * Check whether a single layout item is structurally valid
 * (correct type, non-empty ID, valid span).
 */
function isLayoutItemValid(item: unknown): item is ContentLayoutItem {
  if (!item || typeof item !== "object") return false;
  const obj = item as Record<string, unknown>;
  if (obj.type !== "concept" && obj.type !== "image" && obj.type !== "table") return false;
  if (typeof obj.id !== "string" || !obj.id) return false;
  if (!isValidContentLayoutSpan(obj.span)) return false;
  return true;
}

/**
 * Parse the optional rowBreakBefore field from a stored layout item.
 * Only true is accepted; everything else is treated as absent.
 */
function parseRowBreakBefore(item: Record<string, unknown>): boolean | undefined {
  return item.rowBreakBefore === true ? true : undefined;
}

/**
 * Collect IDs from the container into Sets (built once per reconcile call).
 */
function buildIdSets(container: ContentContainer) {
  return {
    conceptIds: new Set(container.concepts.map((c) => c.id)),
    tableIds: new Set(container.tables.map((t) => t.id)),
    imageIds: new Set(container.images.map((img) => img.id)),
  };
}

/**
 * Collect items from the container that are missing from the given layout,
 * ordered by the legacy type sequence: concepts → tables → images.
 */
function collectMissingItems(
  container: ContentContainer,
  layoutIds: Set<string>,
): ContentLayoutItem[] {
  const missing: ContentLayoutItem[] = [];

  for (const concept of container.concepts) {
    if (!layoutIds.has(concept.id)) {
      missing.push({ type: "concept", id: concept.id, span: defaultSpan("concept", concept) });
    }
  }
  for (const table of container.tables) {
    if (!layoutIds.has(table.id)) {
      missing.push({ type: "table", id: table.id, span: defaultSpan("table") });
    }
  }
  for (const image of container.images) {
    if (!layoutIds.has(image.id)) {
      missing.push({ type: "image", id: image.id, span: defaultSpan("image", image) });
    }
  }

  return missing;
}

/**
 * Resolve the content layout for a container.
 *
 * Reconciliation behavior when `contentLayout` exists:
 *  1. Keep every valid, unique item in its existing order.
 *  2. Remove stale references (ID no longer in container).
 *  3. Remove duplicates (keep first occurrence).
 *  4. Detect container items missing from the layout.
 *  5. Append missing items in legacy type order: concepts → tables → images.
 *
 * If no `contentLayout` exists, generates the full legacy layout.
 * If the container has no content, returns an empty array.
 * Never mutates the input container or layout.
 */
export function resolveContentLayout(container: ContentContainer): ContentLayoutItem[] {
  // No custom layout → generate full legacy layout
  if (!container.contentLayout) {
    return generateContentLayout(container);
  }

  // V2 layout passed — editor doesn't handle V2 yet, fall back to legacy generation.
  // This is a transitional path; V2 rendering will be added in a future phase.
  if (!Array.isArray(container.contentLayout)) {
    return generateContentLayout(container);
  }

  const layout = container.contentLayout;
  if (layout.length === 0) {
    return generateContentLayout(container);
  }

  const { conceptIds, tableIds, imageIds } = buildIdSets(container);

  const seen = new Set<string>();
  const reconciled: ContentLayoutItem[] = [];

  // Pass 1: keep valid, unique items in original order
  for (const item of layout) {
    if (!isLayoutItemValid(item)) continue;
    if (seen.has(item.id)) continue; // duplicate
    seen.add(item.id);

    const idSet =
      item.type === "concept" ? conceptIds : item.type === "table" ? tableIds : imageIds;
    if (!idSet.has(item.id)) continue; // stale reference

    // Preserve rowBreakBefore metadata from stored layout
    const rowBreakBefore = parseRowBreakBefore(item as Record<string, unknown>);
    reconciled.push(rowBreakBefore !== undefined ? { ...item, rowBreakBefore } : item);
  }

  // Pass 2: append missing items in legacy type order
  const missing = collectMissingItems(container, seen);
  if (missing.length > 0) {
    reconciled.push(...missing);
  }

  return reconciled;
}

/**
 * Remove references from `contentLayout` whose IDs no longer exist
 * in the container's concepts/images/tables arrays.
 *
 * Returns a new array; the input is never mutated.
 * Returns `undefined` when the layout becomes empty after sanitization.
 */
export function sanitizeContentLayout(
  container: ContentContainer,
  layout: ContentLayoutItem[] | undefined,
): ContentLayoutItem[] | undefined {
  if (!layout) return undefined;

  const { conceptIds, tableIds, imageIds } = buildIdSets(container);

  const sanitized = layout.filter((item) => {
    const idSet =
      item.type === "concept" ? conceptIds : item.type === "table" ? tableIds : imageIds;
    return idSet.has(item.id);
  });

  return sanitized.length > 0 ? sanitized : undefined;
}
