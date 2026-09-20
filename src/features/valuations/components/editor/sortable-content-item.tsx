"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { ContentDragHandle } from "./content-layout-drag-handle";

export function SortableContentItem({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn("relative min-w-0", isDragging && "z-50")}>
      <div className="flex items-start gap-1">
        <ContentDragHandle disabled={disabled} attributes={attributes} listeners={listeners} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
