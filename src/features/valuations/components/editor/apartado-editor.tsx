"use client";

import type { ReactNode } from "react";
import { resolvePageBreak, type PageBreakMode } from "@/features/valuations/services/document-structure";

import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";

import type { Apartado, ApartadoPresentationMode } from "@/features/valuations/model";
import type { ConceptPresentation } from "@/features/valuations/services/concept-presentation";

import { StructuralActions } from "./structural-actions";
import { deleteConfirmation, useConfirmDelete } from "./delete-confirm";

import type { EditorCapabilities } from "./editor-capabilities";

export function ApartadoEditor({
  canMoveDown,
  canMoveUp,
  capabilities,
  children,
  conceptPresentation,
  displayLabel,
  extraActions,
  onConceptPresentationChange,
  onPresentationModeChange,
  onResetConceptPresentations,
  onMoveDown,
  onMoveUp,
  onRemove,
  onPageBreakChange,
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
  /** Actions of the editor's own shown before the structural ones (copy, move). */
  extraActions?: ReactNode;
  onConceptPresentationChange?: (next: ConceptPresentation | undefined) => void;
  onPresentationModeChange?: (next: ApartadoPresentationMode | undefined) => void;
  onResetConceptPresentations?: () => void;
  onMoveDown?: () => void;
  onMoveUp?: () => void;
  onRemove: () => void;
  onPageBreakChange?: (pageBreak: PageBreakMode) => void;
  onTitleChange: (title: string) => void;
  onVisibleChange?: (visible: boolean) => void;
  readOnly: boolean;
  siblingIndex: number;
  subBlock: Apartado;
  subBlockTerm: string;
}) {
  const itemLabel = subBlockTerm === "apartados" ? "apartado" : "subbloque";
  const useBlueTone = siblingIndex % 2 === 0;
  const confirmDelete = useConfirmDelete();

  return (
    <section
      className={cn(
        // A subbloque hangs from its block: a navy rule on its left, and every other one tinted so neighbours read apart.
        "rounded-lg border border-l-[3px] border-l-primary/45 p-4",
        useBlueTone ? "border-primary/20 bg-primary/[0.06] dark:bg-primary/10" : "bg-background",
        !subBlock.enabled && "border-dashed border-muted-foreground/40 opacity-80",
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-primary/15 pb-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {displayLabel ? (
            <span className="shrink-0 text-sm font-bold uppercase leading-tight tracking-wide text-primary">
              {displayLabel}
            </span>
          ) : null}
          <Input
            aria-label="Título del apartado"
            className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1 text-sm font-bold uppercase leading-tight tracking-wide text-primary shadow-none hover:bg-background/70 focus-visible:border-ring focus-visible:bg-background"
            disabled={readOnly}
            value={subBlock.title}
            onChange={(event) =>
              onTitleChange(event.target.value.toUpperCase())
            }
          />
        </div>

        <div className="flex items-center gap-2">
          {extraActions}
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
            pageBreak={capabilities.pageBreak && onPageBreakChange ? {
              value: resolvePageBreak(subBlock),
              onChange: onPageBreakChange,
            } : undefined}
            deleteAction={capabilities.delete ? {
              // Deleting asks first; what was deleted comes back with "Deshacer".
              onDelete: () => confirmDelete({ ...deleteConfirmation("subblock", subBlock.title), onConfirm: onRemove }),
            } : undefined}
          />
        </div>
      </div>

      <FieldGroup>
        {children}
      </FieldGroup>
    </section>
  );
}