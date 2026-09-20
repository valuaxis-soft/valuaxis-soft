"use client";

import type { ReactNode } from "react";

import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";

import type { Apartado, ApartadoPresentationMode } from "@/features/valuations/model";
import type { ConceptPresentation } from "@/features/valuations/services/concept-presentation";

import { StructuralActions } from "./structural-actions";

import type { EditorCapabilities } from "./editor-capabilities";

export function ApartadoEditor({
  canMoveDown,
  canMoveUp,
  capabilities,
  children,
  conceptPresentation,
  displayLabel,
  onConceptPresentationChange,
  onPresentationModeChange,
  onResetConceptPresentations,
  onMoveDown,
  onMoveUp,
  onRemove,
  onStartOnNewPageChange,
  onTitleChange,
  onVisibleChange,
  readOnly,
  siblingIndex,
  subBlock,
  subBlockTerm,
}: {
  canMoveDown?: boolean;
  canMoveUp?: boolean;
  capabilities: EditorCapabilities;
  children: ReactNode;
  conceptPresentation?: ConceptPresentation;
  displayLabel: string;
  onConceptPresentationChange?: (next: ConceptPresentation | undefined) => void;
  onPresentationModeChange?: (next: ApartadoPresentationMode | undefined) => void;
  onResetConceptPresentations?: () => void;
  onMoveDown?: () => void;
  onMoveUp?: () => void;
  onRemove: () => void;
  onStartOnNewPageChange?: (startOnNewPage: boolean) => void;
  onTitleChange: (title: string) => void;
  onVisibleChange?: (visible: boolean) => void;
  readOnly: boolean;
  siblingIndex: number;
  subBlock: Apartado;
  subBlockTerm: string;
}) {
  const itemLabel = subBlockTerm === "apartados" ? "apartado" : "subbloque";
  const useBlueTone = siblingIndex % 2 === 0;

  return (
    <section
      className={cn(
        "rounded-lg border p-4",
        useBlueTone ? "border-[#00285A]/25 bg-[#00285A]/[0.12] dark:bg-[#00285A]/35" : "bg-background",
        !subBlock.enabled && "border-dashed border-muted-foreground/40 opacity-80",
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-[#00285A]/20 pb-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {displayLabel ? (
            <span className="shrink-0 text-sm font-black uppercase leading-tight text-[#00285A]">
              {displayLabel}
            </span>
          ) : null}
          <Input
            aria-label="Título del apartado"
            className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1 text-sm font-black uppercase leading-tight text-[#00285A] shadow-none hover:bg-background/70 focus-visible:border-ring focus-visible:bg-background"
            disabled={readOnly}
            value={subBlock.title}
            onChange={(event) =>
              onTitleChange(event.target.value.toUpperCase())
            }
          />
        </div>

        <div className="flex items-center gap-2">
          <StructuralActions
            conceptPresentation={conceptPresentation}
            disabled={readOnly}
            itemLabel={itemLabel}
            onConceptPresentationChange={onConceptPresentationChange}
            onPresentationModeChange={onPresentationModeChange}
            onResetConceptPresentations={onResetConceptPresentations}
            presentationMode={subBlock.presentationMode}
            move={capabilities.move && onMoveUp && onMoveDown ? {
              canMoveUp: Boolean(canMoveUp),
              canMoveDown: Boolean(canMoveDown),
              onMoveUp,
              onMoveDown,
            } : undefined}
            visibility={capabilities.visibility && onVisibleChange ? {
              visible: subBlock.enabled,
              onChange: onVisibleChange,
            } : undefined}
            pageBreak={capabilities.pageBreak && onStartOnNewPageChange ? {
              value: Boolean(subBlock.startOnNewPage),
              onChange: onStartOnNewPageChange,
            } : undefined}
            deleteAction={capabilities.delete ? { onDelete: onRemove } : undefined}
          />
        </div>
      </div>

      <FieldGroup>
        {children}
      </FieldGroup>
    </section>
  );
}