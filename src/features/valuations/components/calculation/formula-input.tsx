"use client";

import { useId, useState, type ChangeEvent, type ComponentProps } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formulaOfText } from "@/features/valuations/calculation/captured-formulas";
import { numericFieldProblem, parseDecimal, percentAsNumberText } from "@/features/valuations/calculation/free-formula";
import { useFormulaEditing, useFormulaField } from "@/features/valuations/components/editor/formula-editing";
import { capturedFormulaText } from "@/features/valuations/services/formula-reference-values";
import { isFormulaText } from "@/features/valuations/services/formula-references";

/** A formula's result as the field shows it: the number without the noise of the arithmetic. */
const resultText = (value: number) => String(Number(value.toPrecision(12)));

const grouped = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 4 });

/** An amount or an area with its thousands separator, "1,250,000.5"; what is not a plain number stays as typed. */
export function groupedNumberText(text: string) {
  const plain = text.trim().replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(plain) ? grouped.format(Number(plain)) : text;
}

/** Why a formula left in a field does not compute. */
const UNREAD_FORMULA_MESSAGE = "Esta fórmula no se pudo calcular: corrígela o bórrala";

/**
 * A numeric field of a calculation panel, as a cell of the document's
 * tables: it takes a number or a formula. Typing "=" shows the formula bar
 * of the whole valuation (operations, "Buscar valor", a click on a cell or a
 * concept writes its reference), exactly as in the editor's tables and in
 * the homologation. The capture keeps no references: the formula is saved
 * with the numbers they read ("=[Superficie total de terreno]*2" as
 * "=1250*2"), so the server computes it as before.
 *
 * Out of the field a formula shows its result, in blue, with the formula in
 * its tooltip; "10%" is written as the 0.1 it counts as, and letters that do
 * not read as a number are marked in red (a warning: nothing is refused).
 * `grouping` (amounts and areas, never folios or ids) shows the thousands
 * separator while the field is not being edited. The panel's `onChange`
 * receives what the field keeps, as from a typed change.
 */
export function FormulaInput({
  value, className, title, onFocus, onBlur, onChange, onKeyDown, grouping = false, ...props
}: ComponentProps<typeof Input> & { value: string; grouping?: boolean }) {
  const [editing, setEditing] = useState(false);
  const { index } = useFormulaEditing();
  const fieldId = useId();
  const send = (text: string) => {
    if (text === value) return;
    const target = { value: text } as HTMLInputElement;
    onChange?.({ target, currentTarget: target } as ChangeEvent<HTMLInputElement>);
  };
  // Destructured so the compiler does not treat the field's handlers as refs.
  const { inputRef, draftText, writingFormula, change, onMouseDown, ...field } = useFormulaField({
    fieldKey: `formula-input:${fieldId}`,
    storedFormulaText: () => (isFormulaText(value) ? value.trim() : null),
    onCommit: (text) => {
      if (!isFormulaText(text)) {
        send(percentAsNumberText(text));
        return;
      }
      const captured = capturedFormulaText(text, index);
      if (captured.ok) {
        send(captured.text);
        return;
      }
      // The appraiser's text stays, marked; the reason is told.
      toast.error("La fórmula no se aplicó", { description: captured.message, duration: 12_000 });
      send(text);
    },
  });

  const writing = draftText !== null;
  const stored = writing || editing ? null : formulaOfText(value);
  const result = stored === null ? null : parseDecimal(stored);
  const shown = draftText ?? (result === null ? value : resultText(result));
  const problem = writing || editing ? null : isFormulaText(value) && stored === null ? UNREAD_FORMULA_MESSAGE : numericFieldProblem(value);
  const tooltip = problem ? `${problem}: lo escrito no entra en los cálculos.` : stored ? `${title ? `${title}. ` : ""}Fórmula: ${stored}` : title;

  return (
    <Input
      {...props}
      ref={inputRef}
      inputMode="decimal"
      value={grouping && !editing && !writing ? groupedNumberText(shown) : shown}
      title={tooltip}
      aria-invalid={problem ? true : props["aria-invalid"]}
      data-formula={stored ?? undefined}
      data-numeric-problem={problem ?? undefined}
      className={cn(
        className,
        stored && "text-blue-700 dark:text-blue-300",
        problem && "text-destructive dark:text-red-400",
        writingFormula && "font-mono text-blue-700 ring-2 ring-blue-500 dark:text-blue-300",
      )}
      onFocus={(event) => {
        field.onFocus(event);
        setEditing(true);
        onFocus?.(event);
      }}
      onChange={(event) => {
        if (change(event.target.value)) return;
        onChange?.(event);
      }}
      onMouseDown={onMouseDown}
      onKeyDown={(event) => {
        if (writing) {
          field.onKeyDown(event);
          return;
        }
        onKeyDown?.(event);
      }}
      onBlur={(event) => {
        if (writing) field.onBlur(event);
        else if (value.trim().endsWith("%")) send(percentAsNumberText(value));
        setEditing(false);
        onBlur?.(event);
      }}
    />
  );
}
