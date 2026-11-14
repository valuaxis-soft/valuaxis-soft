"use client";

/**
 * Deleting asks first, the same small dialog for a subbloque, a bloque, a
 * section, a table, an image or more than three concepts at once, and what
 * was deleted comes back with "Deshacer" (the editor's history keeps it).
 * One concept, or up to three, goes at once with a notice that offers
 * "Deshacer": asking every time was tedious (Álvaro, video 5.6, 11 nov 2026).
 * The workspace mounts one provider; every trash can goes through it.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type DeleteSubject = "concept" | "concepts" | "subblock" | "block" | "image" | "table" | "headerField" | "constructionType" | "installation";

export type DeleteConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
};

const UNDO_BEFORE_SAVE = "Puedes deshacerlo con «Deshacer» antes de guardar.";

/** `undo`: how it comes back, when that is not the editor's «Deshacer» before saving. */
const SUBJECT_WORDING: Record<DeleteSubject, { what: string; holds: string; confirm: string; undo?: string }> = {
  concept: { what: "el concepto", holds: "Se quita con su dato", confirm: "Eliminar concepto" },
  concepts: { what: "los conceptos", holds: "Se quitan con sus datos", confirm: "Eliminar conceptos" },
  subblock: { what: "el subbloque", holds: "Se quita con sus conceptos, tablas e imágenes", confirm: "Eliminar subbloque" },
  block: { what: "el bloque", holds: "Se quita con sus subbloques, conceptos, tablas e imágenes", confirm: "Eliminar bloque" },
  image: { what: "la imagen", holds: "Se quita del documento", confirm: "Eliminar imagen" },
  table: { what: "la tabla", holds: "Se quita con sus filas y fórmulas", confirm: "Eliminar tabla" },
  headerField: { what: "el dato del encabezado", holds: "Se quita del encabezado de cada página", confirm: "Eliminar dato" },
  // A row of the capture tables of the construction section is saved on its own; «Deshacer» brings it back with its cost columns.
  constructionType: {
    what: "el tipo de construcción",
    holds: "Se quita con su descripción, superficie, edad y vida útil, también del enfoque de costos,",
    confirm: "Eliminar tipo",
    undo: "Puedes deshacerlo con «Deshacer» o Ctrl+Z (⌘Z en Mac): vuelve con lo que el enfoque de costos tenía capturado.",
  },
  installation: {
    what: "la instalación especial",
    holds: "Se quita con su descripción, cantidad, edad y vida útil, también del enfoque de costos,",
    confirm: "Eliminar instalación",
    undo: "Puedes deshacerlo con «Deshacer» o Ctrl+Z (⌘Z en Mac): vuelve con lo que el enfoque de costos tenía capturado.",
  },
};

/** What the dialog says for a subject: its title names the item when it has a name. */
export function deleteConfirmation(subject: DeleteSubject, name?: string, count?: number): DeleteConfirmation {
  const wording = SUBJECT_WORDING[subject];
  const subjectText = subject === "concepts" && count ? `${count} conceptos` : wording.what;
  const title = name?.trim() ? `¿Eliminar ${subjectText} «${name.trim()}»?` : `¿Eliminar ${subjectText}?`;
  return {
    title,
    description: `${wording.holds} y deja de salir en el dictamen. ${wording.undo ?? UNDO_BEFORE_SAVE}`,
    confirmLabel: wording.confirm,
  };
}

type DeleteRequest = DeleteConfirmation & { onConfirm: () => void };

type ConfirmDelete = (request: DeleteRequest) => void;

const DeleteConfirmContext = createContext<{ confirm: ConfirmDelete; undo?: () => void } | null>(null);

/**
 * Asks before deleting. Without a provider (a component rendered on its own)
 * the deletion goes through at once, so nothing is blocked.
 */
export function useConfirmDelete(): ConfirmDelete {
  const context = useContext(DeleteConfirmContext);
  return context?.confirm ?? ((request) => request.onConfirm());
}

/** Concepts deleted at once that still ask first: more than three. */
export const CONCEPTS_DELETED_WITHOUT_ASKING = 3;

/** Whether deleting this many concepts at once asks first. */
export function conceptDeletionAsksFirst(count: number) {
  return count > CONCEPTS_DELETED_WITHOUT_ASKING;
}

type DeleteConcepts = (request: { count: number; name?: string; onDelete: () => void }) => void;

/**
 * Deletes concepts: up to three go at once, with a notice that offers
 * "Deshacer"; more ask first with the same dialog as the other deletions.
 */
export function useDeleteConcepts(): DeleteConcepts {
  const context = useContext(DeleteConfirmContext);
  return ({ count, name, onDelete }) => {
    if (count < 1) return;
    if (conceptDeletionAsksFirst(count)) {
      const confirm = context?.confirm ?? ((request: DeleteRequest) => request.onConfirm());
      confirm({ ...deleteConfirmation("concepts", undefined, count), onConfirm: onDelete });
      return;
    }
    onDelete();
    if (!context) return;
    const label = name?.trim();
    toast(count === 1 ? (label ? `Concepto «${label}» eliminado` : "Concepto eliminado") : `${count} conceptos eliminados`, {
      description: "Se puede deshacer con «Deshacer» o Ctrl+Z (⌘Z en Mac).",
      action: context.undo ? { label: "Deshacer", onClick: context.undo } : undefined,
    });
  };
}

/**
 * What is written in a selection of table cells, cleared with Supr (video
 * 5.7), under the same rule as the concepts: up to three cells with something
 * written go at once, with a notice that offers "Deshacer"; more ask first.
 * `undo` takes it back where the editor's «Deshacer» does not reach (the
 * capture tables of the panels, which save on their own).
 */
export function useClearCells(): (request: { count: number; onClear: () => void; undo?: () => void }) => void {
  const context = useContext(DeleteConfirmContext);
  return ({ count, onClear, undo }) => {
    if (count < 1) return;
    const notice = () => {
      const action = undo ?? context?.undo;
      toast(count === 1 ? "Se borró el contenido de 1 celda" : `Se borró el contenido de ${count} celdas`, {
        description: undo ? "Se puede deshacer con «Deshacer»." : "Se puede deshacer con «Deshacer» o Ctrl+Z (⌘Z en Mac).",
        action: action ? { label: "Deshacer", onClick: action } : undefined,
      });
    };
    if (conceptDeletionAsksFirst(count)) {
      const confirm = context?.confirm ?? ((request: DeleteRequest) => request.onConfirm());
      confirm({
        title: `¿Borrar el contenido de ${count} celdas?`,
        description: `Se borra lo escrito y sus fórmulas; el formato de las celdas se queda. ${undo ? "Puedes deshacerlo con «Deshacer» en el aviso." : UNDO_BEFORE_SAVE}`,
        confirmLabel: "Borrar contenido",
        onConfirm: () => {
          onClear();
          if (undo) notice();
        },
      });
      return;
    }
    onClear();
    notice();
  };
}

export function DeleteConfirmProvider({ children, onUndo }: { children: ReactNode; /** The editor's "Deshacer", offered by the notice of a concept deleted without asking. */ onUndo?: () => void }) {
  const [request, setRequest] = useState<DeleteRequest | null>(null);
  return (
    <DeleteConfirmContext.Provider value={{ confirm: setRequest, undo: onUndo }}>
      {children}
      <DeleteConfirmDialog
        request={request}
        onOpenChange={(open) => { if (!open) setRequest(null); }}
        onConfirm={() => { request?.onConfirm(); setRequest(null); }}
      />
    </DeleteConfirmContext.Provider>
  );
}

/** The small dialog itself: a title, what goes with the item, Cancelar and the red button. */
export function DeleteConfirmDialog({
  request,
  onOpenChange,
  onConfirm,
}: {
  request: DeleteConfirmation | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={request !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm" data-delete-confirm>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          <AlertDialogDescription>{request?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction type="button" variant="destructive" onClick={onConfirm}>
            {request?.confirmLabel ?? "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
