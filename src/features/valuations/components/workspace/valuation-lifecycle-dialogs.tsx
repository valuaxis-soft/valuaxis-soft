"use client";

import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

/** Text the user accepts when reopening; it is stored with the reopening record. */
export const REOPEN_ACCEPTANCE_TEXT =
  "Entiendo que se creará una nueva versión editable del avalúo y que la versión concluida se conserva sin cambios.";

export function ConcludeValuationDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
  hasUnsavedChanges,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
  hasUnsavedChanges: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Concluir el avalúo?</AlertDialogTitle>
          <AlertDialogDescription>
            La versión actual queda cerrada y ya no se podrá editar. Para corregirla después habrá que reabrirla, lo
            que crea una versión nueva.
            {hasUnsavedChanges ? " Antes de concluir se guardarán los cambios pendientes." : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction type="button" onClick={onConfirm} disabled={pending}>
            {pending ? "Concluyendo..." : "Concluir avalúo"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ReopenValuationDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  const [accepted, setAccepted] = useState(false);
  const canConfirm = reason.trim().length > 0 && accepted && !pending;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setReason("");
          setAccepted(false);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reabrir el avalúo</AlertDialogTitle>
          <AlertDialogDescription>
            Se creará una versión nueva para editar. La versión concluida se conserva tal como está.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="reopen-reason">Motivo de la reapertura</FieldLabel>
            <Textarea
              id="reopen-reason"
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Por ejemplo: corrección de la superficie de terreno."
              disabled={pending}
            />
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="reopen-accept"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
              disabled={pending}
            />
            <FieldLabel htmlFor="reopen-accept">{REOPEN_ACCEPTANCE_TEXT}</FieldLabel>
          </Field>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction type="button" onClick={() => onConfirm(reason.trim())} disabled={!canConfirm}>
            {pending ? "Reabriendo..." : "Reabrir avalúo"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
