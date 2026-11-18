"use client";

import { useRef, type ReactNode } from "react";
import { resolvePageBreak, type PageBreakMode } from "@/features/valuations/services/document-structure";

import { ContextMenu, ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";

import type { Apartado, ApartadoPresentationMode } from "@/features/valuations/model";
import type { ConceptPresentation } from "@/features/valuations/services/concept-presentation";

import { StructuralActions } from "./structural-actions";
import { deleteConfirmation, useConfirmDelete } from "./delete-confirm";
import type { PrintTitleChoice } from "./structure-transfer-actions";

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
  printTitle,
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
  /** «Imprimir título» (video 7.1): in its ⋮ and in the right-click menu of its title. */
  printTitle?: PrintTitleChoice;
  readOnly: boolean;
  siblingIndex: number;
  subBlock: Apartado;
  subBlockTerm: string;
}) {
  const itemLabel = subBlockTerm === "apartados" ? "apartado" : "subbloque";
  const useBlueTone = siblingIndex % 2 === 0;
  const confirmDelete = useConfirmDelete();
  const titleRef = useRef<HTMLInputElement | null>(null);
  const askDelete = () => confirmDelete({ ...deleteConfirmation("subblock", subBlock.title), onConfirm: onRemove });
  const titleField = (
    <Input
      ref={titleRef}
      aria-label="Título del apartado"
      className={cn(
        "h-8 min-w-0 flex-1 border-transparent bg-transparent px-1 text-sm font-black uppercase leading-tight text-[#00285A] dark:text-sky-200 shadow-none hover:bg-background/70 focus-visible:border-ring focus-visible:bg-background",
        printTitle && !printTitle.printed && "line-through decoration-1 opacity-60",
      )}
      disabled={readOnly}
      placeholder="Sin título"
      title={printTitle && !printTitle.printed ? "Este título no se imprime en el dictamen («Imprimir título» está apagado)." : undefined}
      value={subBlock.title}
      onChange={(event) =>
        onTitleChange(event.target.value.toUpperCase())
      }
    />
  );

  return (
    <section
      className={cn(
        "rounded-lg border p-4",
        useBlueTone ? "border-[#00285A]/25 bg-[#00285A]/[0.12] dark:bg-[#00285A]/35" : "bg-background",
        !subBlock.enabled && "border-dashed border-muted-foreground/40 opacity-80",
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-[#00285A]/20 dark:border-sky-200/20 pb-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {displayLabel ? (
            <span className="shrink-0 text-sm font-black uppercase leading-tight text-[#00285A] dark:text-sky-200">
              {displayLabel}
            </span>
          ) : null}
          {readOnly ? titleField : (
            // The right-click menu of the title, as a block's: rename, print the title or not, hide and delete.
            <ContextMenu>
              <ContextMenuTrigger className="flex min-w-0 flex-1 items-center">{titleField}</ContextMenuTrigger>
              <ContextMenuContent className="w-60" data-apartado-title-menu={subBlock.id}>
                <ContextMenuItem
                  onClick={() => window.setTimeout(() => {
                    titleRef.current?.focus();
                    titleRef.current?.select();
                  }, 80)}
                >
                  Renombrar
                </ContextMenuItem>
                {printTitle ? (
                  <ContextMenuCheckboxItem checked={printTitle.printed} onClick={() => printTitle.onChange(!printTitle.printed)}>
                    Imprimir título
                  </ContextMenuCheckboxItem>
                ) : null}
                {capabilities.visibility && onVisibleChange ? (
                  <ContextMenuItem onClick={() => onVisibleChange(!subBlock.enabled)}>
                    {subBlock.enabled ? "Ocultar en el dictamen" : "Mostrar en el dictamen"}
                  </ContextMenuItem>
                ) : null}
                {capabilities.delete ? (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onClick={askDelete}>Eliminar {itemLabel}…</ContextMenuItem>
                  </>
                ) : null}
              </ContextMenuContent>
            </ContextMenu>
          )}
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
              onDelete: askDelete,
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