"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The ids in their new order after dragging `from` onto `to`. */
export function movedIds(ids: readonly string[], from: string, to: string): string[] {
  const start = ids.indexOf(from);
  const end = ids.indexOf(to);
  return start < 0 || end < 0 || start === end ? [...ids] : arrayMove([...ids], start, end);
}

/**
 * Rows of a capture table that reorder by dragging their handle (V7.2-12,
 * -14), with the mouse or with the keyboard (Space, the arrows and Space
 * again), as the document's tables do. Wrap the whole table.
 */
export function SortableRows(props: { ids: string[]; onMove: (ids: string[]) => void; children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    props.onMove(movedIds(props.ids, String(active.id), String(over.id)));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={props.ids} strategy={verticalListSortingStrategy}>{props.children}</SortableContext>
    </DndContext>
  );
}

/** A row of `SortableRows`: spread `row` on its `<tr>` and put `handle` in a cell. */
export function useSortableRow(id: string, options: { disabled: boolean; label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: options.disabled });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition, position: "relative", zIndex: isDragging ? 1 : undefined };
  const handle = options.disabled ? null : (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className="cursor-grab touch-none active:cursor-grabbing"
      aria-label={options.label}
      title="Arrastra para cambiar el orden"
      {...attributes}
      {...listeners}
      // Dragging a row is not selecting cells: the table's selection does not see the press.
      onMouseDown={(event) => event.stopPropagation()}
    >
      <GripVertical />
    </Button>
  );
  return { row: { ref: setNodeRef, style, "data-dragging": isDragging || undefined }, handle, className: cn(isDragging && "bg-background shadow-md") };
}

/**
 * After a row moved with its arrow, the page scrolls by as much as the row
 * moved, so it stays under the pointer and the next click lands on the same
 * row (V7.2-13), not on the one that took its place.
 */
export function keepUnderPointer(selector: string, before: DOMRect | null) {
  if (!before) return;
  window.requestAnimationFrame(() => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return;
    const delta = element.getBoundingClientRect().top - before.top;
    if (!delta) return;
    let scroller: HTMLElement | null = element.parentElement;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) {
      scroller = scroller.parentElement;
    }
    (scroller ?? document.scrollingElement ?? document.documentElement).scrollBy({ top: delta, behavior: "instant" });
  });
}
