"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The ids with `id` one place up (-1) or down (1); as they were at either end. */
export function steppedIds(ids: readonly string[], id: string, direction: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + direction;
  return from < 0 || to < 0 || to >= ids.length ? [...ids] : arrayMove([...ids], from, to);
}

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

/**
 * A row of `SortableRows`: spread `row` on its `<tr>` and put `handle` in a cell.
 * With `onStep`, the arrow keys on the focused handle move the row one place
 * up or down at once, and the handle keeps the focus (video 8.13, 01:27: the
 * arrows gave way to the handle; the keyboard still reorders).
 */
export function useSortableRow(id: string, options: { disabled: boolean; label: string; onStep?: (direction: -1 | 1) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: options.disabled });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition, position: "relative", zIndex: isDragging ? 1 : undefined };
  const step = options.onStep;
  const handle = options.disabled ? null : (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className="cursor-grab touch-none active:cursor-grabbing"
      aria-label={options.label}
      title={step ? "Arrastra para cambiar el orden; con el teclado, las flechas arriba y abajo" : "Arrastra para cambiar el orden"}
      aria-keyshortcuts={step ? "ArrowUp ArrowDown" : undefined}
      data-sortable-handle={id}
      {...attributes}
      {...listeners}
      onKeyDown={(event) => {
        if (step && !isDragging && (event.key === "ArrowUp" || event.key === "ArrowDown") && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          step(event.key === "ArrowUp" ? -1 : 1);
          // The row moved in the page: its handle takes the focus back, so the next arrow moves it again.
          window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-sortable-handle="${window.CSS.escape(id)}"]`)?.focus());
          return;
        }
        listeners?.onKeyDown?.(event);
      }}
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
