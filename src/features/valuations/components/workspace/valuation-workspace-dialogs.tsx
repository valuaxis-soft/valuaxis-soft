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

/**
 * Leaving the editor with changes not saved: by its Atrás, the browser's, or
 * a link of the app. Nothing is lost without the appraiser choosing it.
 */
export function UnsavedChangesExitDialog({
  open,
  description,
  onOpenChange,
  onExitWithoutSaving,
  onSaveAndExit,
  saving,
}: {
  open: boolean;
  description: string;
  onOpenChange: (open: boolean) => void;
  onExitWithoutSaving: () => void;
  onSaveAndExit: () => void;
  saving: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* Wide enough for its three choices in one row. */}
      <AlertDialogContent data-unsaved-exit-dialog="" className="data-[size=default]:sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Hay cambios sin guardar</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Seguir editando</AlertDialogCancel>
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

/** Asks before deleting a section, with everything it holds. */
export function RemoveSectionDialog({
  sectionName,
  restorable = false,
  onOpenChange,
  onConfirm,
}: {
  /** The section to delete; null keeps the dialog closed. */
  sectionName: string | null;
  /** A registry section: it can be restored from the list of sections after it is saved. */
  restorable?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={sectionName !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar la sección {sectionName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se quita la pestaña con sus bloques, subbloques, conceptos, tablas e imágenes, y deja de salir en el
            dictamen. Si solo quieres que no se imprima, usa &quot;Ocultar&quot;. Puedes deshacerlo antes de guardar.
            {restorable ? " Después de guardar, la puedes restaurar desde la lista de secciones." : null}
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
