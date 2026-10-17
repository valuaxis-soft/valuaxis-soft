"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";

import type { Apartado, AppSection, Block } from "@/features/valuations/model";
import {
  duplicateApartado,
  duplicateBlock,
  moveApartadoTo,
  moveBlockToSection,
  moveConceptsTo,
  pasteApartado,
  pasteBlock,
  type ContainerAddress,
  type CopyOptions,
  type TransferResult,
} from "@/features/valuations/services/structure-transfer";

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
  moveApartado: (source: Required<ContainerAddress>, destination: BlockAddress) => void;
  moveConcepts: (source: ContainerAddress, conceptIds: string[], destination: ContainerAddress) => boolean;
  pasteBlock: (sectionId: string) => void;
  pasteApartado: (destination: BlockAddress) => void;
  /** Inserts a copy of a Block brought from a template or another valuation. */
  importBlock: (sectionId: string, block: Block, options: CopyOptions) => boolean;
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
}: {
  children: ReactNode;
  readOnly: boolean;
  sections: AppSection[];
  valuationId: string | null;
  updateSections: (updater: (current: AppSection[]) => AppSection[]) => void;
}) {
  const [clipboard, setClipboard] = useState<StructureClipboard | null>(null);

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
    moveApartado: (source, destination) => {
      apply((current) => moveApartadoTo(current, source, destination), "Apartado movido.");
    },
    moveConcepts: (source, conceptIds, destination) =>
      apply((current) => moveConceptsTo(current, source, conceptIds, destination), conceptIds.length === 1 ? "Concepto movido." : "Conceptos movidos."),
    pasteBlock: (sectionId) => {
      if (clipboard?.kind !== "block") return;
      apply((current) => pasteBlock(current, sectionId, clipboard.block), "Bloque pegado.");
    },
    pasteApartado: (destination) => {
      if (clipboard?.kind !== "apartado") return;
      apply((current) => pasteApartado(current, destination, clipboard.apartado), "Apartado pegado.");
    },
    importBlock: (sectionId, block, options) => apply((current) => pasteBlock(current, sectionId, block, options), "Bloque importado."),
  };

  return <StructureTransferContext.Provider value={value}>{children}</StructureTransferContext.Provider>;
}
