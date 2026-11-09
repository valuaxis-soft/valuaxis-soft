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
  type TableCellFormat,
  type FormulaResult,
  type FormulaSelectionOperation,
  type ColumnCapability,
  CELL_FORMAT_OPTIONS,
  HOMOLOGATION_HEADER_HINTS,
  moveTableColumnBy,
  moveTableColumnTo,
  canMoveTableColumn,
  canRemoveTableColumn,
  canInsertBesideColumn,
  columnHasData,
  columnValueSuggestions,
  columnWidthOf,
  estimateColumnChars,
  moveTableRow,
  insertTableColumnBeside,
  isColumnHidden,
  isHomologationFactorColumn,
  isRowHidden,
  numericCellProblem,
  removeTableColumn,
  renameTableColumn,
  insertTableRow,
  removeTableRow,
  duplicateTableRow,
  setCellFormula,
  setCellResultFormat,
  setColumnFormat,
  setColumnHidden,
  setColumnWidth,
  setRowHidden,
  sortTableRows,
  fillColumnWithFormula,
  fillRowWithFormula,
  buildFormulaFromSelection,
  resolveColumnCapability,
  getTableHeaderLayout,
  getDisplayColumns,
  updateHeaderGroupTitle,
} from "../../services/table";
import {
  tableContextMenu,
  type TableMenuAction,
  type TableMenuGroup,
  type TableMenuItem,
} from "../../services/table-context-menu";
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
import { deleteConfirmation, useConfirmDelete, type DeleteConfirmation } from "./delete-confirm";

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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
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

/** The operations of "Operaciones", in the order the menu offers them. */
const SELECTION_OPERATIONS: Array<{ operation: FormulaSelectionOperation; label: string; hint: string }> = [
  { operation: "ADD", label: "Sumar", hint: "Selecciona las celdas que se suman." },
  { operation: "SUBTRACT", label: "Restar", hint: "Selecciona la celda de la que se resta y luego las que se restan." },
  { operation: "MULTIPLY", label: "Multiplicar", hint: "Selecciona todas las celdas que se multiplican entre sí." },
  { operation: "DIVIDE", label: "Dividir", hint: "Selecciona la celda que se divide y luego entre cuál." },
  { operation: "AVERAGE", label: "Promedio", hint: "Selecciona las celdas que se promedian." },
  { operation: "MIN", label: "Mínimo (MIN)", hint: "Selecciona las celdas de las que se toma la menor." },
  { operation: "MAX", label: "Máximo (MAX)", hint: "Selecciona las celdas de las que se toma la mayor." },
  { operation: "POWER", label: "Potencia", hint: "Selecciona la celda base. El exponente se escribe aquí o se toma de una segunda celda." },
  { operation: "ROOT", label: "Raíz", hint: "Selecciona la celda. Sin índice es la raíz cuadrada; el índice se escribe aquí o se toma de una segunda celda." },
  { operation: "LN", label: "Logaritmo natural (LN)", hint: "Selecciona la celda de la que se toma el logaritmo natural." },
  { operation: "LOG", label: "Logaritmo (LOG)", hint: "Selecciona la celda; una segunda celda es la base (sin ella, base 10)." },
];
const SELECTION_LABELS: Record<FormulaSelectionOperation, string> = {
  SUM: "Sumar",
  ...Object.fromEntries(SELECTION_OPERATIONS.map((item) => [item.operation, item.label])),
} as Record<FormulaSelectionOperation, string>;
/** A power and a root read one cell, and a second one for the exponent or the index. */
const takesParameter = (operation: FormulaSelectionOperation) => operation === "POWER" || operation === "ROOT";
/** Most cells an operation reads; the others take as many as are selected. */
const sourceLimit = (operation: FormulaSelectionOperation) => (operation === "LN" ? 1 : takesParameter(operation) || operation === "LOG" ? 2 : Infinity);

const NO_SUGGESTIONS: string[] = [];
/** Narrowest a column gets in the editor, in characters, before the table scrolls sideways: a short header ("Clas", "Re") stays whole. */
const EDITOR_MIN_COLUMN_CHARS = 8;
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
/*  Clipboard of cells                                                 */
/* ================================================================== */

/**
 * What "Copiar" took from a cell: the value shown and, when the cell holds a
 * formula, its text. The system clipboard gets the value; a paste inside the
 * app pastes the formula while the system clipboard still holds that value.
 */
let cellClipboard: { text: string; formulaText: string | null } | null = null;

async function copyCellToClipboard(text: string, formulaText: string | null) {
  cellClipboard = { text, formulaText };
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Without permission the copy lives in memory, for a paste inside the app.
  }
}

/** What a paste brings: the formula copied in the app, or the text of the system clipboard. */
async function readCellClipboard(): Promise<{ text: string; formulaText: string | null } | null> {
  let system: string | null = null;
  try {
    system = await navigator.clipboard.readText();
  } catch {
    system = null;
  }
  if (cellClipboard && (system === null || system === "" || system === cellClipboard.text)) return cellClipboard;
  if (system) return { text: system, formulaText: isFormulaText(system) ? system : null };
  return cellClipboard;
}

/* ================================================================== */
/*  Menu rendering — the same groups in a right click and in a button  */
/* ================================================================== */

type MenuParts = {
  Item: typeof ContextMenuItem | typeof DropdownMenuItem;
  Separator: typeof ContextMenuSeparator | typeof DropdownMenuSeparator;
  Sub: typeof ContextMenuSub | typeof DropdownMenuSub;
  SubTrigger: typeof ContextMenuSubTrigger | typeof DropdownMenuSubTrigger;
  SubContent: typeof ContextMenuSubContent | typeof DropdownMenuSubContent;
};

const CONTEXT_PARTS: MenuParts = { Item: ContextMenuItem, Separator: ContextMenuSeparator, Sub: ContextMenuSub, SubTrigger: ContextMenuSubTrigger, SubContent: ContextMenuSubContent };
const DROPDOWN_PARTS: MenuParts = { Item: DropdownMenuItem, Separator: DropdownMenuSeparator, Sub: DropdownMenuSub, SubTrigger: DropdownMenuSubTrigger, SubContent: DropdownMenuSubContent };

type MenuHandlers = {
  onAction: (action: TableMenuAction) => void;
  /** The formats of "Formato del valor…" and "Formato de la columna". */
  onFormat?: (format: TableCellFormat | null) => void;
  /** The operations of "Operaciones", and writing a formula by hand. */
  onOperation?: (operation: FormulaSelectionOperation | null) => void;
};

/** The items of the menu, as the model gives them: a disabled item keeps its reason as a tooltip. */
function MenuGroups({ groups, parts, handlers }: { groups: TableMenuGroup[]; parts: MenuParts; handlers: MenuHandlers }) {
  const { Item, Separator, Sub, SubTrigger, SubContent } = parts;
  const renderItem = (item: TableMenuItem) => {
    if (item.submenu && !item.disabled) {
      return (
        <Sub key={`${item.action}:${item.label}`}>
          <SubTrigger>{item.label}</SubTrigger>
          <SubContent className="w-52">
            {item.submenu === "formats" ? CELL_FORMAT_OPTIONS.map((option) => (
              <Item key={option.key} onClick={() => handlers.onFormat?.(option.format)}>{option.label}</Item>
            )) : (
              <>
                {SELECTION_OPERATIONS.map((operation) => (
                  <Item key={operation.operation} onClick={() => handlers.onOperation?.(operation.operation)}>{operation.label}</Item>
                ))}
                <Separator />
                <Item onClick={() => handlers.onOperation?.(null)}>Escribir fórmula (=)</Item>
              </>
            )}
          </SubContent>
        </Sub>
      );
    }
    const node = (
      <Item
        key={`${item.action}:${item.label}`}
        variant={item.destructive ? "destructive" : undefined}
        disabled={item.disabled}
        aria-description={item.disabled ? item.hint : undefined}
        onClick={() => handlers.onAction(item.action)}
      >
        {item.label}
      </Item>
    );
    // A disabled item takes no pointer events: the reason hangs from what wraps it.
    return item.disabled && item.hint ? <div key={`${item.action}:${item.label}`} title={item.hint} data-menu-hint={item.hint}>{node}</div> : node;
  };
  return (
    <>
      {groups.map((group, index) => (
        <Fragment key={index}>
          {index > 0 ? <Separator /> : null}
          {group.map(renderItem)}
        </Fragment>
      ))}
    </>
  );
}

/* ================================================================== */
/*  Sortable column header                                             */
/* ================================================================== */

/** What the header asks of the table for a column; `format` goes with "column-format". */
type ColumnActionHandler = (columnId: string, action: TableMenuAction, format?: TableCellFormat | null) => void;

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
  onColumnAction,
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
  onColumnAction: ColumnActionHandler;
}) {
  const isMovable = capability.movable !== false;
  const columnName = column.name.trim() || `columna ${letter}`;
  const hidden = isColumnHidden(tableV2, column.id);
  const hint = HOMOLOGATION_HEADER_HINTS[column.id];

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

  // The actions of the right click and of the header's menu, the same in both.
  const groups = tableContextMenu("editable", {
    kind: "column",
    canInsertBeside: canInsertBesideColumn(tableV2, column.id),
    canRename: capability.headerEditable !== false,
    canMoveLeft: isMovable && canMoveTableColumn(tableV2, column.id, -1),
    canMoveRight: isMovable && canMoveTableColumn(tableV2, column.id, 1),
    canDelete: capability.removable !== false && canRemoveTableColumn(tableV2, column.id),
    hidden,
    canHide: true,
  });
  const handlers: MenuHandlers = {
    onAction: (action) => onColumnAction(column.id, action),
    onFormat: (format) => onColumnAction(column.id, "column-format", format),
  };

  return (
    <TableHead ref={setNodeRef} style={{ ...style, ...cellStyle }} className="h-auto p-0 align-top" rowSpan={rowSpan} colSpan={colSpan} data-column-hidden={hidden ? "" : undefined}>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={cn(
              "flex min-w-0 items-start gap-1 rounded-sm border border-border bg-muted/50 px-1.5 py-1 transition-colors",
              isOver && !isDragging && "border-blue-400 bg-blue-50 dark:bg-blue-500/15",
              formulaMode && "opacity-60",
              hidden && "opacity-50",
            )}
            title={hidden ? `${hint ?? columnName}: oculta en el dictamen` : hint}
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
              className="field-sizing-content min-h-6 min-w-[3ch] flex-1 resize-none overflow-hidden border-0 bg-transparent px-0.5 py-0.5 text-xs leading-tight font-semibold wrap-break-word outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed"
              rows={1}
              disabled={readOnly || capability.headerEditable === false}
              value={draftName}
              data-column-header={column.id}
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
                <DropdownMenuContent align="end" className="w-60">
                  <MenuGroups groups={groups} parts={DROPDOWN_PARTS} handlers={handlers} />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </ContextMenuTrigger>
        {!readOnly ? (
          <ContextMenuContent className="w-60">
            <MenuGroups groups={groups} parts={CONTEXT_PARTS} handlers={handlers} />
          </ContextMenuContent>
        ) : null}
      </ContextMenu>
    </TableHead>
  );
}

/* ================================================================== */
/*  Cell — a value or a formula                                        */
/* ================================================================== */

/** What a cell asks of its row and column: inserting and deleting beside it. */
type CellStructureActions = {
  insertRowAbove: (rowId: string) => void;
  insertRowBelow: (rowId: string) => void;
  deleteRow: (rowId: string) => void;
  insertColumnLeft: (columnId: string) => void;
  insertColumnRight: (columnId: string) => void;
  deleteColumn: (columnId: string) => void;
};

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
  hidden,
  onUpdate,
  onFormulaCellClick,
  onStartSelection,
  structure,
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
  /** The row or the column is hidden in the dictamen. */
  hidden: boolean;
  onUpdate: (id: string, updater: (table: TableContent) => TableContent) => void;
  onFormulaCellClick: (rowId: string, columnId: string) => void;
  onStartSelection: (rowId: string, columnId: string, operation: FormulaSelectionOperation) => void;
  structure: CellStructureActions;
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
  // A number typed in a cell with a format shows as the format says; entered, it shows as typed.
  const formatted = cell?.kind === "value" && Boolean(cell.format ?? column.format) && displayValue !== cell.value;
  // Letters in a numeric cell: marked, and left out of the calculations.
  const numericProblem = numericCellProblem(tableV2, column.id, cell);
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
      rows: v2.rows.map((r) => {
        if (r.id !== row.id) return r;
        const format = r.cells[column.id]?.format;
        return { ...r, cells: { ...r.cells, [column.id]: { kind: "value", value, ...(format ? { format } : {}) } } };
      }),
    })));
  };
  const applyFormulaText = (text: string) => {
    const compiled = compileFormula(text, { index, table: tableV2 });
    if (compiled.ok) {
      onUpdate(tableId, v2Updater((v2) => setCellFormula(v2, row.id, column.id, compiled.formula)));
      return;
    }
    toast.error("La fórmula no se aplicó", { description: compiled.message, duration: 12_000 });
    setValue(text);
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
      applyFormulaText(text);
    },
  });
  const reference = useFormulaReferenceTarget(fieldKey, (homeTableId) => cellReferenceText(index, tableId, tableV2, row.id, column.id, homeTableId));
  const failed = (result && !result.ok) || unreadFormula;
  const title = result && !result.ok
    ? `${formulaErrorMessage(result.error)} ${formulaText ?? ""}`
    : unreadFormula ? "Esta fórmula no se pudo leer: corrígela o bórrala."
    : numericProblem ? `${numericProblem}: lo escrito no entra en los cálculos.`
    : formulaText ?? (hidden ? "Oculta en el dictamen" : undefined);
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
    ?? (isFormula ? displayValue : cell?.kind === "value" ? ((factor || formatted) && !focused ? displayValue : cell.value) : "");
  // A formula is written in a field as wide as it needs, over the cells beside it: the whole formula is in view.
  const formulaWidth = writingFormula && draftText !== null ? Math.min(Math.max(draftText.length + 3, 24), 96) : null;
  const opensLeft = columnIndex >= Math.ceil(columnCount / 2) && columnCount > 1;

  /* ---- The right-click menu ---- */
  const groups = tableContextMenu("editable", {
    kind: "cell",
    editable: true,
    hasFormula: isFormula,
    canPaste: true,
    canInsertRow: true,
    canInsertColumn: canInsertBesideColumn(tableV2, column.id),
    canDeleteColumn: canRemoveTableColumn(tableV2, column.id),
    canDeleteRow: tableV2.rows.length > 1,
  });
  // The menu gives the focus back when it closes; the cell is entered after that.
  const enterCell = () => window.setTimeout(start, 80);
  const runAction = async (action: TableMenuAction) => {
    switch (action) {
      case "copy":
        await copyCellToClipboard(displayValue, formulaText);
        return;
      case "cut":
        await copyCellToClipboard(displayValue, formulaText);
        onUpdate(tableId, v2Updater((v2) => setCellFormula(v2, row.id, column.id, null)));
        setValue("");
        return;
      case "paste":
      case "paste-values": {
        const pasted = await readCellClipboard();
        if (!pasted) {
          toast.info("No hay nada que pegar.");
          return;
        }
        if (action === "paste" && pasted.formulaText) applyFormulaText(pasted.formulaText);
        else setValue(pasted.text);
        return;
      }
      case "insert-row-above": structure.insertRowAbove(row.id); return;
      case "insert-row-below": structure.insertRowBelow(row.id); return;
      case "delete-row": structure.deleteRow(row.id); return;
      case "insert-column-left": structure.insertColumnLeft(column.id); return;
      case "insert-column-right": structure.insertColumnRight(column.id); return;
      case "delete-column": structure.deleteColumn(column.id); return;
      case "edit-formula": enterCell(); return;
      case "fill-column": onUpdate(tableId, v2Updater((v2) => fillColumnWithFormula(v2, row.id, column.id))); return;
      case "fill-row": onUpdate(tableId, v2Updater((v2) => fillRowWithFormula(v2, row.id, column.id))); return;
      case "remove-formula":
      case "clear":
        onUpdate(tableId, v2Updater((v2) => setCellFormula(v2, row.id, column.id, null)));
        if (action === "clear") setValue("");
        return;
      default:
        return;
    }
  };
  const handlers: MenuHandlers = {
    onAction: (action) => void runAction(action),
    onFormat: (format) => onUpdate(tableId, v2Updater((v2) => setCellResultFormat(v2, row.id, column.id, format))),
    onOperation: (operation) => (operation ? onStartSelection(row.id, column.id, operation) : enterCell()),
  };

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
        hidden && "opacity-50",
      )}
      style={formulaReferenceCellStyle(referenceColor)}
      data-cell={`${cellReferenceText(index, tableId, tableV2, row.id, column.id, tableId) ?? ""}`}
      data-reference-color={referenceColor}
      data-numeric-problem={numericProblem ?? undefined}
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
                aria-invalid={numericProblem ? true : undefined}
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
                  (factor || formatted) && "tabular-nums",
                  // A numeric cell with letters: a red border, and the reason when hovered.
                  numericProblem && draftText === null && "border border-destructive ring-1 ring-destructive/40 text-destructive dark:text-red-400",
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
        {!readOnly ? (
          <ContextMenuContent className="w-64">
            <MenuGroups groups={groups} parts={CONTEXT_PARTS} handlers={handlers} />
          </ContextMenuContent>
        ) : null}
      </ContextMenu>
    </TableCell>
  );
}

/* ================================================================== */
/*  Sortable row                                                       */
/* ================================================================== */

/** What the row's number and handle ask of the table. */
type RowActionHandler = (rowId: string, action: TableMenuAction) => void;

function SortableRow({
  row,
  rowIndex,
  rowCount,
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
  onRowAction,
  onStartSelection,
  structure,
}: {
  row: { id: string; cells: Record<string, TableCellV2> };
  rowIndex: number;
  rowCount: number;
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
  onRowAction: RowActionHandler;
  onStartSelection: (rowId: string, columnId: string, operation: FormulaSelectionOperation) => void;
  structure: CellStructureActions;
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
  const hidden = isRowHidden(tableV2, row.id);
  // The same menu from the row's number and from its handle.
  const groups = tableContextMenu("editable", {
    kind: "row",
    canInsert: true,
    canMoveUp: rowIndex > 0,
    canMoveDown: rowIndex < rowCount - 1,
    hidden,
    canHide: true,
    canDelete: rowCount > 1,
  });
  const handlers: MenuHandlers = { onAction: (action) => onRowAction(row.id, action) };
  const menu = !readOnly ? (
    <ContextMenuContent className="w-56">
      <MenuGroups groups={groups} parts={CONTEXT_PARTS} handlers={handlers} />
    </ContextMenuContent>
  ) : null;

  return (
    <TableRow ref={setNodeRef} style={style} className={cn(
      rowIndex % 2 === 1 && "bg-primary/[0.03]",
      isOver && !isDragging && "bg-blue-50 dark:bg-blue-500/15",
    )} data-row-hidden={hidden ? "" : undefined}>
      <TableCell className={cn("w-6 select-none p-0 text-center font-mono text-[10px] text-muted-foreground/70", hidden && "line-through")} title={hidden ? `Fila ${rowIndex + 1}: oculta en el dictamen` : `Fila ${rowIndex + 1} en las fórmulas`}>
        <ContextMenu>
          <ContextMenuTrigger>
            <div className="flex h-7 items-center justify-center" data-row-number={rowIndex + 1}>{rowIndex + 1}</div>
          </ContextMenuTrigger>
          {menu}
        </ContextMenu>
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
          hidden={hidden || isColumnHidden(tableV2, column.id)}
          onUpdate={onUpdate}
          onFormulaCellClick={onFormulaCellClick}
          onStartSelection={onStartSelection}
          structure={structure}
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
          {menu}
        </ContextMenu>
      </TableCell>
    </TableRow>
  );
}

/**
 * "Quitar tabla" asks first with the dialog of every other deletion, naming
 * the table; the deletion is a step of the editor's history, so «Deshacer»
 * brings it back.
 */
export function requestTableRemoval(
  confirm: (request: DeleteConfirmation & { onConfirm: () => void }) => void,
  table: { id: string; title: string },
  onRemove: (tableId: string) => void,
) {
  confirm({ ...deleteConfirmation("table", table.title), onConfirm: () => onRemove(table.id) });
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
  const confirmDelete = useConfirmDelete();
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
    if (formulaMode.sources.length >= sourceLimit(formulaMode.operation)) return;
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

  /* ---- Column actions, from the header's menus and the cells' ---- */
  const columnName = useCallback((columnId: string) => tableV2.columns.find((c) => c.id === columnId)?.name.trim() || "La columna", [tableV2]);

  const ctxInsertColumn = useCallback((columnId: string, side: "left" | "right") => {
    onUpdate(table.id, v2Updater((v2) => insertTableColumnBeside(v2, columnId, side, "Nueva columna")));
  }, [table.id, onUpdate]);

  const ctxDeleteColumn = useCallback((columnId: string) => {
    // A column with something written is only deleted on purpose; formulas that read it will show #REF!.
    if (columnHasData(tableV2, columnId)) {
      if (!window.confirm(`${columnName(columnId)} tiene datos. ¿Eliminar la columna y lo que contiene?`)) return;
    }
    onUpdate(table.id, v2Updater((v2) => removeTableColumn(v2, columnId)));
  }, [table.id, tableV2, columnName, onUpdate]);

  const handleColumnAction = useCallback<ColumnActionHandler>((columnId, action, format) => {
    switch (action) {
      case "insert-column-left": ctxInsertColumn(columnId, "left"); return;
      case "insert-column-right": ctxInsertColumn(columnId, "right"); return;
      case "rename": {
        const newName = prompt("Nuevo nombre de columna:", tableV2.columns.find((c) => c.id === columnId)?.name ?? "");
        if (newName !== null && newName.trim()) onUpdate(table.id, v2Updater((v2) => renameTableColumn(v2, columnId, newName)));
        return;
      }
      case "move-left": onUpdate(table.id, v2Updater((v2) => moveTableColumnBy(v2, columnId, -1))); return;
      case "move-right": onUpdate(table.id, v2Updater((v2) => moveTableColumnBy(v2, columnId, 1))); return;
      case "column-width": {
        const current = columnWidthOf(tableV2, columnId);
        const typed = prompt("Ancho de la columna en píxeles (vacío: según su contenido):", current === undefined ? "" : String(current));
        if (typed === null) return;
        const width = typed.trim() === "" ? null : Number(typed.replace(/[^\d.]/g, ""));
        if (width !== null && !(width > 0)) {
          toast.error("Escribe un número de píxeles, por ejemplo 120.");
          return;
        }
        onUpdate(table.id, v2Updater((v2) => setColumnWidth(v2, columnId, width)));
        return;
      }
      case "column-format": onUpdate(table.id, v2Updater((v2) => setColumnFormat(v2, columnId, format ?? null))); return;
      case "sort-asc":
      case "sort-desc": onUpdate(table.id, v2Updater((v2) => sortTableRows(v2, columnId, action === "sort-asc" ? "asc" : "desc", formulaResults))); return;
      case "hide-column": onUpdate(table.id, v2Updater((v2) => setColumnHidden(v2, columnId, true))); return;
      case "show-column": onUpdate(table.id, v2Updater((v2) => setColumnHidden(v2, columnId, false))); return;
      case "delete-column": ctxDeleteColumn(columnId); return;
      default:
        return;
    }
  }, [ctxInsertColumn, ctxDeleteColumn, formulaResults, table.id, tableV2, onUpdate]);

  /* ---- Row actions, from the row's number and handle and from the cells ---- */
  const rowIndexOf = useCallback((rowId: string) => tableV2.rows.findIndex((r) => r.id === rowId), [tableV2.rows]);

  const handleRowAction = useCallback<RowActionHandler>((rowId, action) => {
    const idx = rowIndexOf(rowId);
    if (idx === -1) return;
    switch (action) {
      case "insert-row-above": onUpdate(table.id, v2Updater((v2) => insertTableRow(v2, idx))); return;
      case "insert-row-below": onUpdate(table.id, v2Updater((v2) => insertTableRow(v2, idx + 1))); return;
      case "duplicate-row": onUpdate(table.id, v2Updater((v2) => duplicateTableRow(v2, idx))); return;
      case "move-row-up": onUpdate(table.id, v2Updater((v2) => moveTableRow(v2, idx, idx - 1))); return;
      case "move-row-down": onUpdate(table.id, v2Updater((v2) => moveTableRow(v2, idx, idx + 1))); return;
      case "hide-row": onUpdate(table.id, v2Updater((v2) => setRowHidden(v2, rowId, true))); return;
      case "show-row": onUpdate(table.id, v2Updater((v2) => setRowHidden(v2, rowId, false))); return;
      case "delete-row": onUpdate(table.id, v2Updater((v2) => removeTableRow(v2, idx))); return;
      default:
        return;
    }
  }, [rowIndexOf, table.id, onUpdate]);

  const structure = useMemo<CellStructureActions>(() => ({
    insertRowAbove: (rowId) => handleRowAction(rowId, "insert-row-above"),
    insertRowBelow: (rowId) => handleRowAction(rowId, "insert-row-below"),
    deleteRow: (rowId) => handleRowAction(rowId, "delete-row"),
    insertColumnLeft: (columnId) => ctxInsertColumn(columnId, "left"),
    insertColumnRight: (columnId) => ctxInsertColumn(columnId, "right"),
    deleteColumn: ctxDeleteColumn,
  }), [handleRowAction, ctxInsertColumn, ctxDeleteColumn]);

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
  // Each column also holds its handle, its letter and its menu beside the header; a width given by hand wins.
  const columnPixels = displayColumns.map((column, index) =>
    columnWidthOf(tableV2, column.id) ?? Math.max(columnChars[index], EDITOR_MIN_COLUMN_CHARS) * EDITOR_CHAR_PX + EDITOR_HEADER_CHROME_PX);
  const totalPixels = columnPixels.reduce((total, pixels) => total + pixels, 0) || 1;
  const widthOf = new Map(displayColumns.map((column, index) => [column.id, columnPixels[index]]));
  const getColumnWidth = (columnId: string): CSSProperties => ({ width: `${((widthOf.get(columnId) ?? 0) / totalPixels) * 100}%` });
  const tableMinWidth = totalPixels + EDITOR_ROW_CHROME_PX;

  const headerProps = (columnId: string) => ({
    column: tableV2.columns.find((c) => c.id === columnId)!,
    letter: letterOf(columnId),
    tableV2,
    tableId: table.id,
    readOnly,
    formulaMode,
    capability: resolveColumnCapability(columnId, tableV2.schema),
    isOver: overColId === columnId,
    isDragging: activeColId === columnId,
    cellStyle: getColumnWidth(columnId),
    onUpdate,
    onColumnAction: handleColumnAction,
  });

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
          <Button type="button" size="icon" variant="ghost" aria-label={`Quitar ${tableV2.title}`} disabled={readOnly} title="Quitar tabla" data-remove-table={table.id} onClick={() => requestTableRemoval(confirmDelete, { id: table.id, title: tableV2.title }, onRemove)}>
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
          Clic derecho en una celda, en un encabezado o en el número de fila para más opciones. Para calcular, escribe = en una celda, por ejemplo =B2*C2 o =SUMA(A1:A5); «10%» vale 0.10.
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
                          <SortableColumnHeader key={cell.columnId} {...headerProps(cell.columnId)} rowSpan={cell.rowSpan} />
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
                            if (!tableV2.columns.some((c) => c.id === colId)) return null;
                            return <SortableColumnHeader key={colId} {...headerProps(colId)} />;
                          })}
                      </TableRow>
                    )}
                  </>
                ) : (
                  /* Free table: single-row header */
                  <TableRow>
                    <TableHead className="w-6 p-0" />
                      {displayColumns.map((column) => (
                        <SortableColumnHeader key={column.id} {...headerProps(column.id)} />
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
                      rowCount={tableV2.rows.length}
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
                      onRowAction={handleRowAction}
                      onStartSelection={startFormulaMode}
                      structure={structure}
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
