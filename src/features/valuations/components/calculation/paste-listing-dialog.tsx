"use client";

import { ClipboardPaste, Info, Loader2 } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AI_NOTICE } from "@/features/ai/ai-assist-context";
import { LISTING_TEXT_MAX, LISTING_TEXT_MIN } from "@/features/ai/listing-extraction";
import { listingRows, type ComparablePrefill, type ListingRow } from "@/features/ai/listing-prefill";
import type { ComparableType } from "@/features/valuations/calculation/market-types";
import { api, SessionExpiredError } from "@/lib/api-client";

const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudieron leer los datos del anuncio.";

type Review = { rows: ListingRow[]; notices: string[]; discarded: number };

/**
 * "Pegar anuncio": the appraiser pastes the text of a listing, reviews the
 * data read from it next to the fragment each one came from, corrects what
 * is needed and sends it to the comparable form. Nothing is saved here.
 */
export function PasteListingDialog({
  valuationId,
  type,
  priceLabel,
  onUse,
}: {
  valuationId: string;
  type: ComparableType;
  priceLabel: string;
  /** Opens the comparable form with these values; the appraiser still saves it. */
  onUse: (values: ComparablePrefill) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  // Only the answer to the last request is shown.
  const lastRequest = useRef(0);

  const reset = () => {
    lastRequest.current += 1;
    setText("");
    setUrl("");
    setBusy(false);
    setError(null);
    setReview(null);
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
      setReview({ ...listingRows(proposal, type, priceLabel), discarded: proposal.discarded.length });
    } catch (failure) {
      if (current === lastRequest.current) setError(errorMessage(failure));
    } finally {
      if (current === lastRequest.current) setBusy(false);
    }
  };

  const edit = (field: ListingRow["field"], value: string) =>
    setReview((current) => current && { ...current, rows: current.rows.map((row) => (row.field === field ? { ...row, value } : row)) });

  const use = () => {
    if (!review) return;
    onUse(Object.fromEntries(review.rows.filter((row) => row.value.trim()).map((row) => [row.field, row.value.trim()])));
    setOpen(false);
    reset();
  };

  const found = review?.rows.filter((row) => row.evidence).length ?? 0;

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ClipboardPaste data-icon="inline-start" /> Pegar anuncio
      </Button>
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Pegar anuncio</DialogTitle>
            <DialogDescription>
              {review
                ? "Revisa cada dato contra el fragmento del anuncio de donde se leyó y corrige lo que haga falta. Lo que el anuncio no dice queda vacío."
                : "Pega el texto de un anuncio y se leerán los datos que trae escritos para llenar el comparable. No se estima ni se completa nada que el anuncio no diga."}
            </DialogDescription>
          </DialogHeader>

          {!review ? (
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
              {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            </form>
          ) : (
            <div className="grid gap-3">
              <p className="text-sm" aria-live="polite">
                <span className="font-medium">{found} dato{found === 1 ? "" : "s"} leído{found === 1 ? "" : "s"} del anuncio.</span>
                {review.discarded ? (
                  <span className="text-muted-foreground"> Se descart{review.discarded === 1 ? "ó 1 dato" : `aron ${review.discarded} datos`} que no se pudo{review.discarded === 1 ? "" : "ieron"} comprobar en el texto.</span>
                ) : null}
              </p>
              {review.notices.map((notice) => (
                <p key={notice} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <Info className="mt-0.5 size-3.5 shrink-0" /> {notice}
                </p>
              ))}
              <div className="grid gap-2">
                {review.rows.map((row) => (
                  <div key={row.field} className="grid gap-1 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,1fr)] sm:items-start sm:gap-3" data-listing-field={row.field}>
                    <label htmlFor={`listing-${row.field}`} className="pt-1.5 text-sm">{row.label}</label>
                    <Input
                      id={`listing-${row.field}`}
                      type={row.field === "offerDate" ? "date" : "text"}
                      value={row.value}
                      onChange={(event) => edit(row.field, event.target.value)}
                    />
                    <div className="pt-1.5 text-xs text-muted-foreground">
                      {row.evidence ? <q className="break-words" data-evidence>{row.evidence}</q> : <span>El anuncio no lo dice.</span>}
                      {row.note ? <p className="mt-0.5 text-amber-700 dark:text-amber-400">{row.note}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">{AI_NOTICE}</p>

          <DialogFooter>
            {review ? (
              <>
                <Button type="button" variant="ghost" onClick={() => { setReview(null); setError(null); }}>Volver al texto</Button>
                <Button type="button" onClick={use}>Usar estos datos</Button>
              </>
            ) : (
              <>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => { setOpen(false); reset(); }}>Cancelar</Button>
                <Button type="submit" form="paste-listing-form" disabled={busy}>
                  {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
                  {busy ? "Leyendo el anuncio…" : "Extraer datos"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
