"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAiAssist } from "@/features/ai/ai-assist-context";
import type { ComparableType } from "@/features/valuations/calculation/market-types";
import { AiComparableSearchPanel, useAiComparableSearch, type MachineryListingChoice } from "./ai-comparable-search";
import { useExpandableDialog } from "./expandable-dialog";

/** Sale or rent of machinery: the market type its cards are kept under in the firm's base (never land). */
const OPERATIONS: Array<{ type: ComparableType; label: string }> = [
  { type: "INMUEBLE_VENTA", label: "En venta" },
  { type: "INMUEBLE_RENTA", label: "En renta" },
];

function SearchFor(props: { valuationId: string; type: ComparableType; readOnly: boolean; open: boolean; onOffers: (chosen: MachineryListingChoice[]) => void; onClose: () => void }) {
  const search = useAiComparableSearch(props.valuationId, props.type, props.open, "machinery");
  return <AiComparableSearchPanel search={search} type={props.type} readOnly={props.readOnly} onMachineryOffers={props.onOffers} onClose={props.onClose} />;
}

/**
 * «Buscar con IA» of the machinery panel (audio of 26 nov 2026: «también desde
 * el panel de maquinaria… venta y renta»): the same search as the markets, for
 * the kinds of the machinery catalog. The listings chosen become cards of the
 * firm's base and offers of this market approach.
 */
export function MachineryAiSearch(props: { valuationId: string; readOnly: boolean; onOffers: (chosen: MachineryListingChoice[]) => void }) {
  const ai = useAiAssist();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ComparableType>("INMUEBLE_VENTA");
  const expandable = useExpandableDialog();
  if (!ai.enabled) return null;
  return (
    <>
      <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setOpen(true)} data-machinery-ai-search>
        <Sparkles data-icon="inline-start" /> Buscar con IA
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={expandable.className("max-h-[90vh] overflow-y-auto sm:max-w-5xl")}>
          {expandable.button}
          <DialogHeader>
            <DialogTitle>Buscar con IA: maquinaria y equipo</DialogTitle>
            <DialogDescription>
              Describe la máquina o el equipo que buscas. La IA busca anuncios en la web y te los presenta en una tabla; los que elijas se guardan como fichas en la base
              del despacho y se agregan como ofertas de este enfoque. Son anuncios sin verificar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Operación">
            {OPERATIONS.map((operation) => (
              <Button
                key={operation.type}
                type="button"
                size="sm"
                variant={type === operation.type ? "default" : "outline"}
                aria-pressed={type === operation.type}
                onClick={() => setType(operation.type)}
              >
                {operation.label}
              </Button>
            ))}
          </div>
          <SearchFor key={type} valuationId={props.valuationId} type={type} readOnly={props.readOnly} open={open} onOffers={props.onOffers} onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
