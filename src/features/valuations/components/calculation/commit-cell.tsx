"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { useFormulaEditing, useFormulaField } from "@/features/valuations/components/editor/formula-editing";
import { isFormulaText } from "@/features/valuations/services/formula-references";
import { liveFormulaText, readableFormulaText } from "@/features/valuations/services/live-formulas";
import { numericFieldProblem, percentAsNumberText } from "@/features/valuations/calculation/free-formula";
import { cn } from "@/lib/utils";
import { LIVE_WARNING_CLASS, LiveCellMark, useLiveCell } from "./live-cell";

/**
 * A cell of a capture table, as in a spreadsheet: it shows `display` (the
 * value with its decimals), and while focused the text as typed (`value`: a
 * number, a formula such as =0.9/1.05, or a text). What was typed is sent
 * once, when the cell is left or Enter is pressed; Escape gives up the edit.
 *
 * A numeric cell with a `formulaKey` writes formulas as the document's tables
 * do: typing "=" shows the formula bar with its operations and "Buscar
 * valor", and a click on a cell or a concept of the document writes its
 * reference. The references stay live, as in a field of the panels
 * (services/live-formulas.ts): the formula is sent with each reference as a
 * tag that names it and carries the number it read ("={c:…|150}*1.05"), and
 * when that datum changes the cell sends the formula with the new number. A
 * reference deleted or circular keeps the last number, marked in amber with
 * the reason in its tooltip. Plain arithmetic is sent as typed.
 */
export function CommitCell(props: {
  value: string;
  display?: string;
  onCommit: (text: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  placeholder?: string;
  /** Left out by «Copiar valor a toda la fila/columna» of the table's menu: "computed" when the system calculates it while empty; true when it is not one more value of its row or column. */
  noFill?: boolean | "computed";
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
  const warningId = useId();
  const formula = useFormulaField({
    fieldKey: props.formulaKey ?? `commit-cell:${props.ariaLabel}`,
    storedFormulaText: () => (withFormulas && isFormulaText(props.value) ? readableFormulaText(props.value.trim(), index) : null),
    onCommit: (text) => {
      setEditing(null);
      if (!isFormulaText(text)) {
        props.onCommit(props.numeric ? percentAsNumberText(text) : text);
        return;
      }
      const captured = liveFormulaText(text, index);
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
      // Applied or given up with Escape, the cell shows its value again.
      setEditing(null);
      return;
    }
    // A numeric cell writes "10%" as the 0.1 it counts as.
    const typed = editing !== null && props.numeric ? percentAsNumberText(editing) : editing;
    const untouched = !props.value && props.editText !== undefined && typed === props.editText;
    // A live formula read back as written is the one kept.
    if (!cancelled.current && typed !== null && typed !== props.value && typed !== live.readable && !untouched) props.onCommit(typed);
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

  const live = useLiveCell({
    value: props.value,
    enabled: withFormulas,
    fixed: Boolean(props.disabled),
    busy: editing !== null || formula.draftText !== null,
    onFollow: props.onCommit,
  });

  // Letters in a numeric cell: marked in red, and left out of the calculation (a warning only).
  const problem = props.numeric && editing === null && formula.draftText === null ? numericFieldProblem(props.value) : null;
  const shown = withFormulas && formula.draftText !== null ? formula.draftText : editing ?? props.display ?? props.value;
  const input = (
    <input
      ref={withFormulas ? formula.inputRef : undefined}
      aria-label={props.ariaLabel}
      aria-describedby={live.warning ? warningId : undefined}
      title={problem ? `${problem}: lo escrito no entra en los cálculos.` : live.title ? `${props.title ? `${props.title}. ` : ""}${live.title}` : props.title}
      aria-invalid={problem ? true : undefined}
      data-numeric-problem={problem ?? undefined}
      data-no-fill={props.noFill === "computed" ? "computed" : props.noFill ? "" : undefined}
      disabled={props.disabled}
      placeholder={props.placeholder}
      inputMode={props.numeric ? "decimal" : undefined}
      // The formula behind the result shown, for the table's menu ("Copiar fórmula a toda la fila").
      data-formula={live.readable ?? (isFormulaText(props.value) ? props.value.trim() : undefined)}
      data-formula-warning={live.warning ?? undefined}
      className={cn(
        "h-7 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 text-sm outline-none",
        "hover:border-input focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30 disabled:cursor-default disabled:hover:border-transparent",
        props.numeric && "text-right tabular-nums",
        props.computed && editing === null && "text-muted-foreground italic",
        problem && "border-destructive text-destructive dark:text-red-400",
        withFormulas && formula.writingFormula && "font-mono text-blue-700 ring-2 ring-blue-500 dark:text-blue-300",
        props.className,
        live.warning && cn(LIVE_WARNING_CLASS, "pl-4"),
      )}
      value={shown}
      onFocus={() => {
        if (withFormulas) formula.onFocus();
        setEditing(live.readable ?? (props.value || props.editText || ""));
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
  if (!live.warning) return input;
  // The mark shows in the cell; the reason, in its tooltip.
  return (
    <span className="relative block">
      {input}
      <LiveCellMark id={warningId} warning={live.warning} />
    </span>
  );
}
