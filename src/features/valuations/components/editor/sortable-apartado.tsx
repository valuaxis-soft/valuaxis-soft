"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Sortable Apartado wrapper                                          */
/* ------------------------------------------------------------------ */

/**
 * Wraps an ApartadoEditor with sortable (drag-to-reorder) behavior.
 *
 * The Apartado itself is the sortable unit.
 * Uses the SubBlock.id as the sortable identifier.
 * Renders an explicit grip handle for drag initiation.
 *
 * The handle is rendered as a sibling to the children (ApartadoEditor),
 * positioned above the card. This avoids modifying ApartadoEditor internals.
 */
export function SortableApartado({
  apartadoId,
  disabled,
  children,
}: {
  apartadoId: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: apartadoId, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative",
        isDragging && "z-50",
      )}
    >
      <div className="flex items-start gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Reordenar apartado"
          title="Arrastrar para reordenar"
          disabled={disabled}
          className={cn(
            "mt-4 shrink-0 cursor-grab active:cursor-grabbing",
            isDragging && "opacity-50",
          )}
          {...attributes}
          {...listeners}
        >
          <GripVertical />
        </Button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
