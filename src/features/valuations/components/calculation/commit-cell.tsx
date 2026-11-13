"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { useFormulaEditing, useFormulaField } from "@/features/valuations/components/editor/formula-editing";
import { isFormulaText } from "@/features/valuations/services/formula-references";
import { capturedFormulaText } from "@/features/valuations/services/formula-reference-values";
import { numericFieldProblem, percentAsNumberText } from "@/features/valuations/calculation/free-formula";
import { cn } from "@/lib/utils";

/**
 * A cell of a capture table, as in a spreadsheet: it shows `display` (the
 * value with its decimals), and while focused the text as typed (`value`: a
 * number, a formula such as =0.9/1.05, or a text). What was typed is sent
 * once, when the cell is left or Enter is pressed; Escape gives up the edit.
 *
 * A numeric cell with a `formulaKey` writes formulas as the document's tables
 * do: typing "=" shows the formula bar with its operations and "Buscar
 * valor", and a click on a cell or a concept of the document writes its
 * reference. The capture keeps no references: the formula is sent with the
 * numbers those references read ("=150*1.05"), and the number it gives.
 */
export function CommitCell(props: {
  value: string;
  display?: string;
  onCommit: (text: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Figures align right and keep their width. */
  numeric?: boolean;
  /** The display is the formula's result, not something typed: shown muted. */
  computed?: boolean;
  title?: string;
  /** Unique key of the cell among the fields of the document; set, the cell takes formulas with the formula bar. */
  formulaKey?: string;
  /**
   * What the cell shows to edit while it holds nothing typed: the formula the
   * calculation uses for it ("=(408/360)^(1/3)"). Left as it was, nothing is
   * sent, so the calculation keeps computing it.
   */
  editText?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  // Escape leaves the cell without sending: the blur that follows must know.
  const cancelled = useRef(false);
  const { index } = useFormulaEditing();
  const withFormulas = Boolean(props.formulaKey);
  const formula = useFormulaField({
    fieldKey: props.formulaKey ?? `commit-cell:${props.ariaLabel}`,
    storedFormulaText: () => (withFormulas && isFormulaText(props.value) ? props.value : null),
    onCommit: (text) => {
      setEditing(null);
      if (!isFormulaText(text)) {
        props.onCommit(props.numeric ? percentAsNumberText(text) : text);
        return;
      }
      const captured = capturedFormulaText(text, index);
      if (captured.ok) {
        props.onCommit(captured.text);
        return;
      }
      toast.error("La fórmula no se aplicó", { description: captured.message, duration: 12_000 });
    },
  });

  const finish = () => {
    // A formula being written is the formula field's: it sends it, or keeps it while the value picker is open.
    if (withFormulas && formula.writingFormula) {
      formula.onBlur();
      return;
    }
    // A numeric cell writes "10%" as the 0.1 it counts as.
    const typed = editing !== null && props.numeric ? percentAsNumberText(editing) : editing;
    const untouched = !props.value && props.editText !== undefined && typed === props.editText;
    if (!cancelled.current && typed !== null && typed !== props.value && !untouched) props.onCommit(typed);
    cancelled.current = false;
    setEditing(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (withFormulas && formula.writingFormula) {
      formula.onKeyDown(event);
      return;
    }
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      cancelled.current = true;
      event.currentTarget.blur();
    }
  };

  // Letters in a numeric cell: marked in red, and left out of the calculation (a warning only).
  const problem = props.numeric && editing === null && formula.draftText === null ? numericFieldProblem(props.value) : null;
  const shown = withFormulas && formula.draftText !== null ? formula.draftText : editing ?? props.display ?? props.value;
  return (
    <input
      ref={withFormulas ? formula.inputRef : undefined}
      aria-label={props.ariaLabel}
      title={problem ? `${problem}: lo escrito no entra en los cálculos.` : props.title}
      aria-invalid={problem ? true : undefined}
      data-numeric-problem={problem ?? undefined}
      disabled={props.disabled}
      placeholder={props.placeholder}
      inputMode={props.numeric ? "decimal" : undefined}
      // The formula behind the result shown, for the table's menu ("Copiar fórmula a toda la fila").
      data-formula={isFormulaText(props.value) ? props.value.trim() : undefined}
      className={cn(
        "h-7 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 text-sm outline-none",
        "hover:border-input focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30 disabled:cursor-default disabled:hover:border-transparent",
        props.numeric && "text-right tabular-nums",
        props.computed && editing === null && "text-muted-foreground italic",
        problem && "border-destructive text-destructive dark:text-red-400",
        withFormulas && formula.writingFormula && "font-mono text-blue-700 ring-2 ring-blue-500 dark:text-blue-300",
        props.className,
      )}
      value={shown}
      onFocus={() => {
        if (withFormulas) formula.onFocus();
        setEditing(props.value || props.editText || "");
      }}
      onChange={(event) => {
        const text = event.target.value;
        if (withFormulas && formula.change(text)) return;
        setEditing(text);
      }}
      onMouseDown={withFormulas ? formula.onMouseDown : undefined}
      onBlur={finish}
      onKeyDown={onKeyDown}
    />
  );
}
