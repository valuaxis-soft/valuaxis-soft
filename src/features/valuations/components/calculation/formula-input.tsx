"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formulaOfText } from "@/features/valuations/calculation/captured-formulas";
import { numericFieldProblem, parseDecimal, percentAsNumberText } from "@/features/valuations/calculation/free-formula";
import { useFormulaEditing, useFormulaField } from "@/features/valuations/components/editor/formula-editing";
import { isFormulaText } from "@/features/valuations/services/formula-references";
import {
  formulaWithLastValues,
  hasLiveReferences,
  liveFormulaText,
  liveFormulaWarning,
  readableFormulaText,
  resolveLiveFormula,
  type LiveFormulaOwners,
} from "@/features/valuations/services/live-formulas";

/** A formula's result as the field shows it: the number without the noise of the arithmetic. */
const resultText = (value: number) => String(Number(value.toPrecision(12)));

const grouped = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 4 });

/** An amount or an area with its thousands separator, "1,250,000.5"; what is not a plain number stays as typed. */
export function groupedNumberText(text: string) {
  const plain = text.trim().replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(plain) ? grouped.format(Number(plain)) : text;
}

/**
 * The calculation the fields below belong to (the cost approach, a market…):
 * a field that reads a figure its own calculation produces is circular.
 */
const LiveFormulaOwnerContext = createContext<LiveFormulaOwners>(null);

export function LiveFormulaOwnerProvider({ owner, children }: { owner: LiveFormulaOwners; children: ReactNode }) {
  return <LiveFormulaOwnerContext value={owner}>{children}</LiveFormulaOwnerContext>;
}

/** The calculation the field being rendered belongs to (a cell of a capture table takes it as the panel's fields do). */
export const useLiveFormulaOwner = () => useContext(LiveFormulaOwnerContext);

/** Why a formula left in a field does not compute. */
const UNREAD_FORMULA_MESSAGE = "Esta fórmula no se pudo calcular: corrígela o bórrala";

/**
 * A numeric field of a calculation panel, as a cell of the document's
 * tables: it takes a number or a formula. Typing "=" shows the formula bar
 * of the whole valuation (operations, "Buscar valor", a click on a cell or a
 * concept writes its reference), exactly as in the editor's tables and in
 * the homologation. The references stay live (services/live-formulas.ts):
 * the field keeps them with the number each one read, so the server computes
 * it as before, and when the data they read changes the field takes the new
 * value, as a cell of the document's tables does. A reference deleted, or one
 * that reads what this field's own calculation produces, keeps its last
 * value and is marked in amber with the reason.
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
  const owner = useContext(LiveFormulaOwnerContext);
  const fieldId = useId();
  /**
   * A formula applied (Enter or leaving the field) reaches the panel after the
   * blur it saves on, which still had the value of before: once the panel holds
   * it, the field blurs again so the panel saves what was applied.
   */
  const appliedRef = useRef<string | null>(null);
  const send = (text: string) => {
    if (text === value) return;
    const target = { value: text } as HTMLInputElement;
    onChange?.({ target, currentTarget: target } as ChangeEvent<HTMLInputElement>);
  };
  // Destructured so the compiler does not treat the field's handlers as refs.
  const { inputRef, draftText, writingFormula, change, onMouseDown, ...field } = useFormulaField({
    fieldKey: `formula-input:${fieldId}`,
    storedFormulaText: () => (isFormulaText(value) ? readableFormulaText(value.trim(), index) : null),
    onCommit: (text) => {
      if (!isFormulaText(text)) {
        send(percentAsNumberText(text));
        return;
      }
      const captured = liveFormulaText(text, index);
      if (captured.ok) {
        appliedRef.current = captured.text;
        send(captured.text);
        return;
      }
      // The appraiser's text stays, marked; the reason is told.
      toast.error("La fórmula no se aplicó", { description: captured.message, duration: 12_000 });
      send(text);
    },
  });

  const writing = draftText !== null;
  // The references read again against the document as it is now.
  const live = useMemo(() => (hasLiveReferences(value) ? resolveLiveFormula(value.trim(), index, owner) : null), [value, index, owner]);
  const followed = live?.changed ? live.text : value;
  const fixed = Boolean(props.disabled || props.readOnly);
  useEffect(() => {
    if (appliedRef.current === null || appliedRef.current !== value) return;
    appliedRef.current = null;
    const input = inputRef.current;
    if (input && document.activeElement !== input) input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  useEffect(() => {
    // The data read changed: the field takes the new value, as a cell does; the panel saves it with the rest.
    if (live?.changed && !fixed && !writing && !editing) send(live.text);
  });
  const warning = live && !writing && !editing ? liveFormulaWarning(live.problems) : null;
  const stored = writing || editing ? null : formulaOfText(followed);
  const result = stored === null ? null : parseDecimal(stored);
  const shown = draftText ?? (result === null ? followed : resultText(result));
  const problem = writing || editing ? null : isFormulaText(followed) && stored === null ? UNREAD_FORMULA_MESSAGE : numericFieldProblem(followed);
  const readable = stored && hasLiveReferences(stored) ? readableFormulaText(stored, index) : stored;
  const formulaText = readable !== stored ? `${readable} (con los valores ${formulaWithLastValues(stored ?? "")})` : stored;
  const tooltip = problem
    ? `${problem}: lo escrito no entra en los cálculos.`
    : stored ? `${title ? `${title}. ` : ""}Fórmula: ${formulaText}${warning ? `. ${warning}` : ""}` : title;

  const warningId = `${fieldId}-aviso`;
  const input = (
    <Input
      {...props}
      ref={inputRef}
      aria-describedby={warning ? warningId : props["aria-describedby"]}
      inputMode="decimal"
      value={grouping && !editing && !writing ? groupedNumberText(shown) : shown}
      title={tooltip}
      aria-invalid={problem ? true : props["aria-invalid"]}
      data-formula={readable ?? undefined}
      data-numeric-problem={problem ?? undefined}
      data-formula-warning={warning ?? undefined}
      className={cn(
        className,
        stored && "text-blue-700 dark:text-blue-300",
        warning && "bg-amber-50 text-amber-800 ring-1 ring-amber-400 dark:bg-amber-950/40 dark:text-amber-300",
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
  if (!warning) return input;
  // The reason is read under the field, without hovering it.
  return (
    <>
      {input}
      <p id={warningId} data-formula-warning-text className="mt-1 text-[11px] leading-snug text-amber-800 dark:text-amber-300">
        {warning}
      </p>
    </>
  );
}
