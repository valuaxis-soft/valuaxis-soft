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
    <Card ref={cardRef} style={style} className={cn("overflow-clip", className)} data-block-id={blockId}>
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
      className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1 text-sm font-black uppercase leading-tight text-[#00285A] dark:text-sky-200 shadow-none hover:bg-background/70 focus-visible:border-ring focus-visible:bg-background"
      disabled={titleEdit.disabled}
      value={titleEdit.value}
      onChange={(event) => titleEdit.onChange(event.target.value)}
    />
  ) : (
    <span className="min-w-0 flex-1 text-sm font-black uppercase leading-tight text-[#00285A] dark:text-sky-200">
      {title}
    </span>
  );
  return (
    <CardHeader className="border-b border-[#00285A]/20 dark:border-sky-200/20 bg-[#00285A]/[0.05] dark:bg-sky-200/5">
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
      <CardAction className="flex shrink-0 items-center gap-2">
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