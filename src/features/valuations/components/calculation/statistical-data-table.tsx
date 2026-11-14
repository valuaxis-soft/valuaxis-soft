"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { numericFieldProblem, parseDecimal, percentAsNumberText } from "@/features/valuations/calculation/free-formula";
import type { CharacteristicField } from "@/features/valuations/calculation/market-types";
import {
  MAX_STATISTICAL_COMPARABLES,
  MAX_STATISTICAL_FIELDS,
  codedText,
  isFigureColumn,
  normalizedLevel,
  scaleValues,
  writtenValues,
  type StatisticalCalculationDto,
  type StatisticalComparableDto,
  type StatisticalVariableDto,
} from "@/features/valuations/calculation/statistical-types";
import { useFormulaEditing, useFormulaField } from "@/features/valuations/components/editor/formula-editing";
import { capturedFormulaText } from "@/features/valuations/services/formula-reference-values";
import { isFormulaText } from "@/features/valuations/services/formula-references";
import { cn } from "@/lib/utils";
import { CALC_HEAD, CALC_HEAD_CELL, CALC_ROW, CALC_TABLE, CALC_TABLE_FRAME } from "./calculation-table-style";
import { CalcTableContextMenu } from "./calc-table-context-menu";

/** A datum of the subject the appraiser may bring with "=": the market's capture of the subject. */
export type SubjectSource = { label: string; value: string };

const GRID = "statistical-grid";

/** Moves the focus to the cell `by` rows below (or above) in the same column, as Enter does in a spreadsheet. */
function focusCell(from: HTMLElement, by: number) {
  const row = Number(from.dataset.row);
  const column = from.dataset.col;
  const grid = from.closest(`[data-grid="${GRID}"]`);
  const next = grid?.querySelector<HTMLInputElement>(`input[data-row="${row + by}"][data-col="${column}"]`);
  next?.focus();
  next?.select();
}

/** A formula's result as the cell shows it: the number without the noise of the arithmetic. */
const resultText = (value: number) => Number(value.toPrecision(12)).toLocaleString("es-MX", { maximumFractionDigits: 4 });

/**
 * A cell of the grid, as Excel's: it shows the value (with its level's number,
 * "Regular (2)"), edits the text as typed, completes a level as it is typed
 * (Tab or Enter take it), Enter goes down, Escape gives up.
 *
 * It writes formulas as every other table of the valuation (`useFormulaField`):
 * "=" shows the formula bar with its operations and "Buscar valor", a click on
 * a cell or a concept writes its reference, and the formula is kept with the
 * numbers its references read. Out of the cell a formula shows its result in
 * blue; "10%" in a figure column is written 0.1 and letters there are marked
 * in red. In the subject's row "=" also lists the subject's data of the market.
 */
function GridCell(props: {
  row: number;
  column: string;
  value: string;
  display?: string;
  ariaLabel: string;
  disabled: boolean;
  numeric?: boolean;
  /** Levels or values to complete with as the appraiser types. */
  suggestions?: string[];
  /** The subject's data "=" offers. */
  sources?: SubjectSource[];
  onCommit: (text: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [picked, setPicked] = useState(0);
  const cancelled = useRef(false);
  const fieldId = useId();
  const { index } = useFormulaEditing();
  const commit = (text: string) => {
    if (text !== props.value) props.onCommit(text);
  };
  // Destructured so the compiler does not treat the field's handlers as refs.
  const { inputRef, draftText, writingFormula, change, onMouseDown, put, ...formula } = useFormulaField({
    fieldKey: `statistical-cell:${fieldId}`,
    storedFormulaText: () => (isFormulaText(props.value) ? props.value.trim() : null),
    onCommit: (text) => {
      setEditing(null);
      if (!isFormulaText(text)) {
        commit(props.numeric ? percentAsNumberText(text) : text);
        return;
      }
      const captured = capturedFormulaText(text, index);
      if (captured.ok) {
        commit(captured.text);
        return;
      }
      toast.error("La fórmula no se aplicó", { description: captured.message, duration: 12_000 });
    },
  });
  // In the subject's row, "=" followed by a name lists the subject's data that match it.
  const typedName = writingFormula && draftText !== null ? draftText.trim().slice(1) : null;
  const options = props.sources !== undefined && typedName !== null
    ? props.sources.filter((source) => normalizedLevel(source.label).includes(normalizedLevel(typedName)))
    : [];
  const choosing = props.sources !== undefined && typedName !== null && (options.length > 0 || typedName === "");

  const finish = () => {
    // A formula being written is the formula field's: it applies it, or keeps it while "Buscar valor" is open.
    if (writingFormula) {
      formula.onBlur();
      // Applied or given up, the cell shows its value again.
      setEditing(null);
      return;
    }
    const text = editing;
    setEditing(null);
    if (cancelled.current || text === null) {
      cancelled.current = false;
      return;
    }
    // A figure column writes "10%" as the 0.1 it counts as.
    commit(props.numeric ? percentAsNumberText(text) : text);
  };
  const choose = (source: SubjectSource) => put(source.value);
  /** The level the text typed so far begins, in the spelling of the scale. */
  const completion = (typed: string) => {
    if (!typed.trim() || props.numeric) return null;
    const wanted = normalizedLevel(typed);
    return props.suggestions?.find((item) => normalizedLevel(item).startsWith(wanted) && normalizedLevel(item) !== wanted) ?? null;
  };
  const onChange = (text: string, inserting: boolean) => {
    setPicked(0);
    if (change(text)) return;
    const match = inserting ? completion(text) : null;
    if (!match) {
      setEditing(text);
      return;
    }
    // Excel's AutoComplete: the rest of the level, selected, so typing on replaces it.
    const full = text + match.slice(text.length);
    setEditing(full);
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(text.length, full.length));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const target = event.currentTarget;
    if (choosing && options.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setPicked((current) => (current + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        choose(options[Math.min(picked, options.length - 1)]);
        return;
      }
    }
    if (writingFormula) {
      formula.onKeyDown(event);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      // The completion typed is taken with the rest; then down to the next row.
      focusCell(target, event.shiftKey ? -1 : 1);
      if (document.activeElement === target) target.blur();
    }
    if (event.key === "Escape") {
      cancelled.current = true;
      target.blur();
    }
  };

  const idle = editing === null && draftText === null;
  const stored = idle && isFormulaText(props.value) ? props.value.trim() : null;
  const result = stored === null ? null : parseDecimal(stored);
  // Letters in a figure column: marked in red, and left out of the calculation (a warning only).
  const problem = idle && props.numeric ? numericFieldProblem(props.value) : null;
  const shown = draftText ?? editing ?? (result !== null ? resultText(result) : props.display ?? props.value);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        data-row={props.row}
        data-col={props.column}
        aria-label={props.ariaLabel}
        disabled={props.disabled}
        inputMode={props.numeric ? "decimal" : undefined}
        autoComplete="off"
        title={problem ? `${problem}: lo escrito no entra en los cálculos.` : stored ? `Fórmula: ${stored}` : undefined}
        aria-invalid={problem ? true : undefined}
        data-formula={stored ?? undefined}
        data-numeric-problem={problem ?? undefined}
        className={cn(
          "h-7 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 text-left text-xs outline-none",
          "hover:border-input focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30 disabled:cursor-default disabled:hover:border-transparent",
          props.numeric && "tabular-nums",
          stored && "text-blue-700 dark:text-blue-300",
          problem && "border-destructive text-destructive dark:text-red-400",
          writingFormula && "font-mono text-blue-700 ring-2 ring-blue-500 dark:text-blue-300",
        )}
        value={shown}
        onFocus={(event) => {
          formula.onFocus(event);
          setEditing(props.value);
        }}
        onChange={(event) => onChange(event.target.value, (event.nativeEvent as InputEvent).inputType === "insertText")}
        onMouseDown={onMouseDown}
        onBlur={finish}
        onKeyDown={onKeyDown}
      />
      {choosing ? (
        <ul
          role="listbox"
          aria-label="Datos del sujeto"
          className="absolute top-full left-0 z-20 mt-0.5 max-h-56 w-64 overflow-auto rounded-md border bg-popover p-1 text-xs shadow-md"
        >
          {options.length ? options.map((source, at) => (
            <li key={source.label} role="option" aria-selected={at === picked}>
              <button
                type="button"
                className={cn("flex w-full justify-between gap-2 rounded px-2 py-1 text-left", at === picked ? "bg-accent" : "hover:bg-accent")}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(source);
                }}
              >
                <span>{source.label}</span>
                <span className="text-muted-foreground tabular-nums">{source.value}</span>
              </button>
            </li>
          )) : <li className="px-2 py-1 text-muted-foreground">Sin datos del sujeto capturados en el enfoque de mercado.</li>}
        </ul>
      ) : null}
    </div>
  );
}

/** A key for a field the appraiser adds: short, and unlike any other in the list. */
const newFieldKey = () => `custom:${Date.now().toString(36)}`;

/**
 * The comparables of the apartado as a spreadsheet: a row per comparable
 * (numbered 1, 2, 3… as they are added with "+") and a column per
 * characteristic, the subject's row on top. They are this apartado's own.
 */
export function StatisticalDataTable(props: {
  calculation: Pick<StatisticalCalculationDto, "settings" | "comparables">;
  readOnly: boolean;
  priceLabel: string;
  subjectSources: SubjectSource[];
  onFields: (fields: CharacteristicField[]) => void;
  onSubject: (key: string, text: string) => void;
  onComparable: (id: string, change: (current: StatisticalComparableDto) => StatisticalComparableDto) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const { calculation, readOnly } = props;
  const { settings, comparables } = calculation;
  const variables = new Map(settings.variables.map((variable) => [variable.key, variable]));
  const suggestionsOf = (key: string) => {
    const variable: StatisticalVariableDto | undefined = variables.get(key);
    const levels = variable?.coding === "SCALE" ? scaleValues(variable).map((level) => level.label) : [];
    const seen = new Set(levels.map(normalizedLevel));
    return [...levels, ...writtenValues(calculation, key).filter((value) => !seen.has(normalizedLevel(value)))];
  };
  const numeric = (key: string) => isFigureColumn(calculation, key, variables.get(key)?.coding);
  const rename = (index: number) => (label: string) => {
    const trimmed = label.trim();
    if (trimmed) props.onFields(settings.fields.map((field, at) => (at === index ? { ...field, label: trimmed } : field)));
  };
  // The header as the other calculation tables (homologation, costs): centered, in the band's navy bold.
  const head = CALC_HEAD_CELL;

  return (
    <div className="grid gap-1.5">
      <CalcTableContextMenu className={CALC_TABLE_FRAME} readOnly={readOnly} rows={{ count: comparables.length + 1, delete: (rowIndex) => { const comparable = comparables[rowIndex - 1]; if (comparable) props.onRemove(comparable.id); } }}>
        <table className={cn(CALC_TABLE, "w-full min-w-160")} aria-label="Comparables de los métodos alternativos" data-grid={GRID}>
          <thead className={CALC_HEAD}>
            <tr>
              <th className={cn(head, "w-10")}>Entra</th>
              <th className={cn(head, "w-10")}>Ref.</th>
              <th className={cn(head, "min-w-28")}>{props.priceLabel}</th>
              {settings.fields.map((field, index) => (
                <th key={field.key} className={cn(head, "min-w-28")}>
                  <div className="flex items-center gap-0.5">
                    <input
                      aria-label={`Nombre de la característica ${field.label}`}
                      disabled={readOnly}
                      defaultValue={field.label}
                      key={field.label}
                      className="h-6 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1 text-center text-xs font-bold text-inherit outline-none hover:border-input focus:border-ring focus:bg-background focus:text-foreground"
                      onBlur={(event) => { if (event.target.value.trim() !== field.label) rename(index)(event.target.value); }}
                      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                    />
                    {!readOnly && field.key !== "area" ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="size-5"
                        aria-label={`Quitar ${field.label}`}
                        onClick={() => props.onFields(settings.fields.filter((item) => item.key !== field.key))}
                      >
                        <X />
                      </Button>
                    ) : null}
                  </div>
                </th>
              ))}
              <th className={cn(head, "w-8")}>
                {!readOnly && settings.fields.length < MAX_STATISTICAL_FIELDS ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Agregar característica"
                    title="Agregar característica"
                    onClick={() => props.onFields([...settings.fields, { key: newFieldKey(), label: "NUEVA" }])}
                  >
                    <Plus />
                  </Button>
                ) : null}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className={cn(CALC_ROW, "bg-primary/5 dark:bg-primary/10")}>
              <td className="px-1.5 py-1 font-bold" colSpan={2}>Sujeto</td>
              <td className="px-1.5 py-1 text-muted-foreground">—</td>
              {settings.fields.map((field) => (
                <td key={field.key} className="px-0.5 py-0.5">
                  <GridCell
                    row={0}
                    column={field.key}
                    ariaLabel={`${field.label} del sujeto`}
                    disabled={readOnly}
                    numeric={numeric(field.key)}
                    value={settings.subject[field.key] ?? ""}
                    display={codedText(variables.get(field.key), settings.subject[field.key] ?? "")}
                    suggestions={suggestionsOf(field.key)}
                    sources={props.subjectSources}
                    onCommit={(text) => props.onSubject(field.key, text)}
                  />
                </td>
              ))}
              <td />
            </tr>
            {comparables.map((comparable, index) => (
              <tr key={comparable.id} className={cn(CALC_ROW, comparable.excluded && "text-muted-foreground line-through")}>
                <td className="px-1.5 py-1">
                  <Checkbox
                    aria-label={`Comparable ${comparable.reference} en los métodos alternativos`}
                    checked={!comparable.excluded}
                    disabled={readOnly}
                    onCheckedChange={(checked) => props.onComparable(comparable.id, (current) => ({ ...current, excluded: checked !== true }))}
                  />
                </td>
                <td className="px-1.5 py-1 tabular-nums">{comparable.reference}</td>
                <td className="px-0.5 py-0.5">
                  <GridCell
                    row={index + 1}
                    column="price"
                    ariaLabel={`${props.priceLabel}, comparable ${comparable.reference}`}
                    disabled={readOnly}
                    numeric
                    value={comparable.price === null ? "" : String(comparable.price)}
                    display={comparable.price === null ? "" : comparable.price.toLocaleString("es-MX", { maximumFractionDigits: 2 })}
                    onCommit={(text) => {
                      const price = parseDecimal(text);
                      props.onComparable(comparable.id, (current) => ({ ...current, price: price !== null && price > 0 ? price : null }));
                    }}
                  />
                </td>
                {settings.fields.map((field) => (
                  <td key={field.key} className="px-0.5 py-0.5">
                    <GridCell
                      row={index + 1}
                      column={field.key}
                      ariaLabel={`${field.label}, comparable ${comparable.reference}`}
                      disabled={readOnly}
                      numeric={numeric(field.key)}
                      value={comparable.values[field.key] ?? ""}
                      display={codedText(variables.get(field.key), comparable.values[field.key] ?? "")}
                      suggestions={suggestionsOf(field.key)}
                      onCommit={(text) => props.onComparable(comparable.id, (current) => {
                        const { [field.key]: _previous, ...rest } = current.values;
                        return { ...current, values: text.trim() ? { ...rest, [field.key]: text.trim() } : rest };
                      })}
                    />
                  </td>
                ))}
                <td className="px-0.5 py-0.5">
                  {!readOnly ? (
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar comparable ${comparable.reference}`} onClick={() => props.onRemove(comparable.id)}>
                      <Trash2 />
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CalcTableContextMenu>
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly ? (
          <Button type="button" size="sm" variant="outline" disabled={comparables.length >= MAX_STATISTICAL_COMPARABLES} onClick={props.onAdd}>
            <Plus data-icon="inline-start" /> Comparable
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground">
          Los comparables que añadas aquí no se mostrarán en el enfoque de mercado; se usan solo para este análisis. Enter baja de renglón; Tab o
          Enter aceptan el nivel que se completa; «=» escribe una fórmula, con «Buscar valor», y en el sujeto también trae un dato del sujeto.
        </span>
      </div>
    </div>
  );
}
