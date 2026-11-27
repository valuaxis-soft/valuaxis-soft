"use client";

import { Loader2 } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AI_NOTICE } from "@/features/ai/ai-assist-context";
import { LISTING_TEXT_MAX, LISTING_TEXT_MIN } from "@/features/ai/listing-extraction";
import { listingPrefill, type ListingReading } from "@/features/ai/listing-prefill";
import { todayInMexico } from "@/features/valuations/calculation/comparable-card";
import type { ComparableType } from "@/features/valuations/calculation/market-types";
import { imageCount, NO_IMAGES, type PendingImages } from "@/features/valuations/comparable-search/listing-images";
import { api, SessionExpiredError } from "@/lib/api-client";
import { ListingImagesPicker } from "./listing-images-picker";

const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudieron leer los datos del anuncio.";

/** The button that reads the listing: reading it is to create its card (V8.12, 11:40). */
export const PASTE_LISTING_SUBMIT = "Extraer datos y crear ficha";

/**
 * "Pegar anuncio", inside «Agregar comparable» (V8.12): the appraiser pastes
 * the text of a listing and its link, and «Extraer datos y crear ficha» opens
 * the comparable's card already filled, with the look of every card (Oferta,
 * Ubicación, Fuente de información, Terreno, Construcción…) and, under each
 * value, the fragment of the listing it was read from. Nothing is saved here:
 * the card is saved with «Guardar comparable».
 */
export function PasteListingDialog({
  open,
  onOpenChange,
  valuationId,
  type,
  priceLabel,
  onUse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  valuationId: string;
  type: ComparableType;
  priceLabel: string;
  /**
   * Opens the comparable's card with what was read (each value with its
   * fragment), the pasted text (kept as evidence) and the screenshot and
   * photos pasted for the listing, which go up when the card is saved.
   */
  onUse: (reading: ListingReading, listingText: string, images: PendingImages) => void;
}) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [images, setImages] = useState<PendingImages>(NO_IMAGES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the answer to the last request is used.
  const lastRequest = useRef(0);

  const reset = () => {
    lastRequest.current += 1;
    setText("");
    setUrl("");
    setImages(NO_IMAGES);
    setBusy(false);
    setError(null);
  };
  const close = () => {
    onOpenChange(false);
    reset();
  };

  const extract = async (event: FormEvent) => {
    event.preventDefault();
    if (text.trim().length < LISTING_TEXT_MIN) {
      setError(`Pega el texto completo del anuncio: al menos ${LISTING_TEXT_MIN} caracteres.`);
      return;
    }
    if (url.trim() && !/^https?:\/\//i.test(url.trim())) {
      setError("La liga debe empezar con http:// o https://.");
      return;
    }
    const current = ++lastRequest.current;
    setError(null);
    setBusy(true);
    try {
      const proposal = await api.ai.extractListing(valuationId, { text, url: url.trim() || null });
      if (current !== lastRequest.current) return;
      // Without a date in the listing, the offer is dated the day it is captured (V8.12, 06:37).
      onUse(listingPrefill(proposal, type, priceLabel, todayInMexico()), text.trim(), images);
      close();
    } catch (failure) {
      if (current === lastRequest.current) setError(errorMessage(failure));
    } finally {
      if (current === lastRequest.current) setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); else onOpenChange(true); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pegar anuncio</DialogTitle>
          <DialogDescription>
            Pega el texto de un anuncio y su liga. Se leen los datos que trae escritos y se abre la ficha del comparable con ellos, para que la revises y la guardes.
            No se estima ni se completa nada que el anuncio no diga.
          </DialogDescription>
        </DialogHeader>

        <form id="paste-listing-form" className="grid gap-3" onSubmit={(event) => void extract(event)} noValidate>
          <Field>
            <FieldLabel htmlFor="paste-listing-text">Texto del anuncio</FieldLabel>
            <Textarea
              id="paste-listing-text"
              className="max-h-72 min-h-48"
              autoFocus
              maxLength={LISTING_TEXT_MAX}
              placeholder="Copia el anuncio completo del portal y pégalo aquí."
              disabled={busy}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="paste-listing-url">Liga del anuncio (opcional)</FieldLabel>
            <Input id="paste-listing-url" type="url" placeholder="https://" maxLength={1000} disabled={busy} value={url} onChange={(event) => setUrl(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Captura del anuncio y fotos (opcional)</FieldLabel>
            <ListingImagesPicker
              images={images}
              onChange={setImages}
              label="Captura del anuncio y fotos"
              baseName="anuncio"
              disabled={busy}
              hint={imageCount(images) ? "Se guardan con el comparable al guardarlo." : "Ábrelo en tu navegador y toma la captura; Valuaxis no descarga nada del portal."}
            />
          </Field>
          {error ? <p className="text-sm text-destructive" role="alert" data-paste-listing-error>{error}</p> : null}
        </form>

        <p className="text-xs text-muted-foreground">{AI_NOTICE}</p>

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={close}>Cancelar</Button>
          <Button type="submit" form="paste-listing-form" disabled={busy}>
            {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
            {busy ? "Leyendo el anuncio…" : PASTE_LISTING_SUBMIT}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
