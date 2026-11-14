"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import type { Apartado, AppSection, Block } from "@/features/valuations/model";
import {
  duplicateApartado,
  duplicateBlock,
  moveApartadoTo,
  moveBlockToSection,
  moveConceptGroupToDrop,
  moveConceptsTo,
  pasteApartado,
  pasteBlock,
  type ContainerAddress,
  type TransferPosition,
  type TransferResult,
} from "@/features/valuations/services/structure-transfer";
import {
  importStructure,
  importSummaryText,
  type ImportOptions,
  type ImportPlan,
} from "@/features/valuations/services/structure-import";
import type { ContentDropSource, ContentDropTarget, ContentMoveRules } from "@/features/valuations/services/content-drop";

/** What "Copiar" took: pasted as a new copy each time, from the content as it was then. */
type StructureClipboard =
  | { kind: "block"; block: Block; label: string }
  | { kind: "apartado"; apartado: Apartado; label: string };

type BlockAddress = Omit<ContainerAddress, "apartadoId">;

type StructureTransfer = {
  sections: AppSection[];
  readOnly: boolean;
  /** The valuation being edited; other valuations of the firm are offered to import Blocks from. */
  valuationId: string | null;
  clipboard: StructureClipboard | null;
  copyBlock: (block: Block) => void;
  copyApartado: (apartado: Apartado) => void;
  duplicateBlock: (sectionId: string, blockId: string) => void;
  duplicateApartado: (sectionId: string, blockId: string, apartadoId: string) => void;
  moveBlock: (sectionId: string, blockId: string, destinationSectionId: string) => void;
  moveApartado: (source: Required<ContainerAddress>, destination: BlockAddress, position?: TransferPosition) => void;
  moveConcepts: (source: ContainerAddress, conceptIds: string[], destination: ContainerAddress, position?: TransferPosition) => boolean;
  /** Drops the chosen concepts where one of them was dragged to, together and in their order. */
  dropConceptGroup: (sectionId: string, source: ContentDropSource, conceptIds: string[], target: ContentDropTarget, rules: ContentMoveRules) => boolean;
  pasteBlock: (sectionId: string) => void;
  pasteApartado: (destination: BlockAddress) => void;
  /**
   * Brings the Blocks, subbloques and whole sections of a template or another
   * valuation in one step, and says what came and how many concepts were linked.
   */
  importStructure: (sectionId: string, plan: ImportPlan, options: ImportOptions) => boolean;
  /** The document as it is now, also from a callback that runs after a field commits. */
  latestSections: () => AppSection[];
};

const StructureTransferContext = createContext<StructureTransfer | null>(null);

/** The moves and copies of Blocks, Apartados and concepts across the sections, when the editor offers them. */
export function useStructureTransfer() {
  return useContext(StructureTransferContext);
}

const titleOf = (title: string, fallback: string) => title.trim() || fallback;

export function StructureTransferProvider({
  children,
  readOnly,
  sections,
  updateSections,
  valuationId,
  onUndo,
  onShowSection,
}: {
  children: ReactNode;
  readOnly: boolean;
  sections: AppSection[];
  valuationId: string | null;
  updateSections: (updater: (current: AppSection[]) => AppSection[]) => void;
  /** The editor's «Deshacer», offered in the notice of an import. */
  onUndo?: () => void;
  /** Opens a section: the one a whole section was imported to. */
  onShowSection?: (sectionId: string) => void;
}) {
  const [clipboard, setClipboard] = useState<StructureClipboard | null>(null);
  const sectionsRef = useRef(sections);
  useLayoutEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  /** One update per operation keeps it a single undo step; a refusal says why. */
  const apply = (operation: (current: AppSection[]) => TransferResult, done?: string) => {
    if (readOnly) return false;
    const result = operation(sections);
    if (!result.changed) {
      if (result.reason) toast.error(result.reason);
      return false;
    }
    updateSections(() => result.sections);
    if (done) toast.success(done);
    return true;
  };

  const value: StructureTransfer = {
    sections,
    readOnly,
    valuationId,
    clipboard,
    copyBlock: (block) => {
      setClipboard({ kind: "block", block, label: titleOf(block.title, "Bloque") });
      toast.success("Bloque copiado. Pégalo en la sección que quieras.");
    },
    copyApartado: (apartado) => {
      setClipboard({ kind: "apartado", apartado, label: titleOf(apartado.title, "Apartado") });
      toast.success("Apartado copiado. Pégalo dentro del bloque que quieras.");
    },
    duplicateBlock: (sectionId, blockId) => {
      apply((current) => duplicateBlock(current, sectionId, blockId), "Bloque duplicado.");
    },
    duplicateApartado: (sectionId, blockId, apartadoId) => {
      apply((current) => duplicateApartado(current, sectionId, blockId, apartadoId), "Apartado duplicado.");
    },
    moveBlock: (sectionId, blockId, destinationSectionId) => {
      apply((current) => moveBlockToSection(current, sectionId, blockId, destinationSectionId), "Bloque movido.");
    },
    moveApartado: (source, destination, position) => {
      apply((current) => moveApartadoTo(current, source, destination, position), "Apartado movido.");
    },
    moveConcepts: (source, conceptIds, destination, position) =>
      apply((current) => moveConceptsTo(current, source, conceptIds, destination, position), conceptIds.length === 1 ? "Concepto movido." : "Conceptos movidos."),
    dropConceptGroup: (sectionId, source, conceptIds, target, rules) =>
      apply((current) => moveConceptGroupToDrop(current, sectionId, source, conceptIds, target, rules)),
    pasteBlock: (sectionId) => {
      if (clipboard?.kind !== "block") return;
      apply((current) => pasteBlock(current, sectionId, clipboard.block), "Bloque pegado.");
    },
    pasteApartado: (destination) => {
      if (clipboard?.kind !== "apartado") return;
      apply((current) => pasteApartado(current, destination, clipboard.apartado), "Apartado pegado.");
    },
    importStructure: (sectionId, plan, options) => {
      if (readOnly) return false;
      const result = importStructure(sections, sectionId, plan, options);
      if (!result.changed || !result.summary) {
        if (result.reason) toast.error(result.reason);
        return false;
      }
      updateSections(() => result.sections);
      if (result.summary.focusSectionId) onShowSection?.(result.summary.focusSectionId);
      toast.success(importSummaryText(result.summary, Boolean(options.autoLink)), {
        duration: 10_000,
        ...(onUndo ? { action: { label: "Deshacer", onClick: onUndo } } : {}),
      });
      return true;
    },
    latestSections: () => sectionsRef.current,
  };

  return <StructureTransferContext.Provider value={value}>{children}</StructureTransferContext.Provider>;
}
