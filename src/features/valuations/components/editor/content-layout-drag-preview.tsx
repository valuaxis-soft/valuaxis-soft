"use client";

import { GripVertical, ImageIcon, Rows3, Table2, Text } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentLayoutItemRef, ContentLayoutItemType } from "../../model";

/* ------------------------------------------------------------------ */
/*  Icon mapping by type                                               */
/* ------------------------------------------------------------------ */

const TYPE_ICONS: Record<ContentLayoutItemType, typeof GripVertical> = {
  concept: Text,
  image: ImageIcon,
  table: Table2,
};

const TYPE_LABELS: Record<ContentLayoutItemType, string> = {
  concept: "Concepto",
  image: "Imagen",
  table: "Tabla",
};

/* ------------------------------------------------------------------ */
/*  Drag preview                                                       */
/* ------------------------------------------------------------------ */

/**
 * Compact drag preview shown while dragging a content item.
 *
 * Shows a small floating card with a grip icon and a generic
 * type-based label. No domain-specific editor JSX is duplicated.
 *
 * Sizing: width is content-based (not container-based). Max-width
 * prevents horizontal overflow. The overlay must not participate
 * in normal document flow.
 */
export function ContentDragPreview({
  item,
  count,
  label: labelOverride,
  note,
  className,
}: {
  /** The content layout item being dragged. */
  item: ContentLayoutItemRef;
  /** How many concepts go with it (the selection it is part of). */
  count?: number;
  /** What is dragged, when it is not a content item (a subbloque). */
  label?: string;
  /** Why it has nowhere else to go, under the label. */
  note?: string;
  /** Optional additional CSS class. */
  className?: string;
}) {
  const Icon = labelOverride ? Rows3 : TYPE_ICONS[item.type];
  const label = labelOverride ?? (count && count > 1 ? `${count} conceptos` : TYPE_LABELS[item.type]);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-background/95 px-2 py-1 text-xs shadow-lg select-none pointer-events-none",
        "max-w-[20rem] min-w-[10rem] overflow-hidden",
        className,
      )}
      style={{ width: "fit-content" }}
    >
      <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{label}</span>
        {note ? <span className="whitespace-normal text-muted-foreground" data-drag-note="">{note}</span> : null}
      </span>
    </div>
  );
}
