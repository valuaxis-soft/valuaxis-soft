"use client";

import { Fragment, useCallback, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { TableContent } from "@/features/valuations/model";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import {
  ensureTableV2,
  type TableV2,
  type TableCellV2,
  type TableColumn,
  type FormulaResult,
  type FormulaSelectionOperation,
  type ColumnCapability,
  type TableCellFormat,
  moveTableColumnBy,
  moveTableColumnTo,
  canMoveTableColumn,
  canRemoveTableColumn,
  canInsertBesideColumn,
  columnHasData,
  columnValueSuggestions,
  estimateColumnChars,
  moveTableRow,
  insertTableColumnBeside,
  isHomologationFactorColumn,
  removeTableColumn,
  renameTableColumn,
  insertTableRow,
  removeTableRow,
  clearTableRow,
  clearTableColumn,
  duplicateTableRow,
  setCellFormula,
  setCellResultFormat,
  fillColumnWithFormula,
  buildFormulaFromSelection,
  resolveColumnCapability,
  getTableHeaderLayout,
  getDisplayColumns,
  updateHeaderGroupTitle,
} from "../../services/table";
import {
  evaluateTableFormulas,
  formulaCellKey,
  formulaErrorMessage,
  getCellDisplayValue,
} from "../../services/table-formula-engine";
import {
  cellReferenceText,
  columnLetter,
  compileFormula,
  formulaToText,
  isFormulaText,
} from "../../services/formula-references";
import {
  FormulaReferenceText,
  formulaReferenceCellStyle,
  useFormulaEditing,
  useFormulaField,
  useFormulaReferenceTarget,
} from "./formula-editing";
import { useNumberPresentation } from "../number-presentation-context";
import { TableFormatControl } from "./table-format-control";

import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { editorCanScroll } from "./editor-dnd-autoscroll";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  Calculator,
  ChevronDown,
  Columns3,
  GripVertical,
  Rows3,
  Trash2,
  X,
  Check,
  FunctionSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ================================================================== */
/*  V2 updater wrapper                                                 */
/* ================================================================== */

function v2Updater(fn: (table: TableV2) => TableV2): (current: TableContent) => TableContent {
  return (current) => {
    const v2 = ensureTableV2(current);
    const result = fn(v2);
    return { ...result, version: 2 } as unknown as TableContent;
  };
}

/* ================================================================== */
/*  Formula selection mode types                                        */
/* ================================================================== */

type FormulaSelectionState = {
  targetRowId: string;
  targetColumnId: string;
  operation: FormulaSelectionOperation;
  sources: Array<{ rowId: string; columnId: string }>;
  /** Exponent of a power or index of a root, as typed, when it is not taken from a cell. */
  parameter: string;
};

/** The operations of "Resultado / Fórmula", in the order the menu offers them. */
const SELECTION_OPERATIONS: Array<{ operation: FormulaSelectionOperation; label: string; hint: string }> = [
  { operation: "ADD", label: "Sumar", hint: "Selecciona las celdas que se suman." },
  { operation: "SUBTRACT", label: "Restar", hint: "Selecciona la celda de la que se resta y luego las que se restan." },
  { operation: "MULTIPLY", label: "Multiplicar", hint: "Selecciona todas las celdas que se multiplican entre sí." },
  { operation: "DIVIDE", label: "Dividir", hint: "Selecciona la celda que se divide y luego entre cuál." },
  { operation: "AVERAGE", label: "Promedio", hint: "Selecciona las celdas que se promedian." },
  { operation: "POWER", label: "Potencia", hint: "Selecciona la celda base. El exponente se escribe aquí o se toma de una segunda celda." },
  { operation: "ROOT", label: "Raíz", hint: "Selecciona la celda. Sin índice es la raíz cuadrada; el índice se escribe aquí o se toma de una segunda celda." },
];
const SELECTION_LABELS: Record<FormulaSelectionOperation, string> = {
  SUM: "Sumar",
  ...Object.fromEntries(SELECTION_OPERATIONS.map((item) => [item.operation, item.label])),
} as Record<FormulaSelectionOperation, string>;
/** A power and a root read one cell, and a second one for the exponent or the index. */
const takesParameter = (operation: FormulaSelectionOperation) => operation === "POWER" || operation === "ROOT";

/** How the result of a formula cell can be written. */
const RESULT_FORMATS: Array<{ label: string; format: TableCellFormat | null }> = [
  { label: "Automático", format: null },
  { label: "Número (2 decimales)", format: { type: "number", precision: 2 } },
  { label: "Número (4 decimales)", format: { type: "number", precision: 4 } },
  { label: "Moneda ($)", format: { type: "currency", precision: 2 } },
  { label: "Porcentaje (%)", format: { type: "percent", precision: 2 } },
];

const NO_SUGGESTIONS: string[] = [];
/** Narrowest a column gets in the editor, in characters, before the table scrolls sideways. */
const EDITOR_MIN_COLUMN_CHARS = 6;
/** About what a character of the editor's cells takes, and what a header's handle, letter and menu take. */
const EDITOR_CHAR_PX = 7.5;
const EDITOR_HEADER_CHROME_PX = 68;
/** The row number at the left and the row handle at the right. */
const EDITOR_ROW_CHROME_PX = 56;

/** Enters the cell at a row and column of a table as shown, when there is one: Enter goes down, Shift+Enter up. */
function focusTableCell(tableId: string, rowIndex: number, columnIndex: number) {
  if (rowIndex < 0) return;
  const target = document.querySelector<HTMLInputElement>(`input[data-table-cell="${window.CSS.escape(tableId)}"][data-row="${rowIndex}"][data-col="${columnIndex}"]`);
  if (!target) return;
  target.focus();
  target.select();
}

/* ================================================================== */
/*  Sortable column header                                             */
/* ================================================================== */

function SortableColumnHeader({
  column,
  letter,
  tableV2,
  tableId,
  readOnly,
  formulaMode,
  capability,
  isOver,
  isDragging,
  rowSpan,
  colSpan,
  cellStyle,
  onUpdate,
  onContextMenuRename,
  onContextMenuInsertLeft,
  onContextMenuInsertRight,
  onContextMenuMove,
  onContextMenuClear,
  onContextMenuDelete,
}: {
  column: TableColumn;
  /** The column's letter in formulas (A, B, C…). */
  letter: string;
  tableV2: TableV2;
  tableId: string;
  readOnly: boolean;
  formulaMode: FormulaSelectionState | null;
  capability: ColumnCapability;
  isOver: boolean;
  isDragging: boolean;
  rowSpan?: number;
  colSpan?: number;
  cellStyle?: CSSProperties;
  onUpdate: (id: string, updater: (table: TableContent) => TableContent) => void;
  onContextMenuRename: (columnId: string, currentName: string) => void;
  onContextMenuInsertLeft: (columnId: string) => void;
  onContextMenuInsertRight: (columnId: string) => void;
  onContextMenuMove: (columnId: string, direction: -1 | 1) => void;
  onContextMenuClear: (columnId: string) => void;
  onContextMenuDelete: (columnId: string) => void;
}) {
  const isMovable = capability.movable !== false;
  const canMoveLeft = canMoveTableColumn(tableV2, column.id, -1);
  const canMoveRight = canMoveTableColumn(tableV2, column.id, 1);
  const canDelete = canRemoveTableColumn(tableV2, column.id);
  const columnName = column.name.trim() || `columna ${letter}`;

  // Local draft state — typing is free, normalization happens only on commit
  const [draftName, setDraftName] = useState(column.name);
  const [draftColumnId, setDraftColumnId] = useState(column.id);
  if (draftColumnId !== column.id) {
    setDraftColumnId(column.id);
    setDraftName(column.name);
  }

  const commitDraft = useCallback(() => {
    const trimmed = draftName.trim();
    if (trimmed !== column.name) {
      onUpdate(tableId, v2Updater((v2) => renameTableColumn(v2, column.id, draftName)));
    }
  }, [draftName, column.id, column.name, tableId, onUpdate]);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: column.id, disabled: readOnly || !!formulaMode || !isMovable });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  };

  // The actions of the right click and of the header's menu, in groups.
  const groups: ColumnAction[][] = [
    canInsertBesideColumn(tableV2, column.id) ? [
      { key: "insert-left", label: "Insertar columna a la izquierda", onSelect: () => onContextMenuInsertLeft(column.id) },
      { key: "insert-right", label: "Insertar columna a la derecha", onSelect: () => onContextMenuInsertRight(column.id) },
    ] : [],
    isMovable ? [
      { key: "move-left", label: "Mover a la izquierda", disabled: !canMoveLeft, onSelect: () => onContextMenuMove(column.id, -1) },
      { key: "move-right", label: "Mover a la derecha", disabled: !canMoveRight, onSelect: () => onContextMenuMove(column.id, 1) },
    ] : [],
    [
      ...(capability.headerEditable !== false ? [{ key: "rename", label: "Renombrar", onSelect: () => onContextMenuRename(column.id, column.name) }] : []),
      ...(capability.clearable !== false ? [{ key: "clear", label: "Limpiar columna", onSelect: () => onContextMenuClear(column.id) }] : []),
    ],
    capability.removable !== false ? [
      { key: "delete", label: "Eliminar columna", destructive: true, disabled: !canDelete, onSelect: () => onContextMenuDelete(column.id) },
    ] : [],
  ].filter((group) => group.length > 0);

  return (
    <TableHead ref={setNodeRef} style={{ ...style, ...cellStyle }} className="h-auto p-0 align-top" rowSpan={rowSpan} colSpan={colSpan}>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={cn(
              "flex min-w-0 items-start gap-1 rounded-sm border border-border bg-muted/50 px-1.5 py-1 transition-colors",
              isOver && !isDragging && "border-blue-400 bg-blue-50 dark:bg-blue-500/15",
              formulaMode && "opacity-60",
            )}
          >
            {!readOnly && isMovable && (
              <div
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                className="mt-1 shrink-0 cursor-grab touch-none"
                data-column-grip=""
                aria-label={`Arrastrar la columna ${columnName}`}
                title="Arrastra para mover la columna"
              >
                <GripVertical className="h-3 w-3 text-muted-foreground/70" />
              </div>
            )}
            <span className="mt-1 shrink-0 select-none font-mono text-[10px] text-muted-foreground/70" title={`Columna ${letter} en las fórmulas`}>{letter}</span>
            {/* A long header takes a second line instead of widening the column; Alt+Enter breaks it where wanted. */}
            <textarea
              aria-label={`Encabezado de la columna ${columnName}`}
              className="field-sizing-content min-h-6 min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent px-0.5 py-0.5 text-xs leading-tight font-semibold wrap-break-word outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed"
              rows={1}
              disabled={readOnly || capability.headerEditable === false}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (event.altKey || event.shiftKey) {
                  const { selectionStart, selectionEnd, value } = event.currentTarget;
                  setDraftName(`${value.slice(0, selectionStart)}\n${value.slice(selectionEnd)}`);
                  return;
                }
                commitDraft();
                event.currentTarget.blur();
              }}
            />
            {/* The same actions as the right click, in view: inserting beside, moving and deleting the column. */}
            {!readOnly && !formulaMode && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="h-5 w-5 shrink-0 text-muted-foreground"
                      aria-label={`Opciones de la columna ${columnName}`}
                      title="Opciones de la columna"
                    />
                  }
                >
                  <ChevronDown className="h-3 w-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {groups.map((group, index) => (
                    <Fragment key={group[0].key}>
                      {index > 0 ? <DropdownMenuSeparator /> : null}
                      {group.map((action) => (
                        <DropdownMenuItem key={action.key} variant={action.destructive ? "destructive" : undefined} disabled={action.disabled} onClick={action.onSelect}>
                          {action.label}
                        </DropdownMenuItem>
                      ))}
                    </Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {groups.map((group, index) => (
            <Fragment key={group[0].key}>
              {index > 0 ? <ContextMenuSeparator /> : null}
              {group.map((action) => (
                <ContextMenuItem key={action.key} variant={action.destructive ? "destructive" : undefined} disabled={action.disabled} onClick={action.onSelect}>
                  {action.label}
                </ContextMenuItem>
              ))}
            </Fragment>
          ))}
        </ContextMenuContent>
      </ContextMenu>
    </TableHead>
  );
}

type ColumnAction = { key: string; label: string; disabled?: boolean; destructive?: boolean; onSelect: () => void };

/* ================================================================== */
/*  Cell — a value or a formula                                        */
/* ================================================================== */

/**
 * A cell of the table. It holds what is typed, or a formula when what is
 * typed starts with "=": the cell then shows the result, and shows the
 * formula again when it is entered. While a formula is being written
 * anywhere, a click on the cell writes its reference there.
 */
function EditableTableCell({
  row,
  rowIndex,
  column,
  columnIndex,
  columnCount,
  tableV2,
  tableId,
  readOnly,
  formulaMode,
  formulaResults,
  onUpdate,
  onFormulaCellClick,
  onStartSelection,
}: {
  row: { id: string; cells: Record<string, TableCellV2> };
  rowIndex: number;
  column: TableColumn;
  /** Place of the column as shown; with the row's, where Enter and Tab go next. */
  columnIndex: number;
  columnCount: number;
  tableV2: TableV2;
  tableId: string;
  readOnly: boolean;
  formulaMode: FormulaSelectionState | null;
  formulaResults: Map<string, FormulaResult>;
  onUpdate: (id: string, updater: (table: TableContent) => TableContent) => void;
  onFormulaCellClick: (rowId: string, columnId: string) => void;
  onStartSelection: (rowId: string, columnId: string, operation: FormulaSelectionOperation) => void;
}) {
  const { index, highlights } = useFormulaEditing();
  const presentation = useNumberPresentation();
  const cell = row.cells[column.id];
  const isFormula = cell?.kind === "formula";
  const fieldKey = `cell:${tableId}:${row.id}:${column.id}`;
  const displayValue = getCellDisplayValue(tableV2, row.id, column.id, formulaResults, presentation);
  const result = isFormula ? formulaResults.get(formulaCellKey(row.id, column.id)) : undefined;
  const formulaText = cell?.kind === "formula" ? `=${formulaToText(cell.formula, { index, table: tableV2 })}` : null;
  // What was typed as a formula and could not be read as one stays as written, to be corrected.
  const unreadFormula = cell?.kind === "value" && isFormulaText(cell.value);
  const isFormulaTarget = formulaMode?.targetRowId === row.id && formulaMode?.targetColumnId === column.id;
  const isFormulaSource = formulaMode?.sources.some((s) => s.rowId === row.id && s.columnId === column.id);
  // A factor of a homologation shows two decimals; it is written and computed with all of them.
  const factor = isHomologationFactorColumn(tableV2, column.id);
  const [focused, setFocused] = useState(false);

  /* ---- What was already written in the column, offered while typing ---- */
  const [typed, setTyped] = useState<string | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);
  const suggestions = typed === null ? NO_SUGGESTIONS : columnValueSuggestions(tableV2, column.id, row.id, typed);
  const closeSuggestions = () => {
    setTyped(null);
    setSuggestionIndex(0);
  };

  const setValue = (value: string) => {
    onUpdate(tableId, v2Updater((v2) => ({
      ...v2,
      rows: v2.rows.map((r) => (r.id === row.id ? { ...r, cells: { ...r.cells, [column.id]: { kind: "value", value } } } : r)),
    })));
  };
  const { inputRef, draftText, writingFormula, references, change, onFocus, onBlur, onKeyDown, onMouseDown, start } = useFormulaField({
    fieldKey,
    homeTableId: tableId,
    storedFormulaText: () => formulaText ?? (unreadFormula && cell?.kind === "value" ? cell.value : null),
    onCommit: (text) => {
      if (!isFormulaText(text)) {
        setValue(text);
        return;
      }
      const compiled = compileFormula(text, { index, table: tableV2 });
      if (compiled.ok) {
        onUpdate(tableId, v2Updater((v2) => setCellFormula(v2, row.id, column.id, compiled.formula)));
        return;
      }
      toast.error("La fórmula no se aplicó", { description: compiled.message, duration: 12_000 });
      setValue(text);
    },
  });
  const reference = useFormulaReferenceTarget(fieldKey, (homeTableId) => cellReferenceText(index, tableId, tableV2, row.id, column.id, homeTableId));
  const failed = (result && !result.ok) || unreadFormula;
  const title = result && !result.ok
    ? `${formulaErrorMessage(result.error)} ${formulaText ?? ""}`
    : unreadFormula ? "Esta fórmula no se pudo leer: corrígela o bórrala." : formulaText ?? undefined;
  // The color of the reference that names this cell, in the formula being written anywhere.
  const referenceColor = highlights.get(tableId)?.get(formulaCellKey(row.id, column.id));
  const overlayRef = useRef<HTMLSpanElement | null>(null);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (formulaMode) return;
    const offered = suggestions.length > 0;
    if (offered && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setSuggestionIndex((current) => (current + (event.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
      return;
    }
    if (offered && event.key === "Escape") {
      event.preventDefault();
      closeSuggestions();
      return;
    }
    // Tab or Enter take the value offered, as a spreadsheet's autocomplete does.
    if (offered && (event.key === "Tab" || event.key === "Enter")) setValue(suggestions[Math.min(suggestionIndex, suggestions.length - 1)]);
    closeSuggestions();
    onKeyDown(event);
    // Enter confirms and goes down, Shift+Enter up; Tab goes right as the browser does.
    if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      focusTableCell(tableId, rowIndex + (event.shiftKey ? -1 : 1), columnIndex);
    }
  };

  const shownValue = draftText
    ?? (isFormula ? displayValue : cell?.kind === "value" ? (factor && !focused ? displayValue : cell.value) : "");
  // A formula is written in a field as wide as it needs, over the cells beside it: the whole formula is in view.
  const formulaWidth = writingFormula && draftText !== null ? Math.min(Math.max(draftText.length + 3, 24), 96) : null;
  const opensLeft = columnIndex >= Math.ceil(columnCount / 2) && columnCount > 1;

  return (
    <TableCell
      className={cn(
        "p-0.5",
        isFormula && "bg-blue-50/80 dark:bg-blue-500/15",
        isFormulaTarget && "ring-2 ring-blue-400 ring-inset",
        isFormulaSource && "bg-blue-100/80 dark:bg-blue-500/25 ring-1 ring-blue-300 ring-inset",
        formulaMode && !isFormulaTarget && !isFormulaSource && "opacity-60",
        writingFormula && "ring-2 ring-blue-500 ring-inset",
        reference.active && "cursor-cell hover:ring-2 hover:ring-blue-300 hover:ring-inset [&_input]:cursor-cell",
      )}
      style={formulaReferenceCellStyle(referenceColor)}
      data-cell={`${cellReferenceText(index, tableId, tableV2, row.id, column.id, tableId) ?? ""}`}
      data-reference-color={referenceColor}
      onClick={() => formulaMode ? onFormulaCellClick(row.id, column.id) : undefined}
      onMouseDownCapture={reference.onMouseDownCapture}
    >
      <ContextMenu>
        <ContextMenuTrigger>
          <div className="relative flex h-7 items-center">
            <div
              className={cn(
                "flex h-7 min-w-0 flex-1 items-center",
                formulaWidth !== null && "absolute top-0 z-30 rounded-sm bg-background shadow-lg ring-2 ring-blue-500",
                formulaWidth !== null && (opensLeft ? "right-0" : "left-0"),
              )}
              style={formulaWidth !== null ? { width: `max(100%, ${formulaWidth}ch)` } : undefined}
              data-formula-editor={formulaWidth !== null ? "" : undefined}
            >
              <Input
                ref={inputRef}
                disabled={readOnly}
                // In selection mode a click picks the cell; it does not edit it.
                readOnly={Boolean(formulaMode)}
                value={shownValue}
                data-table-cell={tableId}
                data-row-id={row.id}
                data-column-id={column.id}
                data-row={rowIndex}
                data-col={columnIndex}
                onChange={(event) => {
                  if (change(event.target.value)) {
                    closeSuggestions();
                    return;
                  }
                  setValue(event.target.value);
                  const box = event.currentTarget.getBoundingClientRect();
                  setAnchor({ left: box.left, top: box.bottom, width: box.width });
                  setTyped(event.target.value);
                  setSuggestionIndex(0);
                }}
                onFocus={formulaMode ? () => setFocused(true) : (event) => {
                  setFocused(true);
                  onFocus(event);
                }}
                onBlur={(event) => {
                  setFocused(false);
                  closeSuggestions();
                  onBlur(event);
                }}
                onKeyDown={handleKeyDown}
                onMouseDown={onMouseDown}
                onScroll={(event) => {
                  // The colored text follows the field when a long formula scrolls in it.
                  if (overlayRef.current) overlayRef.current.style.transform = `translateX(${-event.currentTarget.scrollLeft}px)`;
                }}
                className={cn(
                  "h-7 w-full min-w-0 border-0 bg-transparent px-1 text-xs box-border",
                  (isFormula || writingFormula) && "font-mono text-blue-600 dark:text-blue-400",
                  writingFormula && references.length > 0 && "text-transparent caret-blue-600 dark:text-transparent dark:caret-blue-400",
                  failed && draftText === null && "text-destructive dark:text-red-400",
                  factor && "tabular-nums",
                )}
                title={title}
              />
              {writingFormula && draftText !== null && references.length > 0 ? (
                <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-1 font-mono text-xs whitespace-pre text-blue-600 md:text-sm dark:text-blue-400">
                  <span ref={overlayRef}>
                    <FormulaReferenceText text={draftText} references={references} />
                  </span>
                </span>
              ) : null}
            </div>
            {isFormula && (
              <FunctionSquare className="h-3 w-3 shrink-0 text-blue-500 mr-1" />
            )}
          </div>
          {suggestions.length > 0 && anchor && focused ? createPortal(
            <ul
              className="fixed z-50 max-h-48 overflow-y-auto rounded-md border bg-popover py-1 text-xs text-popover-foreground shadow-md"
              style={{ left: anchor.left, top: anchor.top + 2, minWidth: Math.max(anchor.width, 160) }}
              role="listbox"
              aria-label="Valores de la columna"
              data-column-suggestions=""
            >
              {suggestions.map((suggestion, position) => (
                <li
                  key={suggestion}
                  role="option"
                  aria-selected={position === suggestionIndex}
                  className={cn("cursor-pointer px-2 py-1", position === suggestionIndex && "bg-accent text-accent-foreground")}
                  // The field keeps the focus: the click only takes the value.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setValue(suggestion);
                    closeSuggestions();
                  }}
                >
                  {suggestion}
                </li>
              ))}
              <li className="border-t px-2 pt-1 text-[10px] text-muted-foreground">Tab o Enter para usarlo</li>
            </ul>,
            document.body,
          ) : null}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {isFormula ? (
            <>
              <ContextMenuItem onClick={() => {
                // The menu gives the focus back when it closes; the cell is entered after that.
                window.setTimeout(start, 80);
              }}>
                Editar fórmula
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onUpdate(tableId, v2Updater((v2) => fillColumnWithFormula(v2, row.id, column.id)))}>
                Copiar fórmula a toda la columna
              </ContextMenuItem>
              <ContextMenuSub>
                <ContextMenuSubTrigger>Formato del resultado</ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-48">
                  {RESULT_FORMATS.map((item) => (
                    <ContextMenuItem key={item.label} onClick={() => onUpdate(tableId, v2Updater((v2) => setCellResultFormat(v2, row.id, column.id, item.format)))}>
                      {item.label}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuItem onClick={() => onUpdate(tableId, v2Updater((v2) => setCellFormula(v2, row.id, column.id, null)))}>
                Quitar fórmula
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          ) : (
            <>
              <ContextMenuSub>
                <ContextMenuSubTrigger>Resultado / Fórmula</ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-44">
                  {SELECTION_OPERATIONS.map((item) => (
                    <ContextMenuItem key={item.operation} onClick={() => onStartSelection(row.id, column.id, item.operation)}>
                      {item.label}
                    </ContextMenuItem>
                  ))}
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => window.setTimeout(start, 80)}>
                    Escribir fórmula (=)
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onClick={() => {
            onUpdate(tableId, v2Updater((v2) => setCellFormula(v2, row.id, column.id, null)));
          }}>
            Limpiar contenido
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </TableCell>
  );
}

/* ================================================================== */
/*  Sortable row                                                       */
/* ================================================================== */

function SortableRow({
  row,
  rowIndex,
  tableV2,
  displayColumns,
  tableId,
  readOnly,
  formulaMode,
  formulaResults,
  isOver,
  isDragging,
  onUpdate,
  onFormulaCellClick,
  onContextMenuInsertAbove,
  onContextMenuInsertBelow,
  onContextMenuDuplicate,
  onContextMenuClear,
  onContextMenuDelete,
  onStartSelection,
}: {
  row: { id: string; cells: Record<string, TableCellV2> };
  rowIndex: number;
  tableV2: TableV2;
  displayColumns: TableColumn[];
  tableId: string;
  readOnly: boolean;
  formulaMode: FormulaSelectionState | null;
  formulaResults: Map<string, FormulaResult>;
  isOver: boolean;
  isDragging: boolean;
  onUpdate: (id: string, updater: (table: TableContent) => TableContent) => void;
  onFormulaCellClick: (rowId: string, columnId: string) => void;
  onContextMenuInsertAbove: (rowId: string) => void;
  onContextMenuInsertBelow: (rowId: string) => void;
  onContextMenuDuplicate: (rowId: string) => void;
  onContextMenuClear: (rowId: string) => void;
  onContextMenuDelete: (rowId: string) => void;
  onStartSelection: (rowId: string, columnId: string, operation: FormulaSelectionOperation) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: row.id, disabled: readOnly || !!formulaMode });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <TableRow ref={setNodeRef} style={style} className={cn(
      rowIndex % 2 === 1 && "bg-primary/[0.03]",
      isOver && !isDragging && "bg-blue-50 dark:bg-blue-500/15",
    )}>
      <TableCell className="w-6 select-none p-0 text-center font-mono text-[10px] text-muted-foreground/70" title={`Fila ${rowIndex + 1} en las fórmulas`}>
        {rowIndex + 1}
      </TableCell>
      {displayColumns.map((column, columnIndex) => (
        <EditableTableCell
          key={column.id}
          row={row}
          rowIndex={rowIndex}
          column={column}
          columnIndex={columnIndex}
          columnCount={displayColumns.length}
          tableV2={tableV2}
          tableId={tableId}
          readOnly={readOnly}
          formulaMode={formulaMode}
          formulaResults={formulaResults}
          onUpdate={onUpdate}
          onFormulaCellClick={onFormulaCellClick}
          onStartSelection={onStartSelection}
        />
      ))}
      {/* Row context menu + drag handle */}
      <TableCell className="w-8 p-0.5">
        <ContextMenu>
          <ContextMenuTrigger>
            <div
              className="flex items-center justify-center"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-3.5 w-3.5 cursor-grab text-muted-foreground/70" />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-44">
            <ContextMenuItem onClick={() => onContextMenuInsertAbove(row.id)}>
              Insertar fila arriba
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onContextMenuInsertBelow(row.id)}>
              Insertar fila abajo
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onContextMenuDuplicate(row.id)}>
              Duplicar fila
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onContextMenuClear(row.id)}>
              Limpiar fila
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              onClick={() => onContextMenuDelete(row.id)}
            >
              Eliminar fila
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </TableCell>
    </TableRow>
  );
}

/* ================================================================== */
/*  TableEditors — renders a list of table editors                      */
/* ================================================================== */

export function TableEditors({
  tables,
  onAddColumn,
  onAddRow,
  onRemove,
  onUpdate,
  readOnly,
}: {
  tables: TableContent[];
  onAddColumn: (tableId: string) => void;
  onAddRow: (tableId: string) => void;
  onRemove: (tableId: string) => void;
  onUpdate: (tableId: string, updater: (table: TableContent) => TableContent) => void;
  readOnly: boolean;
}) {
  if (!tables.length) return null;

  return (
    <FieldGroup>
      {tables.map((table) => (
        <TableEditorItem
          key={table.id}
          table={table}
          onAddColumn={onAddColumn}
          onAddRow={onAddRow}
          onRemove={onRemove}
          onUpdate={onUpdate}
          readOnly={readOnly}
        />
      ))}
    </FieldGroup>
  );
}

/* ================================================================== */
/*  TableEditorItem — single table editor                              */
/* ================================================================== */

export function TableEditorItem({
  table,
  onAddColumn,
  onAddRow,
  onRemove,
  onUpdate,
  readOnly,
  footer,
}: {
  table: TableContent;
  onAddColumn: (tableId: string) => void;
  onAddRow: (tableId: string) => void;
  onRemove: (tableId: string) => void;
  onUpdate: (tableId: string, updater: (table: TableContent) => TableContent) => void;
  readOnly: boolean;
  /** What is printed with the table and edited with it, under the grid. */
  footer?: ReactNode;
}) {
  const tableV2 = useMemo(() => ensureTableV2(table), [table]);
  const formulaResults = useMemo(() => evaluateTableFormulas(tableV2), [tableV2]);
  const [formulaMode, setFormulaMode] = useState<FormulaSelectionState | null>(null);

  /* ---- Column and row DnD state ---- */
  const [activeColId, setActiveColId] = useState<string | null>(null);
  const [overColId, setOverColId] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [overRowId, setOverRowId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Columns and rows are dragged in one context: a column is dropped on columns, a row on rows.
  const columnIdSet = useMemo(() => new Set(tableV2.columns.map((column) => column.id)), [tableV2.columns]);
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const draggingColumn = columnIdSet.has(String(args.active.id));
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) => columnIdSet.has(String(container.id)) === draggingColumn),
    });
  }, [columnIdSet]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    if (columnIdSet.has(id)) setActiveColId(id);
    else setActiveRowId(id);
  }, [columnIdSet]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    if (columnIdSet.has(String(event.active.id))) setOverColId(overId);
    else setOverRowId(overId);
  }, [columnIdSet]);

  const handleDragCancel = useCallback(() => {
    setActiveColId(null);
    setOverColId(null);
    setActiveRowId(null);
    setOverRowId(null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    handleDragCancel();
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (columnIdSet.has(activeId)) {
      // The column takes the place of the one it is dropped on, and its zone in a structured table.
      onUpdate(table.id, v2Updater((v2) => moveTableColumnTo(v2, activeId, overId)));
      return;
    }
    const fromIndex = tableV2.rows.findIndex((r) => r.id === activeId);
    const toIndex = tableV2.rows.findIndex((r) => r.id === overId);
    if (fromIndex < 0 || toIndex < 0) return;
    onUpdate(table.id, v2Updater((v2) => moveTableRow(v2, fromIndex, toIndex)));
  }, [columnIdSet, handleDragCancel, table.id, tableV2.rows, onUpdate]);

  /* ---- Formula selection mode ---- */
  const startFormulaMode = useCallback((rowId: string, columnId: string, op: FormulaSelectionOperation) => {
    setFormulaMode({ targetRowId: rowId, targetColumnId: columnId, operation: op, sources: [], parameter: "" });
  }, []);

  const handleFormulaCellClick = useCallback((rowId: string, columnId: string) => {
    if (!formulaMode) return;
    if (rowId === formulaMode.targetRowId && columnId === formulaMode.targetColumnId) return;
    if (formulaMode.sources.some((s) => s.rowId === rowId && s.columnId === columnId)) return;
    if (takesParameter(formulaMode.operation) && formulaMode.sources.length >= 2) return;
    setFormulaMode((prev) => prev ? { ...prev, sources: [...prev.sources, { rowId, columnId }] } : null);
  }, [formulaMode]);

  const selectionFormula = useMemo(() => {
    if (!formulaMode) return null;
    return buildFormulaFromSelection(formulaMode.operation, formulaMode.sources, { parameter: parseDecimal(formulaMode.parameter) });
  }, [formulaMode]);

  const applyFormulaSelection = useCallback(() => {
    if (!formulaMode || formulaMode.sources.length === 0) { setFormulaMode(null); return; }
    if (!selectionFormula) return;
    onUpdate(table.id, v2Updater((v2) => setCellFormula(v2, formulaMode.targetRowId, formulaMode.targetColumnId, selectionFormula)));
    setFormulaMode(null);
  }, [formulaMode, selectionFormula, table.id, onUpdate]);

  const cancelFormulaSelection = useCallback(() => { setFormulaMode(null); }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!formulaMode) return;
    if (e.key === "Escape") cancelFormulaSelection();
    if (e.key === "Enter" && selectionFormula) applyFormulaSelection();
  }, [formulaMode, selectionFormula, cancelFormulaSelection, applyFormulaSelection]);

  /* ---- Context menu column actions ---- */
  const ctxRenameColumn = useCallback((columnId: string, currentName: string) => {
    const newName = prompt("Nuevo nombre de columna:", currentName);
    if (newName !== null && newName.trim()) {
      onUpdate(table.id, v2Updater((v2) => renameTableColumn(v2, columnId, newName)));
    }
  }, [table.id, onUpdate]);

  const ctxInsertColumnLeft = useCallback((columnId: string) => {
    onUpdate(table.id, v2Updater((v2) => insertTableColumnBeside(v2, columnId, "left", "Nueva columna")));
  }, [table.id, onUpdate]);

  const ctxInsertColumnRight = useCallback((columnId: string) => {
    onUpdate(table.id, v2Updater((v2) => insertTableColumnBeside(v2, columnId, "right", "Nueva columna")));
  }, [table.id, onUpdate]);

  const ctxClearColumn = useCallback((columnId: string) => {
    onUpdate(table.id, v2Updater((v2) => clearTableColumn(v2, columnId)));
  }, [table.id, onUpdate]);

  const ctxMoveColumn = useCallback((columnId: string, direction: -1 | 1) => {
    onUpdate(table.id, v2Updater((v2) => moveTableColumnBy(v2, columnId, direction)));
  }, [table.id, onUpdate]);

  const ctxDeleteColumn = useCallback((columnId: string) => {
    // A column with something written is only deleted on purpose; formulas that read it will show #REF!.
    if (columnHasData(tableV2, columnId)) {
      const name = tableV2.columns.find((c) => c.id === columnId)?.name.trim() || "La columna";
      if (!window.confirm(`${name} tiene datos. ¿Eliminar la columna y lo que contiene?`)) return;
    }
    onUpdate(table.id, v2Updater((v2) => removeTableColumn(v2, columnId)));
  }, [table.id, tableV2, onUpdate]);

  /* ---- Context menu row actions ---- */
  const ctxInsertRowAbove = useCallback((rowId: string) => {
    const idx = tableV2.rows.findIndex((r) => r.id === rowId);
    onUpdate(table.id, v2Updater((v2) => insertTableRow(v2, idx)));
  }, [table.id, tableV2.rows, onUpdate]);

  const ctxInsertRowBelow = useCallback((rowId: string) => {
    const idx = tableV2.rows.findIndex((r) => r.id === rowId);
    onUpdate(table.id, v2Updater((v2) => insertTableRow(v2, idx + 1)));
  }, [table.id, tableV2.rows, onUpdate]);

  const ctxDuplicateRow = useCallback((rowId: string) => {
    const idx = tableV2.rows.findIndex((r) => r.id === rowId);
    onUpdate(table.id, v2Updater((v2) => duplicateTableRow(v2, idx)));
  }, [table.id, tableV2.rows, onUpdate]);

  const ctxClearRow = useCallback((rowId: string) => {
    const idx = tableV2.rows.findIndex((r) => r.id === rowId);
    onUpdate(table.id, v2Updater((v2) => clearTableRow(v2, idx)));
  }, [table.id, tableV2.rows, onUpdate]);

  const ctxDeleteRow = useCallback((rowId: string) => {
    const idx = tableV2.rows.findIndex((r) => r.id === rowId);
    onUpdate(table.id, v2Updater((v2) => removeTableRow(v2, idx)));
  }, [table.id, tableV2.rows, onUpdate]);

  /* ---- Group title editing ---- */
  const ctxRenameGroupTitle = useCallback((groupId: string, currentTitle: string) => {
    const newTitle = prompt("Título del grupo:", currentTitle);
    if (newTitle !== null && newTitle.trim()) {
      onUpdate(table.id, v2Updater((v2) => {
        if (!v2.schema) return v2;
        return { ...v2, schema: updateHeaderGroupTitle(v2.schema, groupId, newTitle.trim()) };
      }));
    }
  }, [table.id, onUpdate]);

  const rowIds = useMemo(() => tableV2.rows.map((r) => r.id), [tableV2.rows]);
  const headerLayout = useMemo(() => getTableHeaderLayout(tableV2), [tableV2]);
  const displayColumns = useMemo(() => getDisplayColumns(tableV2), [tableV2]);
  const displayColumnIds = useMemo(() => displayColumns.map((column) => column.id), [displayColumns]);
  // Formulas name a cell by the letter of its column and the number of its row, as the table shows them.
  const letterOf = useCallback((columnId: string) => columnLetter(displayColumns.findIndex((c) => c.id === columnId)), [displayColumns]);
  const selectionHint = formulaMode ? SELECTION_OPERATIONS.find((item) => item.operation === formulaMode.operation)?.hint : undefined;

  // Columns share the width as the printed table shares it, after what they hold; a table of many columns scrolls.
  const presentation = useNumberPresentation();
  const columnChars = useMemo(() => estimateColumnChars(displayColumns.map((column) => ({
    header: column.name,
    cells: tableV2.rows.map((row) => getCellDisplayValue(tableV2, row.id, column.id, formulaResults, presentation)),
    noWrap: tableV2.schema?.columnPresentation?.[column.id]?.noWrap,
  }))), [displayColumns, formulaResults, presentation, tableV2]);
  // Each column also holds its handle, its letter and its menu beside the header.
  const columnPixels = columnChars.map((chars) => Math.max(chars, EDITOR_MIN_COLUMN_CHARS) * EDITOR_CHAR_PX + EDITOR_HEADER_CHROME_PX);
  const totalPixels = columnPixels.reduce((total, pixels) => total + pixels, 0) || 1;
  const widthOf = new Map(displayColumns.map((column, index) => [column.id, columnPixels[index]]));
  const getColumnWidth = (columnId: string): CSSProperties => ({ width: `${((widthOf.get(columnId) ?? 0) / totalPixels) * 100}%` });
  const tableMinWidth = totalPixels + EDITOR_ROW_CHROME_PX;

  return (
    <section className="rounded-lg border bg-muted/20 p-4" onKeyDown={handleKeyDown} tabIndex={-1} data-table-editor={table.id}>
      {/* Table title + toolbar */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <Input
          disabled={readOnly}
          value={tableV2.title}
          onChange={(event) => onUpdate(table.id, (current) => ({ ...current, title: event.target.value }))}
          className="font-semibold"
        />
        <div className="flex gap-1">
          <Button type="button" size="icon" variant="outline" aria-label="Agregar columna" disabled={readOnly} title="Agregar columna" onClick={() => onAddColumn(table.id)}>
            <Columns3 />
          </Button>
          <Button type="button" size="icon" variant="outline" aria-label="Agregar fila" disabled={readOnly} title="Agregar fila" onClick={() => onAddRow(table.id)}>
            <Rows3 />
          </Button>
          <TableFormatControl table={tableV2} readOnly={readOnly} onChange={(updater) => onUpdate(table.id, v2Updater(updater))} />
          <Button type="button" size="icon" variant="ghost" aria-label={`Quitar ${tableV2.title}`} disabled={readOnly} title="Quitar tabla" onClick={() => onRemove(table.id)}>
            <Trash2 />
          </Button>
        </div>
      </div>

      {/* Formula selection mode indicator */}
      {formulaMode && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/15 px-3 py-1.5 text-xs text-blue-700 dark:text-blue-300">
          <Calculator className="h-3.5 w-3.5" />
          <span>
            <strong>{SELECTION_LABELS[formulaMode.operation]}</strong>: {selectionHint ?? "Selecciona las celdas."} ({formulaMode.sources.length} {formulaMode.sources.length === 1 ? "seleccionada" : "seleccionadas"})
          </span>
          {takesParameter(formulaMode.operation) && formulaMode.sources.length < 2 ? (
            <label className="flex items-center gap-1">
              {formulaMode.operation === "POWER" ? "Exponente" : "Índice"}
              <Input
                aria-label={formulaMode.operation === "POWER" ? "Exponente" : "Índice de la raíz"}
                className="h-6 w-16 bg-background px-1 text-xs"
                inputMode="decimal"
                placeholder={formulaMode.operation === "POWER" ? "2" : "2"}
                value={formulaMode.parameter}
                onChange={(event) => setFormulaMode((prev) => (prev ? { ...prev, parameter: event.target.value } : null))}
              />
            </label>
          ) : null}
          <Button type="button" size="sm" variant="ghost" className="ml-auto h-6 gap-1 text-xs text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100" onClick={applyFormulaSelection} disabled={!selectionFormula}>
            <Check className="h-3 w-3" /> Aplicar
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 text-xs text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100" onClick={cancelFormulaSelection}>
            <X className="h-3 w-3" /> Cancelar
          </Button>
        </div>
      )}

      {/* Hint */}
      {!readOnly && !formulaMode && (
        <p className="mb-2 text-[10px] text-muted-foreground">
          Clic derecho para más opciones. Para calcular, escribe = en una celda, por ejemplo =B2*C2 o =SUMA(A1:A5).
        </p>
      )}

      {/* Table grid */}
      <div className="overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          autoScroll={{ canScroll: editorCanScroll }}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
            <Table className="table-fixed text-xs" style={{ minWidth: tableMinWidth }}>
              <colgroup>
                <col className="w-6" />
                {displayColumns.map((col) => (
                  <col key={col.id} style={getColumnWidth(col.id)} />
                ))}
                <col className="w-8" />
              </colgroup>
              <TableHeader>
                {/* Every column header moves among all the others, in either header row. */}
                <SortableContext items={displayColumnIds} strategy={horizontalListSortingStrategy}>
                {headerLayout.hasGroups ? (
                  <>
                    {/* Row 1: ungrouped columns (rowSpan=2) + group titles (colSpan) */}
                    <TableRow>
                      <TableHead className="w-6 p-0" rowSpan={2} />
                      {headerLayout.topRow.map((cell) => (
                        cell.kind === "column" ? (
                          <SortableColumnHeader
                            key={cell.columnId}
                            column={tableV2.columns.find((c) => c.id === cell.columnId)!}
                            letter={letterOf(cell.columnId)}
                            tableV2={tableV2}
                            tableId={table.id}
                            readOnly={readOnly}
                            formulaMode={formulaMode}
                            capability={resolveColumnCapability(cell.columnId, tableV2.schema)}
                            isOver={overColId === cell.columnId}
                            isDragging={activeColId === cell.columnId}
                            rowSpan={cell.rowSpan}
                            cellStyle={getColumnWidth(cell.columnId)}
                            onUpdate={onUpdate}
                            onContextMenuRename={ctxRenameColumn}
                            onContextMenuInsertLeft={ctxInsertColumnLeft}
                            onContextMenuInsertRight={ctxInsertColumnRight}
                            onContextMenuMove={ctxMoveColumn}
                            onContextMenuClear={ctxClearColumn}
                            onContextMenuDelete={ctxDeleteColumn}
                          />
                        ) : (
                          <TableHead
                            key={cell.group.id}
                            colSpan={cell.colSpan}
                            className="p-0 text-center bg-muted"
                          >
                            <ContextMenu>
                              <ContextMenuTrigger>
                                <div
                                  className="px-2 py-1 text-xs font-semibold cursor-pointer hover:bg-accent rounded"
                                  onDoubleClick={() => {
                                    if (cell.group.titleEditable !== false) {
                                      ctxRenameGroupTitle(cell.group.id, cell.group.title);
                                    }
                                  }}
                                >
                                  {cell.group.title}
                                </div>
                              </ContextMenuTrigger>
                              <ContextMenuContent className="w-40">
                                <ContextMenuItem onClick={() => ctxRenameGroupTitle(cell.group.id, cell.group.title)}>
                                  Renombrar grupo
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          </TableHead>
                        )
                      ))}
                      <TableHead className="w-8 p-0" rowSpan={2} />
                    </TableRow>
                    {/* Row 2: grouped child column headers */}
                    {headerLayout.bottomRow && (
                      <TableRow>
                          {headerLayout.bottomRow.map((colId) => {
                            const column = tableV2.columns.find((c) => c.id === colId);
                            if (!column) return null;
                            return (
                              <SortableColumnHeader
                                key={colId}
                                column={column}
                                letter={letterOf(colId)}
                                tableV2={tableV2}
                                tableId={table.id}
                                readOnly={readOnly}
                                formulaMode={formulaMode}
                                capability={resolveColumnCapability(colId, tableV2.schema)}
                                isOver={overColId === colId}
                                isDragging={activeColId === colId}
                                cellStyle={getColumnWidth(colId)}
                                onUpdate={onUpdate}
                                onContextMenuRename={ctxRenameColumn}
                                onContextMenuInsertLeft={ctxInsertColumnLeft}
                                onContextMenuInsertRight={ctxInsertColumnRight}
                                onContextMenuMove={ctxMoveColumn}
                                onContextMenuClear={ctxClearColumn}
                                onContextMenuDelete={ctxDeleteColumn}
                              />
                            );
                          })}
                      </TableRow>
                    )}
                  </>
                ) : (
                  /* Free table: single-row header */
                  <TableRow>
                    <TableHead className="w-6 p-0" />
                      {displayColumns.map((column) => (
                        <SortableColumnHeader
                          key={column.id}
                          column={column}
                          letter={letterOf(column.id)}
                          tableV2={tableV2}
                          tableId={table.id}
                          readOnly={readOnly}
                          formulaMode={formulaMode}
                          capability={resolveColumnCapability(column.id, tableV2.schema)}
                          isOver={overColId === column.id}
                          isDragging={activeColId === column.id}
                          cellStyle={getColumnWidth(column.id)}
                          onUpdate={onUpdate}
                          onContextMenuRename={ctxRenameColumn}
                          onContextMenuInsertLeft={ctxInsertColumnLeft}
                          onContextMenuInsertRight={ctxInsertColumnRight}
                          onContextMenuMove={ctxMoveColumn}
                          onContextMenuClear={ctxClearColumn}
                          onContextMenuDelete={ctxDeleteColumn}
                        />
                      ))}
                    <TableHead className="w-8 p-0" />
                  </TableRow>
                )}
                </SortableContext>
              </TableHeader>
              <TableBody>
                <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
                  {tableV2.rows.map((row, rowIndex) => (
                    <SortableRow
                      key={row.id}
                      row={row}
                      rowIndex={rowIndex}
                      tableV2={tableV2}
                      displayColumns={displayColumns}
                      tableId={table.id}
                      readOnly={readOnly}
                      formulaMode={formulaMode}
                      formulaResults={formulaResults}
                      isOver={overRowId === row.id}
                      isDragging={activeRowId === row.id}
                      onUpdate={onUpdate}
                      onFormulaCellClick={handleFormulaCellClick}
                      onContextMenuInsertAbove={ctxInsertRowAbove}
                      onContextMenuInsertBelow={ctxInsertRowBelow}
                      onContextMenuDuplicate={ctxDuplicateRow}
                      onContextMenuClear={ctxClearRow}
                      onContextMenuDelete={ctxDeleteRow}
                      onStartSelection={startFormulaMode}
                    />
                  ))}
                </SortableContext>
              </TableBody>
            </Table>
        </DndContext>
      </div>

      {footer}

      {/* Result groups */}
      {tableV2.schema?.resultGroups && tableV2.schema.resultGroups.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-start justify-between gap-4 text-[11px]">
            <div className="flex flex-col gap-1">
              {tableV2.schema.resultGroups
                .filter((g) => g.align === "start" || !g.align)
                .flatMap((g) => g.items)
                .map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className="font-medium text-muted-foreground">{item.label}</span>
                    <span className="text-muted-foreground/70 italic text-[10px]">—</span>
                  </div>
                ))}
            </div>
            <div className="flex flex-col gap-1 text-center">
              {tableV2.schema.resultGroups
                .filter((g) => g.align === "center")
                .flatMap((g) => g.items)
                .map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className="font-medium text-muted-foreground">{item.label}</span>
                    <span className="text-muted-foreground/70 italic text-[10px]">—</span>
                  </div>
                ))}
            </div>
            <div className="flex flex-col gap-1 text-right">
              {tableV2.schema.resultGroups
                .filter((g) => g.align === "end")
                .flatMap((g) => g.items)
                .map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className="font-medium text-muted-foreground">{item.label}</span>
                    <span className="text-muted-foreground/70 italic text-[10px]">—</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
