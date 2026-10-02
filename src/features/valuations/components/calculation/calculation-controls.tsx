"use client";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ROUNDING_OPTIONS, SURFACE_POWERS, type RoundingDigits } from "@/features/valuations/engine/config";

const NONE = "none";

/** How many digits a value is rounded to; the appraiser's choice. */
export function RoundingSelect(props: { id?: string; label: string; value: RoundingDigits; onChange: (digits: RoundingDigits) => void }) {
  return (
    <NativeSelect
      id={props.id}
      aria-label={props.label}
      className="w-full"
      value={props.value === null ? NONE : String(props.value)}
      onChange={(event) => props.onChange(event.target.value === NONE ? null : Number(event.target.value))}
    >
      {ROUNDING_OPTIONS.map((option) => (
        <NativeSelectOption key={option.label} value={option.digits === null ? NONE : String(option.digits)}>{option.label}</NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** Power n of the surface factor: 3, 6, 9 or 12. A stored value outside them stays visible until it is changed. */
export function SurfacePowerSelect(props: { id: string; value: number; onChange: (power: number) => void }) {
  const known = (SURFACE_POWERS as readonly number[]).includes(props.value);
  return (
    <NativeSelect id={props.id} className="w-full" value={String(props.value)} onChange={(event) => props.onChange(Number(event.target.value))}>
      {known ? null : <NativeSelectOption value={String(props.value)}>{props.value} (elige 3, 6, 9 o 12)</NativeSelectOption>}
      {SURFACE_POWERS.map((power) => <NativeSelectOption key={power} value={String(power)}>{power}</NativeSelectOption>)}
    </NativeSelect>
  );
}
