"use client";

import { useId } from "react";

import { formatComparableId, formatDay } from "@/features/valuations/calculation/comparable-card";
import type { DuplicateMatchDto } from "@/features/valuations/calculation/comparable-card.service";
import { comparableMarketLabel, type ComparableClass } from "@/features/valuations/calculation/comparable-classes";
import { DUPLICATE_REASON_LABELS } from "@/features/valuations/calculation/comparable-duplicates";
import { cn } from "@/lib/utils";
import { ComparableCardButton } from "./comparable-card-dialog";

/**
 * What the appraiser answers to a possible duplicate (V8.12): use the one of
 * the base as it is, update its card with what he captures now, or keep both.
 */
export type DuplicateDecision =
  | { action: "reuse"; comparableId: string }
  | { action: "update"; comparableId: string }
  | { action: "different" };

/** The three answers, as the card says them. */
export const DUPLICATE_ANSWERS = {
  reuse: "Usar el comparable existente",
  update: "Es el mismo: actualizar los datos de su ficha",
  different: "Es diferente: crear otra ficha",
} as const;

/** What each answer does, said under it. */
export const DUPLICATE_ANSWER_HINTS = {
  reuse: "Se agrega tal como está en la base, con su número, fotos y pantalla de referencia; lo que capturaste aquí no se guarda.",
  update: "Conserva su número, fotos y pantalla; sus datos pasan a ser los que capturaste, para este avalúo y los que vengan. Los avalúos concluidos no cambian.",
  different: "Se guarda como un comparable nuevo, con su propio número.",
} as const;

const money = (value: number | null) => (value === null ? "—" : value.toLocaleString("es-MX", { style: "currency", currency: "MXN" }));

export const sameDecision = (left: DuplicateDecision | null, right: DuplicateDecision) =>
  left?.action === right.action && (right.action === "different" || (left as { comparableId?: string }).comparableId === right.comparableId);

/**
 * The comparables of the base a capture matches and the three answers, as
 * radio buttons: nothing happens until the appraiser chooses one and saves.
 * «Ver ficha» opens the card of the one of the base, apart from the answers.
 * `compact`: the short version beside the save button.
 */
export function DuplicateChoice(props: {
  matches: DuplicateMatchDto[];
  assetClass: ComparableClass;
  decision: DuplicateDecision | null;
  onDecision: (decision: DuplicateDecision) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const name = useId();
  const option = (decision: DuplicateDecision, label: string, hint: string | null) => (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5",
        props.disabled && "cursor-not-allowed opacity-60",
      )}
      data-duplicate-answer={decision.action}
    >
      <input
        type="radio"
        name={name}
        className="mt-1 accent-primary"
        checked={sameDecision(props.decision, decision)}
        disabled={props.disabled}
        onChange={() => props.onDecision(decision)}
      />
      <span className="grid">
        <span className="font-medium">{label}</span>
        {hint && !props.compact ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
  return (
    <div className="grid gap-2" role="radiogroup" aria-label="Qué hacer con el posible duplicado">
      {props.matches.map((match) => {
        const folio = formatComparableId(match.folio) ?? "un comparable sin número";
        return (
          <div key={match.comparableId} className="grid gap-2 rounded-md border bg-background p-2" data-duplicate={formatComparableId(match.folio) ?? match.comparableId}>
            <div className="flex flex-wrap items-start gap-2">
              {match.thumbnailUrl && !props.compact ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={match.thumbnailUrl} alt="" className="size-12 rounded object-cover" />
              ) : null}
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  Coincide con <span className="font-mono">{folio}</span> · {match.location}
                </p>
                {!props.compact ? (
                  <p className="text-xs text-muted-foreground">
                    {comparableMarketLabel(match.type, props.assetClass)} · {money(match.price)}
                    {match.area ? ` · ${match.area.toLocaleString("es-MX", { maximumFractionDigits: 2 })} m²` : ""}
                    {match.contactPhone ? ` · tel. ${match.contactPhone}` : ""} · {match.valuation ? `avalúo ${match.valuation.folio}` : "base general"}
                    {match.sameValuation ? " (este avalúo)" : ""} · datos del {formatDay(match.updatedOn)}
                  </p>
                ) : null}
                <p className="text-xs font-medium text-foreground">Coinciden: {match.reasons.map((reason) => DUPLICATE_REASON_LABELS[reason]).join(", ")}</p>
              </div>
              <ComparableCardButton comparableId={match.comparableId} />
            </div>
            <div className={cn("grid gap-1.5", !props.compact && "sm:grid-cols-2")}>
              {option({ action: "reuse", comparableId: match.comparableId }, DUPLICATE_ANSWERS.reuse, DUPLICATE_ANSWER_HINTS.reuse)}
              {option({ action: "update", comparableId: match.comparableId }, DUPLICATE_ANSWERS.update, DUPLICATE_ANSWER_HINTS.update)}
            </div>
          </div>
        );
      })}
      {option({ action: "different" }, DUPLICATE_ANSWERS.different, DUPLICATE_ANSWER_HINTS.different)}
    </div>
  );
}
