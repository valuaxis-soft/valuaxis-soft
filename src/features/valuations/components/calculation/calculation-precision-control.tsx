"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api } from "@/lib/api-client";
import {
  DISPLAY_DECIMALS,
  LEGACY_PRECISION,
  PRECISION_NOTE,
  type CalculationPrecision,
  type DisplayDecimals,
} from "@/features/valuations/calculation/calculation-precision";

/**
 * "Precisión del cálculo" of the valuation, in every panel that has factors:
 * the decimals they show and whether the valuation calculates with them. One
 * choice for the whole valuation; saving it recomputes every approach, and
 * `onChanged` reloads the panel.
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
