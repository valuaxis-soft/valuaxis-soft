"use client";

import { useRef, type CSSProperties, type ReactNode, type RefObject } from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";


export function BlockEditorCard({
  blockId,
  cardRef,
  children,
  className,
  style,
}: {
  /** The block it edits, so an undo can bring the editor to it. */
  blockId?: string;
  cardRef: (node: HTMLElement | null) => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    // Clipped, not hidden: a hidden overflow would hold the "Seleccionar conceptos" bar instead of letting it stick to the top while scrolling.
    // The header band starts at the card's top edge (pt-0); while a field inside is being edited, the card's
    // rule turns navy so the block being worked on reads apart from the rest.
    <Card
      ref={cardRef}
      style={style}
      className={cn("overflow-clip pt-0 focus-within:ring-primary/35 motion-safe:transition-shadow", className)}
      data-block-id={blockId}
    >
      {children}
    </Card>
  );
}

export function BlockEditorHeader({
  badge,
  children,
  dragHandle,
  title,
  titleEdit,
  titleContextMenu,
}: {
  badge?: ReactNode;
  children: ReactNode;
  dragHandle?: ReactNode;
  title: ReactNode;
  titleEdit?: {
    disabled: boolean;
    value: string;
    onChange: (value: string) => void;
  };
  /** The right-click menu of the title (a ContextMenuContent), given the title's field to enter it and rename it. */
  titleContextMenu?: (controls: { titleRef: RefObject<HTMLInputElement | null> }) => ReactNode;
}) {
  const titleRef = useRef<HTMLInputElement | null>(null);
  const heading = titleEdit ? (
    <Input
      ref={titleRef}
      aria-label="Título de la sección"
      className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1 text-sm font-bold uppercase leading-tight tracking-wide text-primary shadow-none hover:bg-background/70 focus-visible:border-ring focus-visible:bg-background"
      disabled={titleEdit.disabled}
      value={titleEdit.value}
      onChange={(event) => titleEdit.onChange(event.target.value)}
    />
  ) : (
    <span className="min-w-0 flex-1 text-sm font-bold uppercase leading-tight tracking-wide text-primary">
      {title}
    </span>
  );
  return (
    <CardHeader className="items-center border-b border-primary/15 bg-primary/[0.05] py-2 [.border-b]:pb-2 dark:bg-primary/10">
      <CardTitle className="flex min-w-0 items-center gap-2">
        {dragHandle}
        {badge ? <Badge>{badge}</Badge> : null}
        {titleContextMenu ? (
          <ContextMenu>
            <ContextMenuTrigger className="flex min-w-0 flex-1 items-center">{heading}</ContextMenuTrigger>
            {titleContextMenu({ titleRef })}
          </ContextMenu>
        ) : heading}
      </CardTitle>
      <CardAction className="flex shrink-0 items-center gap-1.5 self-center">
        {children}
      </CardAction>
    </CardHeader>
  );
}

export function BlockEditorContent({ children }: { children: ReactNode }) {
  return (
    <CardContent className="space-y-5">
      {children}
    </CardContent>
  );
}