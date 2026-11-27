"use client";

import { ChevronDown, ClipboardPaste, PencilLine, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ListingReading } from "@/features/ai/listing-prefill";
import type { ComparableType } from "@/features/valuations/calculation/market-types";
import type { PendingImages } from "@/features/valuations/comparable-search/listing-images";
import { PasteListingDialog } from "./paste-listing-dialog";

/** The two ways to add one comparable, as the menu says them. */
export const ADD_COMPARABLE_OPTIONS = {
  byHand: "Capturar a mano",
  paste: "Pegar anuncio",
} as const;

/**
 * «Agregar comparable» (V8.12, 00:23: «con pegar anuncio yo quiero agregar un
 * comparable; esta función debería estar aquí adentro»): one button that asks
 * how — capture it by hand in an empty card, or paste a listing and open its
 * card already filled. Without the AI assistance it is the plain button.
 */
export function AddComparableMenu(props: {
  valuationId: string;
  type: ComparableType;
  priceLabel: string;
  /** «Pegar anuncio» is offered: the installation has the AI assistance. */
  pasteListing: boolean;
  onByHand: () => void;
  onListing: (reading: ListingReading, listingText: string, images: PendingImages) => void;
}) {
  const [pasting, setPasting] = useState(false);
  if (!props.pasteListing) {
    return (
      <Button type="button" size="sm" onClick={props.onByHand}>
        <Plus data-icon="inline-start" /> Agregar comparable
      </Button>
    );
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={(
            <Button type="button" size="sm" data-add-comparable-menu>
              <Plus data-icon="inline-start" /> Agregar comparable <ChevronDown data-icon="inline-end" />
            </Button>
          )}
        />
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuItem className="min-h-11 items-start" onClick={props.onByHand}>
            <PencilLine className="mt-0.5" />
            <span className="grid">
              <span className="font-medium">{ADD_COMPARABLE_OPTIONS.byHand}</span>
              <span className="text-xs text-muted-foreground">Abre una ficha vacía.</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11 items-start" onClick={() => setPasting(true)}>
            <ClipboardPaste className="mt-0.5" />
            <span className="grid">
              <span className="font-medium">{ADD_COMPARABLE_OPTIONS.paste}</span>
              <span className="text-xs text-muted-foreground">Pega el texto y la liga del anuncio; la ficha se abre con sus datos.</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PasteListingDialog
        open={pasting}
        onOpenChange={setPasting}
        valuationId={props.valuationId}
        type={props.type}
        priceLabel={props.priceLabel}
        onUse={props.onListing}
      />
    </>
  );
}
