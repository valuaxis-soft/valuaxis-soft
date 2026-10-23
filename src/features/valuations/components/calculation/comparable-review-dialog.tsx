"use client";

import { AlertTriangle, ClipboardCheck, ExternalLink, Image as ImageIcon, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatComparableId } from "@/features/valuations/calculation/comparable-card";
import type { ReviewRowDto } from "@/features/valuations/calculation/comparable-card.service";
import {
  PENDING_REVIEW,
  REVIEW_CHECKS,
  REVIEW_CHECK_LABELS,
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  type ComparableReviewDto,
  type ReviewCheck,
  type ReviewStatus,
} from "@/features/valuations/calculation/comparable-review";
import { COMPARABLE_TYPE_LABELS, isLandComparableType, isRentComparableType } from "@/features/valuations/calculation/market-types";
import { api, SessionExpiredError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ComparableCardButton } from "./comparable-card-dialog";

const money = (value: number | null) => (value === null ? "—" : value.toLocaleString("es-MX", { style: "currency", currency: "MXN" }));
const errorMessage = (error: unknown) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : "No se pudo guardar la revisión.";

const STATUS_TONES: Record<ReviewStatus, string> = {
  POR_REVISAR: "text-muted-foreground",
  VERIFICADO: "text-emerald-700 dark:text-emerald-400",
  CON_OBSERVACIONES: "text-amber-700 dark:text-amber-400",
  RECHAZADO: "text-destructive",
};

/** One comparable under review: its listing and screenshot to open, the checklist and the notes. */
function ReviewRow(props: { row: ReviewRowDto; readOnly: boolean; onSaved: (review: ComparableReviewDto) => void; valuationId: string }) {
  const { comparable, type, warnings } = props.row;
  const stored = comparable.review ?? PENDING_REVIEW;
  const [status, setStatus] = useState<ReviewStatus>(stored.status);
  const [checks, setChecks] = useState<Partial<Record<ReviewCheck, boolean>>>(stored.checks);
  const [notes, setNotes] = useState(stored.notes ?? "");
  const [saving, setSaving] = useState(false);
  const id = formatComparableId(comparable.folio);
  const unitValue = comparable.area && comparable.price ? comparable.price / comparable.area : null;
  const checksShown = REVIEW_CHECKS.filter((check) => check !== "builtArea" || !isLandComparableType(type));
  const changed = status !== stored.status || notes.trim() !== (stored.notes ?? "") || JSON.stringify(checks) !== JSON.stringify(stored.checks);

  const save = async () => {
    setSaving(true);
    try {
      const review = await api.market.saveReview(props.valuationId, comparable.id, { status, checks, notes: notes.trim() || null });
      props.onSaved(review);
      toast.success(`Revisión de ${id ?? `comparable ${comparable.reference}`} guardada.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="grid gap-2 rounded-md border bg-background p-3" data-review-row={id ?? comparable.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className="font-mono">{id ?? "Sin número"}</span>
            <Badge variant="secondary">{COMPARABLE_TYPE_LABELS[type]} · {comparable.reference}</Badge>
            <span className={cn("text-xs", STATUS_TONES[stored.status])}>{REVIEW_STATUS_LABELS[stored.status]}</span>
          </p>
          <p className="truncate text-sm">{comparable.location}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {money(comparable.price)} · {comparable.area ?? "—"} m² · {money(unitValue)} {isRentComparableType(type) ? "/m²/mes" : "/m²"}
            {comparable.contactName || comparable.contactPhone ? ` · ${[comparable.contactName, comparable.contactPhone].filter(Boolean).join(", ")}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {comparable.url ? (
            <a className={cn(buttonVariants({ size: "sm", variant: "outline" }))} href={comparable.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink data-icon="inline-start" /> Abrir anuncio
            </a>
          ) : <Button type="button" size="sm" variant="outline" disabled>Sin liga</Button>}
          {comparable.screenshot?.url ? (
            <a className={cn(buttonVariants({ size: "sm", variant: "outline" }))} href={comparable.screenshot.url} target="_blank" rel="noopener noreferrer">
              <ImageIcon data-icon="inline-start" /> Ver pantalla de referencia
            </a>
          ) : <Button type="button" size="sm" variant="outline" disabled>Sin pantalla</Button>}
          <ComparableCardButton comparableId={comparable.id} />
        </div>
      </div>

      {warnings.length ? (
        <ul className="grid gap-0.5 text-xs text-amber-700 dark:text-amber-400" data-review-warnings>
          {warnings.map((warning) => (
            <li key={warning.key} className="flex items-start gap-1"><AlertTriangle className="mt-0.5 size-3 shrink-0" /> {warning.message}</li>
          ))}
        </ul>
      ) : null}

      <fieldset disabled={props.readOnly || saving} className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="grid content-start gap-2">
          <label className="grid gap-1 text-xs">
            Estado
            <NativeSelect className="w-full" value={status} onChange={(event) => setStatus(event.target.value as ReviewStatus)} aria-label={`Estado de ${id ?? comparable.reference}`}>
              {REVIEW_STATUSES.map((item) => <NativeSelectOption key={item} value={item}>{REVIEW_STATUS_LABELS[item]}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <ul className="grid gap-1 text-xs">
            {checksShown.map((check) => (
              <li key={check}>
                <label className="flex items-center gap-1.5">
                  <Checkbox
                    checked={checks[check] === true}
                    onCheckedChange={(checked) => setChecks((current) => ({ ...current, [check]: checked === true }))}
                  />
                  {REVIEW_CHECK_LABELS[check]}
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid content-start gap-2">
          <label className="grid gap-1 text-xs">
            Notas de la revisión
            <Textarea rows={4} value={notes} placeholder="Qué no coincide con el anuncio, qué se corrigió…" onChange={(event) => setNotes(event.target.value)} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {stored.reviewedBy ? `Revisado por ${stored.reviewedBy}${stored.reviewedAt ? ` el ${new Date(stored.reviewedAt).toLocaleString("es-MX")}` : ""}` : "Sin revisar"}
            </span>
            {!props.readOnly ? (
              <Button type="button" size="sm" disabled={saving || !changed} onClick={() => void save()}>
                {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
                Guardar revisión
              </Button>
            ) : null}
          </div>
        </div>
      </fieldset>
    </li>
  );
}

/**
 * "Revisión de comparables": every comparable of the valuation, across its
 * markets, to check against its listing. The state changes no calculation and
 * blocks nothing; it is the appraiser's record of what he verified.
 */
export function ComparableReviewDialog(props: {
  valuationId: string;
  readOnly: boolean;
  onReviewed: (comparableId: string, review: ComparableReviewDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ReviewRowDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setRows(null);
    setError(null);
    api.market.review(props.valuationId)
      .then(setRows)
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "No se pudo cargar la revisión."));
  };

  const saved = (comparableId: string, review: ComparableReviewDto) => {
    setRows((current) => current?.map((row) => (row.comparable.id === comparableId ? { ...row, comparable: { ...row.comparable, review } } : row)) ?? null);
    props.onReviewed(comparableId, review);
  };

  const counts = REVIEW_STATUSES.map((status) => [status, rows?.filter((row) => (row.comparable.review?.status ?? "POR_REVISAR") === status).length ?? 0] as const);

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => { setOpen(true); load(); }}>
        <ClipboardCheck data-icon="inline-start" /> Revisión de comparables
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Revisión de comparables</DialogTitle>
            <DialogDescription>
              Abre cada anuncio en otra pestaña y compara la foto, el precio, las superficies, el contacto y la dirección. El estado es tu registro
              de la revisión: no cambia ningún cálculo ni impide concluir.
            </DialogDescription>
          </DialogHeader>
          {rows ? (
            <p className="flex flex-wrap gap-3 text-xs" aria-live="polite">
              {counts.map(([status, count]) => (
                <span key={status} className={STATUS_TONES[status]}>{REVIEW_STATUS_LABELS[status]}: {count}</span>
              ))}
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          {!rows && !error ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Cargando los comparables…</p>
          ) : null}
          {rows ? (
            <ul className="grid gap-3">
              {rows.map((row) => (
                <ReviewRow
                  key={row.comparable.id}
                  row={row}
                  readOnly={props.readOnly}
                  valuationId={props.valuationId}
                  onSaved={(review) => saved(row.comparable.id, review)}
                />
              ))}
              {!rows.length ? <li className="text-sm text-muted-foreground">El avalúo no tiene comparables.</li> : null}
            </ul>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
