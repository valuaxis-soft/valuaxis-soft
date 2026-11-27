"use client";

import { CircleHelp, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api-client";
import {
  DISPLAY_DECIMALS,
  LEGACY_PRECISION,
  PRECISION_NOTE,
  type CalculationPrecision,
  type DisplayDecimals,
} from "@/features/valuations/calculation/calculation-precision";

/** The event that takes the editor to a section by its key ("CARATULA"): the workspace listens for it. */
export const OPEN_SECTION_EVENT = "valuaxis:open-section";

/** A place of the valuation to go to: its section (by id or by key) and, in it, what to show (a CSS selector). */
export type ValuationPlace = { sectionId?: string; sectionKey?: string; selector?: string };

/**
 * Takes the editor to a place of the valuation, as «Buscar valor» does: its
 * section opens and, once it is drawn, the element is brought into view and
 * blinks (the links of «Vinculado», video 8.5, 13:20).
 */
export function openValuationPlace(place: ValuationPlace) {
  window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, { detail: place }));
  if (!place.selector) return;
  const selector = place.selector;
  let tries = 0;
  const find = () => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
      tries += 1;
      if (tries < 20) window.setTimeout(find, 100);
      return;
    }
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    element.dataset.placeFound = "";
    window.setTimeout(() => delete element.dataset.placeFound, 2000);
  };
  window.setTimeout(find, 100);
}

/**
 * What the precision in force means, in words the appraiser reads at once:
 * the decimals the factors show and how they multiply.
 */
export function precisionExplanation(precision: CalculationPrecision | undefined) {
  const { decimals, calculateWithShown } = precision ?? LEGACY_PRECISION;
  return calculateWithShown
    ? `Los factores se ven con ${decimals} decimales y se multiplican tal como se ven: lo impreso cuadra con la cuenta (14,361.99 × 0.97 = 13,931.13).`
    : `Los factores se ven con ${decimals} decimales, pero se multiplican con todos sus decimales, como Excel por omisión: un factor que se ve 0.97 puede ser 0.9683 (14,361.99 × 0.9683 = 13,906.44).`;
}

/**
 * The precision, as a discreet «?» beside the homologation: what it means and
 * where it is chosen, Carátula › Configuración del avalúo. Not a sentence over
 * the table (video 8.13, 18:34: «no quiero esto aquí… necesito que sean
 * claros»); the control itself lives only in the carátula (video 7.4, 00:00).
 */
export function CalculationPrecisionSummary({ precision }: { precision: CalculationPrecision | undefined }) {
  const current = precision ?? LEGACY_PRECISION;
  return (
    <Popover>
      <PopoverTrigger
        render={(
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
            aria-label="¿Con cuántos decimales se calculan los factores?"
            title="¿Con cuántos decimales se calculan los factores?"
            data-calculation-precision-summary=""
          />
        )}
      >
        <CircleHelp className="size-3.5" aria-hidden />
        <span>Decimales</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-80 gap-2 p-3 text-xs" data-calculation-precision-help="">
        <p className="text-sm font-medium">Decimales de los factores: {current.decimals}</p>
        <p className="text-muted-foreground">{precisionExplanation(current)}</p>
        <p className="text-muted-foreground">Es una sola elección para todo el avalúo: la homologación, los costos y la memoria la usan igual.</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit"
          onClick={() => openValuationPlace({ sectionKey: "CARATULA", selector: "[data-calculation-precision]" })}
        >
          Cambiarla en Carátula › Configuración del avalúo
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * "Precisión del cálculo" of the valuation, in Carátula › Configuración del
 * avalúo: the decimals the factors show and whether the valuation calculates
 * with them. One choice for the whole valuation; saving it recomputes every
 * approach, and `onChanged` reloads what shows it.
 */
export function CalculationPrecisionControl(props: {
  valuationId: string;
  precision: CalculationPrecision | undefined;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const current = props.precision ?? LEGACY_PRECISION;
  const [saving, setSaving] = useState(false);
  const save = async (next: CalculationPrecision) => {
    if (props.readOnly || (next.decimals === current.decimals && next.calculateWithShown === current.calculateWithShown)) return;
    setSaving(true);
    try {
      await api.precision.save(props.valuationId, next);
      toast.success("Precisión del cálculo guardada: se recalcularon los enfoques.");
      props.onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la precisión del cálculo.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="grid gap-1.5 rounded-md border bg-background p-3 text-sm" data-calculation-precision="">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-medium">Precisión del cálculo (todo el avalúo)</span>
        <label className="flex items-center gap-1.5">
          Decimales de los factores
          <NativeSelect
            aria-label="Decimales a mostrar"
            className="w-20"
            disabled={props.readOnly || saving}
            value={String(current.decimals)}
            onChange={(event) => void save({ ...current, decimals: Number(event.target.value) as DisplayDecimals })}
          >
            {DISPLAY_DECIMALS.map((digits) => <NativeSelectOption key={digits} value={String(digits)}>{digits}</NativeSelectOption>)}
          </NativeSelect>
        </label>
        <label className="flex items-center gap-1.5">
          <Checkbox
            checked={current.calculateWithShown}
            disabled={props.readOnly || saving}
            onCheckedChange={(checked) => void save({ ...current, calculateWithShown: checked === true })}
          />
          Calcular con la precisión mostrada
        </label>
        {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Recalculando" /> : null}
      </div>
      <p className="text-xs text-muted-foreground">{PRECISION_NOTE}</p>
    </div>
  );
}
