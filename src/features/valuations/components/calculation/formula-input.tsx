"use client";

import { useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formulaOfText } from "@/features/valuations/calculation/captured-formulas";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";

/** A formula's result as the field shows it: the number without the noise of the arithmetic. */
const resultText = (value: number) => String(Number(value.toPrecision(12)));

const grouped = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 4 });

/** An amount or an area with its thousands separator, "1,250,000.5"; what is not a plain number stays as typed. */
export function groupedNumberText(text: string) {
  const plain = text.trim().replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(plain) ? grouped.format(Number(plain)) : text;
}

/**
 * A numeric field of a calculation panel, as a spreadsheet cell: it takes a
 * number or a formula (=1345*235). While it is edited it shows what was
 * typed; otherwise a formula shows its result, in blue, with the formula in
 * its tooltip. The draft keeps the text, so the formula is saved with it.
 * `grouping` (amounts and areas, never folios or ids) shows the thousands
 * separator while the field is not being edited.
 */
export function FormulaInput({
  value, className, title, onFocus, onBlur, grouping = false, ...props
}: ComponentProps<typeof Input> & { value: string; grouping?: boolean }) {
  const [editing, setEditing] = useState(false);
  const formula = editing ? null : formulaOfText(value);
  const result = formula === null ? null : parseDecimal(formula);
  const shown = result === null ? value : resultText(result);
  return (
    <Input
      {...props}
      inputMode="decimal"
      value={grouping && !editing ? groupedNumberText(shown) : shown}
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
