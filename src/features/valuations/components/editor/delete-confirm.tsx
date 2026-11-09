"use client";

/**
 * Deleting always asks first, the same small dialog for a concept, a
 * subbloque, a bloque or a section, and what was deleted comes back with
 * "Deshacer" (the editor's history keeps it). The workspace mounts one
 * provider; every trash can asks it to confirm before deleting.
 */
import { createContext, useContext, useState, type ReactNode } from "react";

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

export type DeleteSubject = "concept" | "concepts" | "subblock" | "block" | "image" | "table" | "headerField" | "constructionType";

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
  // The construction types save on their own: the table's own Ctrl+Z brings the row back and saves it again.
  constructionType: {
    what: "el tipo de construcción",
    holds: "Se quita con su descripción, superficie, edad y vida útil, también del enfoque de costos,",
    confirm: "Eliminar tipo",
    undo: "Puedes deshacerlo con Ctrl+Z (⌘Z en Mac) en la tabla de tipos.",
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

const DeleteConfirmContext = createContext<ConfirmDelete | null>(null);

/**
 * Asks before deleting. Without a provider (a component rendered on its own)
 * the deletion goes through at once, so nothing is blocked.
 */
export function useConfirmDelete(): ConfirmDelete {
  const confirm = useContext(DeleteConfirmContext);
  return confirm ?? ((request) => request.onConfirm());
}

export function DeleteConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DeleteRequest | null>(null);
  return (
    <DeleteConfirmContext.Provider value={setRequest}>
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
