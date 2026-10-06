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
