"use client";

import { forwardRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { ContentDragHandle } from "./content-layout-drag-handle";
import { buildContentColumnDndId, type ContentContainerRef } from "./content-dnd-ids";

/* ------------------------------------------------------------------ */
/*  Sortable column wrapper                                            */
/* ------------------------------------------------------------------ */

/**
 * Wraps a V2 column with sortable behavior.
 *
 * Uses a container-scoped DnD ID to ensure uniqueness across all
 * containers sharing a single DndContext (Block + Apartados).
 *
 * Registers sortable with:
 *   id: scoped DnD ID (e.g., content::block::blockId::c-0-0)
 *   data: { kind, container, columnId, itemType, itemId }
 *
 * Domain operations use data.current.columnId (domain column ID)
 * and data.current.itemId (business UUID).
 */
export function V2SortableColumn({
  columnId,
  containerRef,
  itemType,
  itemId,
  disabled,
  data,
  children,
}: {
  columnId: string;
  containerRef?: ContentContainerRef;
  /** Business item type — required for cross-container transfer. */
  itemType?: "concept" | "image" | "table";
  /** Business item UUID — required for cross-container transfer. */
  itemId?: string;
  disabled: boolean;
  /** Optional additional semantic metadata. */
  data?: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const dndId = containerRef
    ? buildContentColumnDndId(containerRef, columnId)
    : columnId;

  const sortableData = containerRef
    ? {
        kind: "content-column" as const,
        container: containerRef,
        columnId,
        itemType,
        itemId,
        ...data,
      }
    : data;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dndId, disabled, data: sortableData });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative min-w-0",
        isDragging && "z-50",
      )}
    >
      <div className="flex items-start gap-1">
        <ContentDragHandle
          disabled={disabled}
          attributes={attributes}
          listeners={listeners}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
