"use client";

import { Plus, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_OFFER_LABELS,
  MAX_OFFER_OPTIONS,
  type MarketSettingsDto,
} from "@/features/valuations/calculation/market-types";
import { CommitCell } from "./commit-cell";

type OfferCapture = Pick<MarketSettingsDto, "offerLabels" | "offerMark" | "offerIntro">;

/**
 * "Nivel de oferta observada": the sentence, up to six options in the 3 × 2
 * grid the dictamen prints (read down each column) and the X on the one
 * observed. The options start as the six of the format and may be renamed.
 */
export function MarketOfferLevel(props: {
  labels: string[];
  mark: number | null;
  intro: string | null;
  defaultIntro: string;
  readOnly: boolean;
  onChange: (offer: OfferCapture) => void;
}) {
  const { labels, mark, readOnly } = props;
  const save = (patch: Partial<OfferCapture>) => props.onChange({ offerLabels: labels, offerMark: mark, offerIntro: props.intro, ...patch });
  const isDefault = labels.length === DEFAULT_OFFER_LABELS.length && labels.every((label, index) => label === DEFAULT_OFFER_LABELS[index]);
  const remove = (index: number) => save({
    offerLabels: labels.filter((_, at) => at !== index),
    offerMark: mark === null || mark === index ? null : mark > index ? mark - 1 : mark,
  });
  // Read down each column, as printed: 1 over 2, 3 over 4, 5 over 6.
  const places = Array.from({ length: MAX_OFFER_OPTIONS }, (_, index) => index);

  return (
    <fieldset className="grid gap-2 rounded-md border bg-background p-2.5" disabled={readOnly}>
      <legend className="px-1 text-xs font-medium">Nivel de oferta observada</legend>
      <CommitCell
        ariaLabel="Texto del nivel de oferta"
        value={props.intro ?? ""}
        placeholder={props.defaultIntro}
        onCommit={(text) => save({ offerIntro: text.trim() || null })}
        className="border-input"
      />
      <div className="grid grid-flow-col grid-cols-3 grid-rows-2 gap-1.5" role="radiogroup" aria-label="Nivel de oferta observado">
        {places.map((index) => {
          const label = labels[index];
          if (label === undefined) {
            return index === labels.length && !readOnly ? (
              <Button key={index} type="button" size="sm" variant="ghost" className="justify-start" onClick={() => save({ offerLabels: [...labels, "OPCIÓN"] })}>
                <Plus data-icon="inline-start" /> Agregar opción
              </Button>
            ) : <span key={index} />;
          }
          return (
            <div key={index} className="flex items-center gap-1">
              <button
                type="button"
                role="radio"
                aria-checked={mark === index}
                aria-label={`Marcar ${label}`}
                className="h-7 w-9 shrink-0 rounded-sm border text-xs font-bold tabular-nums hover:bg-muted"
                onClick={() => save({ offerMark: mark === index ? null : index })}
              >
                {mark === index ? "( X )" : "(   )"}
              </button>
              <CommitCell ariaLabel={`Opción ${index + 1} del nivel de oferta`} value={label} onCommit={(text) => {
                if (text.trim()) save({ offerLabels: labels.map((item, at) => (at === index ? text.trim() : item)) });
              }} />
              {!readOnly && labels.length > 1 ? (
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar ${label}`} onClick={() => remove(index)}>
                  <X />
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        Haz clic en el paréntesis para marcar la X; sin marca, el dictamen no imprime el nivel de oferta.
        {!isDefault && !readOnly ? (
          <Button type="button" size="sm" variant="link" className="h-auto px-0" onClick={() => save({ offerLabels: null, offerMark: null })}>
            <RotateCcw data-icon="inline-start" /> Volver a las seis del formato
          </Button>
        ) : null}
      </p>
    </fieldset>
  );
}
