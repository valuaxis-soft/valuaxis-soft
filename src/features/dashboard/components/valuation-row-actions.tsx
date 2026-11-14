"use client";

import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { Archive, ArchiveRestore, Copy, History, Loader2, MoreHorizontal, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { ValuationHistoryDialog } from "@/features/valuations/components/history/valuation-history-dialog";
import { api } from "@/lib/api-client";

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

export type ValuationRowView = "lista" | "archivados" | "papelera";

export type ValuationRowPermissions = {
  canCreate: boolean;
  /** Archive, delete to the trash and restore (AVALUO_EDITAR). */
  canEdit: boolean;
  /** «Eliminar definitivamente» from the trash (AVALUO_ELIMINAR_DEFINITIVO). */
  canPurge: boolean;
  /** Read a version and download its PDF from the history (AVALUO_EXPORTAR). */
  canExport: boolean;
};

/**
 * The "···" of a row of the list. In the list and the archive: «Historial»,
 * duplicate, archive and «Eliminar», which sends it to the trash with
 * «Deshacer». In the trash: «Restaurar» and «Eliminar definitivamente», which
 * asks to type the folio.
 */
export function ValuationRowActions({ id, folio, view, permissions }: { id: string; folio: string; view: ValuationRowView; permissions: ValuationRowPermissions }) {
  // Rendered inside the app: the router refreshes the list; elsewhere (a static render), the page reloads.
  const router = useContext(AppRouterContext);
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingPurge, setConfirmingPurge] = useState(false);
  const [typedFolio, setTypedFolio] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const refresh = () => {
    if (router) router.refresh();
    else window.location.reload();
  };

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    try {
      await action();
      refresh();
    } catch (error) {
      toast.error(errorText(error, "No pudimos completar la acción. Inténtalo de nuevo."));
    } finally {
      setPending(false);
    }
  };

  const restore = () => run(async () => {
    await api.valuations.restore(id);
    toast.success(`${folio} volvió a la lista de avalúos.`);
  });

  const moveToTrash = () => run(async () => {
    await api.valuations.remove(id);
    toast.success(`${folio} se fue a la papelera.`, {
      description: "Lo puedes restaurar durante 30 días desde «Papelera».",
      action: { label: "Deshacer", onClick: () => void restore() },
      duration: 10_000,
    });
  });

  const purge = () => run(async () => {
    await api.valuations.purge(id, typedFolio);
    setConfirmingPurge(false);
    toast.success(`${folio} se eliminó definitivamente.`);
  });

  const inTrash = view === "papelera";
  const archived = view === "archivados";
  const folioMatches = typedFolio.trim().toLowerCase() === folio.trim().toLowerCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" className="size-11 md:size-8" aria-label={`Más acciones del avalúo ${folio}`} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-52">
          {inTrash ? (
            <>
              {permissions.canEdit ? (
                <DropdownMenuItem onClick={() => void restore()}>
                  <RotateCcw />
                  Restaurar
                </DropdownMenuItem>
              ) : null}
              {permissions.canPurge ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => { setTypedFolio(""); setConfirmingPurge(true); }}>
                    <Trash2 />
                    Eliminar definitivamente
                  </DropdownMenuItem>
                </>
              ) : null}
              {!permissions.canEdit && !permissions.canPurge ? (
                <DropdownMenuItem disabled>Sin acciones con tu rol</DropdownMenuItem>
              ) : null}
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
                <History />
                Historial
              </DropdownMenuItem>
              {permissions.canCreate ? (
                <DropdownMenuItem
                  onClick={() => void run(async () => {
                    const copy = await api.valuations.duplicate(id);
                    toast.success(`Listo, la copia quedó como ${copy.folio}.`);
                  })}
                >
                  <Copy />
                  Duplicar
                </DropdownMenuItem>
              ) : null}
              {permissions.canEdit ? (
                <DropdownMenuItem
                  onClick={() => void run(async () => {
                    await api.valuations.archive(id, !archived);
                    toast.success(archived ? `${folio} volvió a la lista principal.` : `${folio} quedó archivado. Lo encuentras en «Archivados».`);
                  })}
                >
                  {archived ? <ArchiveRestore /> : <Archive />}
                  {archived ? "Desarchivar" : "Archivar"}
                </DropdownMenuItem>
              ) : null}
              {permissions.canEdit ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setConfirmingDelete(true)}>
                    <Trash2 />
                    Eliminar
                  </DropdownMenuItem>
                </>
              ) : null}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {inTrash ? null : (
        <ValuationHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} valuationId={id} folio={folio} canExport={permissions.canExport} />
      )}

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Mandar el avalúo {folio} a la papelera?</AlertDialogTitle>
            <AlertDialogDescription>
              Sale de la lista, de las búsquedas, del mapa y de los conteos, y nadie lo puede editar. Lo restauras desde «Papelera» durante 30 días, tal como estaba;
              después se elimina definitivamente. Si solo quieres apartarlo, usa «Archivar».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void moveToTrash()}>Mandar a la papelera</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmingPurge} onOpenChange={setConfirmingPurge}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-destructive" aria-hidden="true" />
              ¿Eliminar {folio} definitivamente?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ya no se podrá restaurar ni abrir: su documento, cálculos, versiones y PDF dejan de estar disponibles para el despacho. Esto no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="grid gap-1.5 text-sm">
            <span>
              Escribe el folio <strong className="font-mono">{folio}</strong> para confirmar
            </span>
            <Input value={typedFolio} onChange={(event) => setTypedFolio(event.target.value)} autoComplete="off" aria-label={`Escribe ${folio} para confirmar`} data-purge-confirm="" />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={!folioMatches || pending} onClick={() => void purge()}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}
              Eliminar definitivamente
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
