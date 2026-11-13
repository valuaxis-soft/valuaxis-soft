"use client";

import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirmDelete } from "@/features/valuations/components/editor/delete-confirm";

/** Whether the approach goes in the dictamen, and how to change it: the section's «Agregar al informe valuatorio». */
export type ApproachInReport = { included: boolean; onIncludedChange: (included: boolean) => void };

/**
 * «Quitar este enfoque» of the cost and income panels (video 6.3, 06:35), as
 * «Quitar este mercado»: it asks with the app's dialog, and «Deshacer» in the
 * notice brings it back. It turns off the section's «Agregar al informe
 * valuatorio» (`excludedFromReport`), so the approach leaves the dictamen and
 * the conclusion while its capture is kept; the editor's «Deshacer» undoes it too.
 */
export function ApproachRemoval({ name, approach, readOnly }: { name: string; approach: ApproachInReport; readOnly: boolean }) {
  const confirmDelete = useConfirmDelete();
  if (readOnly) return null;
  if (!approach.included) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => approach.onIncludedChange(true)}>
        <Plus data-icon="inline-start" /> Volver a agregar al informe
      </Button>
    );
  }
  const remove = () => confirmDelete({
    title: `¿Quitar el enfoque de ${name}?`,
    description: "Deja de imprimirse en el dictamen y de entrar a la conclusión; lo capturado se conserva. "
      + "Puedes deshacerlo con «Deshacer» en el aviso que aparece o volver a agregarlo con su botón.",
    confirmLabel: "Quitar enfoque",
    onConfirm: () => {
      approach.onIncludedChange(false);
      toast.success(`Enfoque de ${name} quitado del dictamen.`, {
        duration: 15000,
        action: { label: "Deshacer", onClick: () => approach.onIncludedChange(true) },
      });
    },
  });
  return (
    <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={remove}>
      <Trash2 data-icon="inline-start" /> Quitar este enfoque
    </Button>
  );
}

/** What the panel says while the approach is out of the dictamen. */
export function ApproachLeftOutNotice({ name }: { name: string }) {
  return (
    <p className="rounded-md border border-dashed bg-background px-3 py-2 text-sm text-muted-foreground" data-approach-left-out="">
      El enfoque de {name} no se imprime en el dictamen ni entra a la conclusión. Sus cálculos se conservan.
    </p>
  );
}
