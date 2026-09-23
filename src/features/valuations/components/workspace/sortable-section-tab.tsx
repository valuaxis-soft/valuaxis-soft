"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { TabsTrigger } from "@/components/ui/tabs";

/* ------------------------------------------------------------------ */
/*  Sortable Section tab wrapper                                       */
/* ------------------------------------------------------------------ */

/**
 * Wraps a TabsTrigger with sortable (drag-to-reorder) behavior for
 * Section reordering.
 *
 * The entire tab is the drag activator — tabs are small enough that
 * a separate grip handle would be visually cluttered.
 *
 * Uses the section.id as the sortable identifier.
 */
export function SortableSectionTab({
  sectionId,
  disabled,
  isActive,
  icon,
  label,
  children,
}: {
  sectionId: string;
  disabled: boolean;
  isActive: boolean;
  icon: LucideIcon;
  label: string;
  children?: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sectionId, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const Icon = icon;
  // Base UI owns the tab semantics (role="tab", roving tabIndex, disabled
  // state); only the sortable description is taken from dnd-kit.
  const sortableAttributes = disabled
    ? {}
    : {
        "aria-roledescription": attributes["aria-roledescription"],
        "aria-describedby": attributes["aria-describedby"],
      };

  return (
    <div
 ref={setNodeRef}
      style={style}
      className={cn(
        "inline-flex",
        isDragging && "z-50",
      )}
    >
      <TabsTrigger
        value={sectionId}
        className={cn(
          "touch-manipulation select-none [-webkit-touch-callout:none] max-lg:min-h-10 max-lg:px-3",
          !disabled && "cursor-grab active:cursor-grabbing",
          isActive && "data-active:bg-background data-active:shadow-sm",
        )}
        {...sortableAttributes}
        {...listeners}
      >
        {Icon ? <Icon /> : null}
        {label}
        {children}
      </TabsTrigger>
    </div>
  );
}
