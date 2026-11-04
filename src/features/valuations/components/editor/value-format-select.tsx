"use client";

import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import type { ConceptValueFormat } from "@/features/valuations/model";
import { NUMERIC_VALUE_FORMAT_OPTIONS } from "@/features/valuations/services/concept-value-format";
import { useCustomUnits } from "./custom-units-context";

/** Marks the firm's own units among the options of "Formato del valor". */
const FIRM_UNIT_PREFIX = "unit:";

/** The value a firm unit takes in the list of "Formato del valor". */
export const firmUnitOptionValue = (unit: string) => `${FIRM_UNIT_PREFIX}${unit}`;

/**
 * The list of "Formato del valor": the built-in units and, under their own
 * heading, the firm's (marked "del despacho"). Shared by the ⋮ menu of a
 * concept and by "Seleccionar conceptos".
 */
export function ValueFormatSelect({
  className,
  onChoose,
  readOnly,
  selected,
}: {
  className?: string;
  /** The format chosen; a firm unit comes as "custom" with its name. */
  onChoose: (format: ConceptValueFormat, customUnit?: string) => void;
  readOnly: boolean;
  /** A ConceptValueFormat or a firm unit (`firmUnitOptionValue`). */
  selected: string;
}) {
  const { units: firmUnits } = useCustomUnits();
  return (
    <NativeSelect
      className={className ?? "w-full"}
      aria-label="Formato del valor"
      disabled={readOnly}
      size="sm"
      value={selected}
      onChange={(event) => {
        const chosen = event.target.value;
        if (chosen.startsWith(FIRM_UNIT_PREFIX)) onChoose("custom", chosen.slice(FIRM_UNIT_PREFIX.length));
        else onChoose(chosen as ConceptValueFormat);
      }}
    >
      {NUMERIC_VALUE_FORMAT_OPTIONS.map((option) => (
        <NativeSelectOption key={option.value} value={option.value}>
          {option.label}
        </NativeSelectOption>
      ))}
      {firmUnits.length ? (
        <NativeSelectOptGroup label="Unidades del despacho">
          {firmUnits.map((unit) => (
            <NativeSelectOption key={firmUnitOptionValue(unit)} value={firmUnitOptionValue(unit)}>
              {unit} · del despacho
            </NativeSelectOption>
          ))}
        </NativeSelectOptGroup>
      ) : null}
    </NativeSelect>
  );
}

