"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { adoptedValueConcludeError, marketsWithAdoptedValueOutside } from "@/features/valuations/calculation/adopted-value-check";
import { COMPARABLE_TYPES } from "@/features/valuations/calculation/market-types";
import type { ReportApproach } from "@/features/valuations/services/report-approaches";

/** Text the user accepts when reopening; it is stored with the reopening record. */
export const REOPEN_ACCEPTANCE_TEXT =
  "Entiendo que se creará una nueva versión editable del avalúo y que la versión concluida se conserva sin cambios.";

/**
 * Comparables of the valuation still "por revisar", read when the dialog
 * opens; null while unknown. A warning only: concluding is never blocked.
 */
function usePendingReviews(valuationId: string | undefined, open: boolean) {
  const [pending, setPending] = useState<{ valuationId: string; count: number } | null>(null);
  useEffect(() => {
    if (!open || !valuationId) return;
    let active = true;
    api.market.review(valuationId)
      .then((rows) => {
        if (active) setPending({ valuationId, count: rows.filter((row) => (row.comparable.review?.status ?? "POR_REVISAR") === "POR_REVISAR").length });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [open, valuationId]);
  return pending && pending.valuationId === valuationId ? pending.count : null;
}

/**
 * Why the valuation cannot conclude yet: a market of the dictamen with its
 * adopted value outside the ±30 %, read when the dialog opens; null while
 * unknown or when nothing holds it back. The server checks it again.
 */
function useAdoptedValueBlock(valuationId: string | undefined, open: boolean, excluded: ReadonlySet<ReportApproach>) {
  const [markets, setMarkets] = useState<{ valuationId: string; list: Awaited<ReturnType<typeof api.market.get>>[] } | null>(null);
  useEffect(() => {
    if (!open || !valuationId) return;
    let active = true;
    Promise.all(COMPARABLE_TYPES.map((type) => api.market.get(valuationId, type)))
      .then((list) => { if (active) setMarkets({ valuationId, list }); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [open, valuationId]);
  if (!markets || markets.valuationId !== valuationId) return null;
  return adoptedValueConcludeError(marketsWithAdoptedValueOutside(markets.list, excluded));
}

const NO_EXCLUSIONS: ReadonlySet<ReportApproach> = new Set();

export function ConcludeValuationDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
  hasUnsavedChanges,
  valuationId,
  excluded = NO_EXCLUSIONS,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
  hasUnsavedChanges: boolean;
  /** To warn about comparables not reviewed yet, and to hold back a value adopted outside its range. */
  valuationId?: string;
  /** The approaches left out of the dictamen: their markets do not hold the conclusion back. */
  excluded?: ReadonlySet<ReportApproach>;
}) {
  const unreviewed = usePendingReviews(valuationId, open);
  const blocked = useAdoptedValueBlock(valuationId, open, excluded);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Concluir el avalúo?</AlertDialogTitle>
          <AlertDialogDescription>
            La versión actual queda cerrada y ya no se podrá editar. Para corregirla después habrá que reabrirla, lo
            que crea una versión nueva.
            {hasUnsavedChanges ? " Antes de concluir se guardarán los cambios pendientes." : ""}
          </AlertDialogDescription>
          {unreviewed ? (
            <p className="text-sm text-amber-700 dark:text-amber-400" role="status" data-unreviewed-comparables>
              {unreviewed === 1 ? "Hay 1 comparable" : `Hay ${unreviewed} comparables`} por revisar en «Revisión de comparables». Puedes concluir de
              todos modos.
            </p>
          ) : null}
          {blocked ? (
            <p className="text-sm font-medium text-destructive" role="alert" data-adopted-outside>
              {blocked}
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction type="button" onClick={onConfirm} disabled={pending || Boolean(blocked)}>
            {pending ? "Concluyendo..." : "Concluir avalúo"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ReopenValuationDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  const [accepted, setAccepted] = useState(false);
  const canConfirm = reason.trim().length > 0 && accepted && !pending;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setReason("");
          setAccepted(false);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reabrir el avalúo</AlertDialogTitle>
          <AlertDialogDescription>
            Se creará una versión nueva para editar. La versión concluida se conserva tal como está.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="reopen-reason">Motivo de la reapertura</FieldLabel>
            <Textarea
              id="reopen-reason"
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Por ejemplo: corrección de la superficie de terreno."
              disabled={pending}
            />
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="reopen-accept"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
              disabled={pending}
            />
            <FieldLabel htmlFor="reopen-accept">{REOPEN_ACCEPTANCE_TEXT}</FieldLabel>
          </Field>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction type="button" onClick={() => onConfirm(reason.trim())} disabled={!canConfirm}>
            {pending ? "Reabriendo..." : "Reabrir avalúo"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
