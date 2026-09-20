/**
 * Canonical container-scoped DnD registration IDs.
 *
 * ContentLayoutV2 domain row/column IDs (r-0, c-0-0) are deterministic
 * and position-based — the same IDs exist independently in Block,
 * Apartado A, and Apartado B. dnd-kit requires unique registration IDs
 * within one DndContext.
 *
 * This module provides scoped ID builders that prefix domain IDs with
 * container identity, ensuring uniqueness across all containers sharing
 * a single BlockFlowRenderer DndContext.
 *
 * RULE: DnD registration identity ≠ domain identity.
 * - useSortable / useDroppable IDs → scoped
 * - active.data.current.columnId / over.data.current.columnId → domain
 * - active.data.current.itemId → business UUID
 */

/* ------------------------------------------------------------------ */
/*  Container reference type (matches content-transfer.ts)             */
/* ------------------------------------------------------------------ */

export type ContentContainerRef =
  | { kind: "block"; blockId: string }
  | { kind: "apartado"; blockId: string; apartadoId: string };

/* ------------------------------------------------------------------ */
/*  Scoped sortable ID (for useSortable)                               */
/* ------------------------------------------------------------------ */

/**
 * Build a globally unique sortable ID for a content column inside
 * a shared DndContext.
 *
 * Format:
 *   block::    {blockId}::{columnId}
 *   apartado:: {blockId}::{apartadoId}::{columnId}
 */
export function buildContentColumnDndId(
  containerRef: ContentContainerRef,
  columnId: string,
): string {
  if (containerRef.kind === "block") {
    return `content::block::${containerRef.blockId}::${columnId}`;
  }
  return `content::apartado::${containerRef.blockId}::${containerRef.apartadoId}::${columnId}`;
}

/* ------------------------------------------------------------------ */
/*  Scoped drop zone IDs (for useDroppable)                            */
/* ------------------------------------------------------------------ */

/**
 * Build a globally unique drop zone ID for column LEFT/RIGHT targeting.
 *
 * Format:
 *   drop-col::block::    {blockId}::{columnId}::{intent}
 *   drop-col::apartado:: {blockId}::{apartadoId}::{columnId}::{intent}
 */
export function buildContentColumnDropDndId(
  containerRef: ContentContainerRef,
  columnId: string,
  intent: "left" | "right",
): string {
  if (containerRef.kind === "block") {
    return `drop-col::block::${containerRef.blockId}::${columnId}::${intent}`;
  }
  return `drop-col::apartado::${containerRef.blockId}::${containerRef.apartadoId}::${columnId}::${intent}`;
}

/**
 * Build a globally unique drop zone ID for row BELOW targeting.
 *
 * Format:
 *   drop-row::block::    {blockId}::{rowId}::below
 *   drop-row::apartado:: {blockId}::{apartadoId}::{rowId}::below
 */
export function buildContentRowDropDndId(
  containerRef: ContentContainerRef,
  rowId: string,
): string {
  if (containerRef.kind === "block") {
    return `drop-row::block::${containerRef.blockId}::${rowId}::below`;
  }
  return `drop-row::apartado::${containerRef.blockId}::${containerRef.apartadoId}::${rowId}::below`;
}

/* ------------------------------------------------------------------ */
/*  Parse helpers — extract domain IDs from scoped IDs                 */
/* ------------------------------------------------------------------ */

/**
 * Check if a DnD ID is a scoped content sortable column.
 */
export function isScopedContentColumnId(id: string): boolean {
  return id.startsWith("content::block::") || id.startsWith("content::apartado::");
}

/**
 * Check if a DnD ID is a scoped content column drop zone.
 */
export function isScopedContentDropId(id: string): boolean {
  return id.startsWith("drop-col::");
}

/**
 * Check if a DnD ID is a scoped content row drop zone.
 */
export function isScopedContentRowDropId(id: string): boolean {
  return id.startsWith("drop-row::");
}

/**
 * Extract the domain column ID from a scoped sortable or drop zone ID.
 * Returns the domain column ID (e.g., "c-0-0") or null if not a scoped ID.
 *
 * Scoped format: content::{kind}::{ids}::{columnId}
 *   or:          drop-col::{kind}::{ids}::{columnId}::{intent}
 */
export function extractDomainColumnIdFromScoped(id: string): string | null {
  // Sortable: content::block::blockId::columnId  or  content::apartado::blockId::apartadoId::columnId
  if (id.startsWith("content::block::")) {
    // content::block::{blockId}::{columnId}
    const rest = id.slice("content::block::".length);
    const parts = rest.split("::");
    return parts.length >= 2 ? parts[parts.length - 1] : null;
  }
  if (id.startsWith("content::apartado::")) {
    // content::apartado::{blockId}::{apartadoId}::{columnId}
    const rest = id.slice("content::apartado::".length);
    const parts = rest.split("::");
    return parts.length >= 3 ? parts[parts.length - 1] : null;
  }

  // Drop zone: drop-col::block::blockId::columnId::left
  if (id.startsWith("drop-col::block::")) {
    const rest = id.slice("drop-col::block::".length);
    const parts = rest.split("::");
    // parts: [blockId, columnId, intent]
    return parts.length >= 3 ? parts[1] : null;
  }
  if (id.startsWith("drop-col::apartado::")) {
    const rest = id.slice("drop-col::apartado::".length);
    const parts = rest.split("::");
    // parts: [blockId, apartadoId, columnId, intent]
    return parts.length >= 4 ? parts[2] : null;
  }

  // Row drop: drop-row::block::blockId::rowId::below
  // This returns rowId, not columnId — use extractDomainRowIdFromScoped for rows
  return null;
}

/**
 * Extract the domain row ID from a scoped row drop zone ID.
 */
export function extractDomainRowIdFromScoped(id: string): string | null {
  if (id.startsWith("drop-row::block::")) {
    const rest = id.slice("drop-row::block::".length);
    const parts = rest.split("::");
    // parts: [blockId, rowId, "below"]
    return parts.length >= 3 ? parts[1] : null;
  }
  if (id.startsWith("drop-row::apartado::")) {
    const rest = id.slice("drop-row::apartado::".length);
    const parts = rest.split("::");
    // parts: [blockId, apartadoId, rowId, "below"]
    return parts.length >= 4 ? parts[2] : null;
  }
  return null;
}

/**
 * Extract the drop zone intent (left/right) from a scoped column drop ID.
 */
export function extractDropIntentFromScoped(id: string): "left" | "right" | null {
  if (id.endsWith("::left")) return "left";
  if (id.endsWith("::right")) return "right";
  return null;
}

/**
 * Extract the container ref from a scoped sortable or drop zone ID.
 * Returns the container ref or null if not a scoped content ID.
 */
export function extractContainerFromScopedId(id: string): ContentContainerRef | null {
  if (id.startsWith("content::block::")) {
    const rest = id.slice("content::block::".length);
    const blockId = rest.split("::")[0];
    return blockId ? { kind: "block", blockId } : null;
  }
  if (id.startsWith("content::apartado::")) {
    const rest = id.slice("content::apartado::".length);
    const parts = rest.split("::");
    return parts.length >= 2
      ? { kind: "apartado", blockId: parts[0], apartadoId: parts[1] }
      : null;
  }
  if (id.startsWith("drop-col::block::")) {
    const rest = id.slice("drop-col::block::".length);
    const blockId = rest.split("::")[0];
    return blockId ? { kind: "block", blockId } : null;
  }
  if (id.startsWith("drop-col::apartado::")) {
    const rest = id.slice("drop-col::apartado::".length);
    const parts = rest.split("::");
    return parts.length >= 2
      ? { kind: "apartado", blockId: parts[0], apartadoId: parts[1] }
      : null;
  }
  if (id.startsWith("drop-row::block::")) {
    const rest = id.slice("drop-row::block::".length);
    const blockId = rest.split("::")[0];
    return blockId ? { kind: "block", blockId } : null;
  }
  if (id.startsWith("drop-row::apartado::")) {
    const rest = id.slice("drop-row::apartado::".length);
    const parts = rest.split("::");
    return parts.length >= 2
      ? { kind: "apartado", blockId: parts[0], apartadoId: parts[1] }
      : null;
  }
  return null;
}
