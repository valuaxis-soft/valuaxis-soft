"use client";

import { ExternalLink, IdCard, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ComparableCardDto } from "@/features/valuations/calculation/comparable-card.service";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ComparableCardView } from "./comparable-card-view";

/** The card of a comparable of the firm's base, read when it opens. */
function ComparableCardDialog({ comparableId, onClose }: { comparableId: string; onClose: () => void }) {
  const [state, setState] = useState<{ card: ComparableCardDto } | { error: string } | null>(null);

  useEffect(() => {
    let active = true;
    api.market.card(comparableId)
      .then((card) => { if (active) setState({ card }); })
      .catch((error: unknown) => { if (active) setState({ error: error instanceof Error ? error.message : "No se pudo cargar la ficha." }); });
    return () => { active = false; };
  }, [comparableId]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Ficha del comparable</DialogTitle>
          <DialogDescription>Revisa que la foto, el precio, las superficies, el contacto y la dirección coincidan con el anuncio.</DialogDescription>
        </DialogHeader>
        {state === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Cargando la ficha…</p>
        ) : "error" in state ? (
          <p className="text-sm text-destructive" role="alert">{state.error}</p>
        ) : (
          <ComparableCardView card={state.card} />
        )}
        <DialogFooter>
          <a className={cn(buttonVariants({ variant: "outline" }))} href={`/comparables/${comparableId}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink data-icon="inline-start" /> Abrir en otra pestaña
          </a>
          <Button type="button" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Ver ficha": opens the card of a comparable. */
export function ComparableCardButton({ comparableId, label, compact }: { comparableId: string; label?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size={compact ? "icon-sm" : "sm"}
        variant={compact ? "ghost" : "outline"}
        aria-label={label ?? "Ver ficha"}
        title={label ?? "Ver ficha"}
        onClick={() => setOpen(true)}
      >
        <IdCard data-icon={compact ? undefined : "inline-start"} />
        {compact ? null : "Ver ficha"}
      </Button>
      {open ? <ComparableCardDialog comparableId={comparableId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
