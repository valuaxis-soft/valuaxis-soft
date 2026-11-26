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
import { useRefusedDraft } from "./refused-draft";
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
      className={cn("overflow-clip pt-0 focus-within:ring-brand/45 motion-safe:transition-shadow", className)}
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
    /** Why a title is refused (a concluded value named after intangibles); refused, it is not written. */
    refusal?: (value: string) => string | null;
  };
  /** The right-click menu of the title (a ContextMenuContent), given the title's field to enter it and rename it. */
  titleContextMenu?: (controls: { titleRef: RefObject<HTMLInputElement | null> }) => ReactNode;
}) {
  const titleRef = useRef<HTMLInputElement | null>(null);
  const draft = useRefusedDraft(titleEdit?.refusal);
  const heading = titleEdit ? (
    <Input
      ref={titleRef}
      aria-label="Título de la sección"
      aria-invalid={draft.reason ? true : undefined}
      title={draft.reason ?? undefined}
      className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1 text-sm font-bold uppercase leading-tight tracking-wide text-[color:var(--doc-on-pastel-soft,#00285A)] shadow-none hover:bg-background/70 focus-visible:border-ring focus-visible:bg-background"
      disabled={titleEdit.disabled}
      value={draft.draft ?? titleEdit.value}
      onChange={(event) => draft.change(event.target.value, titleEdit.onChange)}
      onBlur={() => draft.leave()}
    />
  ) : (
    <span className="min-w-0 flex-1 text-sm font-bold uppercase leading-tight tracking-wide text-[color:var(--doc-on-pastel-soft,#00285A)]">
      {title}
    </span>
  );
  return (
    // The band of the block's title in the valuation's palette, as the dictamen prints its titles (video 8.12, 25:50):
    // green and white when the appraiser chose green. Without a palette, the blue of always.
    <CardHeader className="items-center border-b border-[color:var(--doc-rule,#C9D6E6)] bg-[var(--doc-pastel-soft,#E7EEF7)] py-2 [.border-b]:pb-2" data-block-title-band="">
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