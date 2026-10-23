"use client";

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

export function SessionExpiredDialog({
  open,
  onOpenChange,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tu sesión expiró</AlertDialogTitle>
          <AlertDialogDescription>
            Tus cambios siguen en esta pestaña. Inicia sesión en una pestaña nueva y después vuelve aquí para
            guardar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            type="button"
            variant="outline"
            onClick={() => window.open("/iniciar-sesion?reason=expired", "_blank", "noopener")}
          >
            Iniciar sesión en otra pestaña
          </AlertDialogAction>
          <AlertDialogAction type="button" onClick={onSave} disabled={saving}>
            Guardar de nuevo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function UnsavedChangesExitDialog({
  open,
  onOpenChange,
  onExitWithoutSaving,
  onSaveAndExit,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExitWithoutSaving: () => void;
  onSaveAndExit: () => void;
  saving: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hay cambios pendientes</AlertDialogTitle>
          <AlertDialogDescription>
            Puedes guardar antes de volver al dashboard, salir sin guardar o continuar editando.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction type="button" variant="outline" onClick={onExitWithoutSaving}>
            Salir sin guardar
          </AlertDialogAction>
          <AlertDialogAction type="button" onClick={onSaveAndExit} disabled={saving}>
            Guardar y salir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Asks before deleting a section the appraiser added, with everything it holds. */
export function RemoveSectionDialog({
  sectionName,
  onOpenChange,
  onConfirm,
}: {
  /** The section to delete; null keeps the dialog closed. */
  sectionName: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={sectionName !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar la sección {sectionName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se quita la pestaña con sus bloques, apartados, conceptos, tablas e imágenes, y deja de salir en el
            dictamen. Si solo quieres que no se imprima, usa &quot;Ocultar&quot;. Puedes deshacerlo antes de guardar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction type="button" variant="destructive" onClick={onConfirm}>
            Eliminar sección
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
