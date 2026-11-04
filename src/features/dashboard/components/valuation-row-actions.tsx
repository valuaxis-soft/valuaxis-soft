"use client";

import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { Archive, ArchiveRestore, Copy, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { useContext, useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api-client";

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/**
 * The "···" of a row of the list: duplicate the valuation, archive it (out of
 * the main list, back with "Archivados") or delete it after confirming.
 */
export function ValuationRowActions({ id, folio, archived, canCreate, canDelete }: { id: string; folio: string; archived: boolean; canCreate: boolean; canDelete: boolean }) {
  // Rendered inside the app: the router refreshes the list; elsewhere (a static render), the page reloads.
  const router = useContext(AppRouterContext);
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const run = async (action: () => Promise<string>) => {
    setPending(true);
    try {
      toast.success(await action());
      if (router) router.refresh();
      else window.location.reload();
    } catch (error) {
      toast.error(errorText(error, "No se pudo completar la acción."));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Más acciones del avalúo ${folio}`} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {canCreate ? (
            <DropdownMenuItem
              onClick={() => void run(async () => {
                const copy = await api.valuations.duplicate(id);
                return `Avalúo duplicado como ${copy.folio}.`;
              })}
            >
              <Copy />
              Duplicar
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() => void run(async () => {
              await api.valuations.archive(id, !archived);
              return archived ? `Avalúo ${folio} devuelto a la lista.` : `Avalúo ${folio} archivado. Lo encuentras con el filtro "Archivados".`;
            })}
          >
            {archived ? <ArchiveRestore /> : <Archive />}
            {archived ? "Desarchivar" : "Archivar"}
          </DropdownMenuItem>
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmingDelete(true)}>
                <Trash2 />
                Eliminar
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el avalúo {folio}?</AlertDialogTitle>
            <AlertDialogDescription>
              Desaparece de la lista del despacho con su documento, sus cálculos y sus archivos. Si solo quieres apartarlo, usa &quot;Archivar&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void run(async () => {
                await api.valuations.remove(id);
                return `Avalúo ${folio} eliminado.`;
              })}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
