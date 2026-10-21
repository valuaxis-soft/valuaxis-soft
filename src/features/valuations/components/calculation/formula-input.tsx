"use client";

import { useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formulaOfText } from "@/features/valuations/calculation/captured-formulas";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";

/** A formula's result as the field shows it: the number without the noise of the arithmetic. */
const resultText = (value: number) => String(Number(value.toPrecision(12)));

/**
 * A numeric field of a calculation panel, as a spreadsheet cell: it takes a
 * number or a formula (=1345*235). While it is edited it shows what was
 * typed; otherwise a formula shows its result, in blue, with the formula in
 * its tooltip. The draft keeps the text, so the formula is saved with it.
 */
export function FormulaInput({ value, className, title, onFocus, onBlur, ...props }: ComponentProps<typeof Input> & { value: string }) {
  const [editing, setEditing] = useState(false);
  const formula = editing ? null : formulaOfText(value);
  const result = formula === null ? null : parseDecimal(formula);
  return (
    <Input
      {...props}
      inputMode="decimal"
      value={result === null ? value : resultText(result)}
      title={formula ? `${title ? `${title}. ` : ""}Fórmula: ${formula}` : title}
      data-formula={formula ?? undefined}
      className={cn(className, formula && "text-blue-700 dark:text-blue-300")}
      onFocus={(event) => {
        setEditing(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setEditing(false);
        onBlur?.(event);
      }}
    />
  );
}
