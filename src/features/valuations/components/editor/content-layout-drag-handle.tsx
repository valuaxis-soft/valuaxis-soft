"use client";
import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";

type DragHandleProps = {
  disabled?: boolean;
  attributes?: DraggableAttributes;
  listeners?: SyntheticListenerMap;
} & React.ComponentProps<typeof Button>;

export const ContentDragHandle = forwardRef<HTMLButtonElement, DragHandleProps>(
  function ContentDragHandle({ disabled, attributes, listeners, className, ...buttonProps }, ref) {
    return (
      <Button
        ref={ref}
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Reordenar elemento"
        title="Arrastrar para reordenar"
        disabled={disabled}
        className={cn("cursor-grab active:cursor-grabbing", className)}
        {...attributes}
        {...listeners}
        {...buttonProps}
      >
        <GripVertical />
      </Button>
    );
  }
);
