"use client";

import { Fragment, createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import type { TableContent } from "@/features/valuations/model";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import { LIVE_WARNING_CLASS } from "@/features/valuations/components/calculation/live-cell";
import {
  ensureTableV2,
  type TableV2,
  type TableCellV2,
  type TableColumn,
  type TableCellFormat,
  type FormulaResult,
  type FormulaSelectionOperation,
  type ColumnCapability,
  HOMOLOGATION_HEADER_HINTS,
  tableValueDecimals,
  tableValueFormat,
  tableValueUnit,
  type TableValueUnit,
  type TableAlign,
  type TableFormula,
  moveTableColumnBy,
  moveTableColumnBeside,
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
  fillReplacedCount,
  fillRowWithFormula,
  setTableCaptionShown,
  buildFormulaFromSelection,
  resolveColumnCapability,
  getTableHeaderLayout,
  getDisplayColumns,
  tablePrintLayout,
  updateHeaderGroupTitle,
  canGroupTableHeaders,
  headerGroupChoice,
  headerGroupEdge,
  moveColumnIntoHeaderGroup,
  moveColumnOutOfHeaderGroup,
  moveHeaderGroupBy,
  moveHeaderGroupTo,
  ungroupTableHeaders,
  type HeaderGroup,
} from "../../services/table";
import {
  fillReplaceConfirmation,
  pasteValuesText,
  tableContextMenu,
  tableFormatGroup,
  withTableFormatGroup,
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
import { TablePageFitNotice } from "./table-page-fit-notice";
import { TableFormatControl } from "./table-format-control";
import { deleteConfirmation, useClearCells, useConfirmDelete, type DeleteConfirmation } from "./delete-confirm";
import { AlignItems, CONTEXT_PARTS, DROPDOWN_PARTS, ValueFormatItems, type MenuParts } from "./table-value-format-items";
import { CellSelectionBar, selectionLabel } from "./cell-selection-bar";
import { useCellSelection, type CellSelectionApi } from "./use-cell-selection";
import { parseTabularText, pastePlan, type GridPoint } from "../../services/cell-selection";
import {
  TITLE_STYLE_KEY,
  bodyCellsOf,
  cellStyleCss,
  cellStyleKey,
  clearTableFormat,
  headerStyleKey,
  markIsOn,
  setCellsValueFormat,
  setTableCellStyles,
  tableCellStyle,
  toggleTableMark,
  writeCellTexts,
  type StyleMark,
} from "../../services/table-cell-style";
import {
  CaptureSlotTarget,
  captureFieldLike,
  captureFieldTakesFill,
  captureFieldText,
  captureMenuField,
  captureSlotKey,
  notifyCaptureWrite,
  pasteCaptureRange,
  useCaptureDeclared,
  useCaptureRowSlots,
} from "./capture-host";
import { writeCaptureCell } from "../calculation/calc-table-context-menu";
import { CALC_HEAD, EDITOR_SHADED_ROW, EDITOR_ZEBRA_ROW } from "../calculation/calculation-table-style";
import { captureColumnPlace } from "@/features/valuations/calculation/capture-display";
import {
  CALCULATED_CELL_HINT,
  CALCULATED_IN_PLACE_HINT,
  CALCULATED_TABLE_REMOVE_HINT,
  CAPTURE_CELL_HINT,
  calculatedCellReasons,
  calculatedColumnReasons,
  calculatedRowReasons,
  lockedCellReason,
  useCalculatedTable,
} from "./calculated-table-context";

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
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { editorCanScroll } from "./editor-dnd-autoscroll";
import { TableNotesEditor, homologationNoteSuggestion } from "./table-notes-editor";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  type SortingStrategy,
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
/** What the calculation writes where it cannot give a figure yet. */
const MISSING_FIGURE = "—";
const MISSING_DATA_HINT = "Falta un dato de este renglón: captúralo en las celdas en blanco y la cifra se calcula.";
/** Narrowest a column gets in the editor, in characters, before the table scrolls sideways: a short header ("Clas", "Re") stays whole. */
const EDITOR_MIN_COLUMN_CHARS = 5;
/** About what a character of the editor's cells takes, and the cell's margins: the handle, letter and menu go over the header's name. */
const EDITOR_CHAR_PX = 7.5;
const EDITOR_HEADER_CHROME_PX = 22;
/** The row number at the left and the row handle at the right. */
const EDITOR_ROW_CHROME_PX = 56;
/** The end of the rows when the capture puts its actions there (the handle and «Ver ficha» and «Eliminar»). */
const ROW_ACTIONS_PX = 330;

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

export type MenuHandlers = {
  onAction: (action: TableMenuAction) => void;
  /** The format "Unidades de valor" or "Decimales" leaves on the cell or the column. */
  onFormat?: (format: TableCellFormat | null) => void;
  /** The format the cell or the column has now: one submenu changes its unit, the other its decimals. */
  currentFormat?: TableCellFormat;
  /** On a selection of cells, each one changes its own unit or decimals; set, these win over `onFormat`. */
  onUnit?: (unit: TableValueUnit) => void;
  onDecimals?: (decimals: number | undefined) => void;
  /** "Alineación" of the cell or the selection, and the one it has. */
  onAlign?: (align: TableAlign) => void;
  currentAlign?: TableAlign;
  /** The operations of "Operaciones", and writing a formula by hand. */
  onOperation?: (operation: FormulaSelectionOperation | null) => void;
};

/** The items of the menu, as the model gives them: a disabled item keeps its reason as a tooltip. */
export function MenuGroups({ groups, parts, handlers }: { groups: TableMenuGroup[]; parts: MenuParts; handlers: MenuHandlers }) {
  const { Item, Separator, Sub, SubTrigger, SubContent } = parts;
  const renderItem = (item: TableMenuItem) => {
    if (item.submenu && !item.disabled) {
      return (
        <Sub key={`${item.action}:${item.label}`}>
          <SubTrigger>{item.label}</SubTrigger>
          <SubContent className={item.submenu === "operations" || item.submenu === "align" ? "w-52" : "max-h-80 w-52 overflow-y-auto"}>
            {item.submenu === "units" || item.submenu === "decimals" ? (
              <ValueFormatItems
                kind={item.submenu}
                parts={parts}
                current={handlers.currentFormat}
                onUnit={handlers.onUnit ?? ((unit) => handlers.onFormat?.(tableValueFormat(unit, tableValueDecimals(handlers.currentFormat))))}
                onDecimals={handlers.onDecimals ?? ((decimals) => handlers.onFormat?.(tableValueFormat(tableValueUnit(handlers.currentFormat), decimals)))}
              />
            ) : item.submenu === "align" ? (
              <AlignItems parts={parts} current={handlers.currentAlign} onAlign={(align) => handlers.onAlign?.(align)} />
            ) : (
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
        role={item.checked !== undefined ? "menuitemcheckbox" : undefined}
        aria-checked={item.checked}
        data-menu-checked={item.checked === undefined ? undefined : String(item.checked)}
      >
        {/* A choice that is on or off shows its check (video 8.14, 20:46: «no me aparece la palomita»). */}
        {item.checked !== undefined ? <Check className={cn("size-3.5", item.checked ? "opacity-100" : "opacity-0")} aria-hidden /> : null}
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
/*  Selection of cells (video 5.7)                                     */
/* ================================================================== */

/** What a selection of cells does, from its bar and from the right click on a selected cell. */
type SelectionActions = {
  marks: Record<StyleMark, boolean>;
  align?: TableAlign;
  mark: (mark: StyleMark) => void;
  alignTo: (align: TableAlign) => void;
  unit: (unit: TableValueUnit) => void;
  decimals: (decimals: number | undefined) => void;
  clearFormat: () => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  clearContents: () => void;
};

/** The selection of the table, for its cells, headers and row numbers. */
const TableSelectionContext = createContext<{
  api: CellSelectionApi;
  actions: SelectionActions;
  /** The same actions on other keys: the right click on a cell outside a selection acts on that cell alone. */
  actionsFor: (keys: string[]) => SelectionActions;
  /** The table's own items of every right click: "Formato de la tabla…" and its title in the dictamen (video 7.3). */
  tableFormat: TableFormatMenu;
} | null>(null);

/** Whether the table's title prints, and what its own items of the right click do; `run` tells whether the action was one of them. */
type TableFormatMenu = { captionShown: boolean; run: (action: TableMenuAction) => boolean };

/** A menu's groups and handlers with the table's own items at the end. */
function withTableItems(groups: TableMenuGroup[], handlers: MenuHandlers, tableFormat: TableFormatMenu | undefined): { groups: TableMenuGroup[]; handlers: MenuHandlers } {
  if (!tableFormat) return { groups, handlers };
  return {
    groups: withTableFormatGroup(groups, tableFormat),
    handlers: { ...handlers, onAction: (action) => { if (!tableFormat.run(action)) handlers.onAction(action); } },
  };
}

/** Why units and decimals wait for a cell with data: headers and the title take only the style. */
const ONLY_BODY_FORMAT_HINT = "Las unidades y los decimales son de las celdas con datos, no de los encabezados ni del título.";

/** How a selected cell shows: shaded, and the active one framed. */
const selectedCellClass = (selected: boolean, active: boolean) => cn(
  selected && "bg-primary/10 dark:bg-primary/20",
  active && "outline-2 outline-primary -outline-offset-2",
);

/* ================================================================== */
/*  Double headers: dragged and arranged as one (video 8.13, 25:00)     */
/* ================================================================== */

/** The id a double header is dragged by, among the columns' ids. */
const GROUP_DRAG_PREFIX = "header-group:";

type DropSide = "before" | "after";

/** Where the pointer is: where it was pressed plus how far it went. */
function pointerX(event: DragOverEvent | DragEndEvent): number | null {
  const pressed = event.activatorEvent as PointerEvent | MouseEvent | null;
  return pressed && typeof pressed.clientX === "number" ? pressed.clientX + event.delta.x : null;
}

/** The half of the header under the pointer: its left half drops before it, its right half after it. */
function dropSide(event: DragOverEvent | DragEndEvent): DropSide {
  const x = pointerX(event);
  const over = event.over?.rect;
  if (x === null || !over) return "before";
  return x > over.left + over.width / 2 ? "after" : "before";
}

/** Headers in two rows do not slide aside while a column is dragged: the header it lands on is outlined instead. */
const NO_SHIFT: SortingStrategy = () => null;

/** The header under the pointer, by its left and right edges; the nearest one when the pointer is past them all. */
function headerUnderPointer(
  x: number,
  containers: Parameters<CollisionDetection>[0]["droppableContainers"],
  rects: Parameters<CollisionDetection>[0]["droppableRects"],
): ReturnType<CollisionDetection> {
  let best: { container: (typeof containers)[number]; distance: number } | null = null;
  for (const container of containers) {
    const rect = rects.get(container.id);
    if (!rect) continue;
    const distance = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    if (!best || distance < best.distance) best = { container, distance };
  }
  return best ? [{ id: best.container.id, data: { droppableContainer: best.container, value: best.distance } }] : [];
}

/**
 * The title of a double header: dragged by its handle with all its columns,
 * moved a column to either side, its columns changed in «Formato de la
 * tabla» (from–to), renamed and taken off, from its right click and its menu.
 * A header the table's own structure sets (the homologation preset) is only renamed.
 */
function HeaderGroupTitle(props: {
  group: HeaderGroup;
  colSpan: number;
  tableV2: TableV2;
  readOnly: boolean;
  isDragging: boolean;
  onRename: () => void;
  onMove: (direction: -1 | 1) => void;
  onColumns: () => void;
  onUngroup: () => void;
}) {
  const { group } = props;
  const arranged = canGroupTableHeaders(props.tableV2) && !props.readOnly;
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `${GROUP_DRAG_PREFIX}${group.id}`, disabled: !arranged });
  const items = (Item: typeof ContextMenuItem | typeof DropdownMenuItem) => (
    <>
      {group.titleEditable !== false ? <Item onClick={props.onRename}>Renombrar el encabezado</Item> : null}
      {arranged ? (
        <>
          <Item onClick={() => props.onMove(-1)}>Mover el grupo a la izquierda</Item>
          <Item onClick={() => props.onMove(1)}>Mover el grupo a la derecha</Item>
          <Item onClick={props.onColumns}>Cambiar sus columnas (de–a)…</Item>
          <Item variant="destructive" onClick={props.onUngroup}>Quitar el encabezado doble</Item>
        </>
      ) : null}
    </>
  );
  return (
    <TableHead colSpan={props.colSpan} className={cn("p-0 text-center", CALC_HEAD, props.isDragging && "opacity-50")} data-header-group={group.id}>
      <ContextMenu>
        <ContextMenuTrigger>
          <div className="flex items-center justify-center gap-1 rounded px-2 py-1 text-xs font-semibold">
            {arranged ? (
              <button
                type="button"
                ref={setNodeRef}
                {...attributes}
                {...listeners}
                className="shrink-0 cursor-grab touch-none rounded-sm text-muted-foreground/70 hover:text-foreground"
                aria-label={`Arrastrar el encabezado ${group.title} con sus columnas`}
                title="Arrastra para mover el grupo con todas sus columnas"
                data-header-group-grip={group.id}
              >
                <GripVertical className="h-3 w-3" />
              </button>
            ) : null}
            <span
              className="min-w-0 cursor-pointer truncate"
              onDoubleClick={() => {
                if (group.titleEditable !== false) props.onRename();
              }}
            >
              {group.title}
            </span>
            {arranged ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button type="button" size="icon-sm" variant="ghost" className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={`Opciones del encabezado ${group.title}`} title="Opciones del encabezado doble" />}
                >
                  <ChevronDown className="h-3 w-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">{items(DropdownMenuItem)}</DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </ContextMenuTrigger>
        {!props.readOnly ? <ContextMenuContent className="w-60">{items(ContextMenuItem)}</ContextMenuContent> : null}
      </ContextMenu>
    </TableHead>
  );
}

/* ================================================================== */
/*  Sortable column header                                             */
/* ================================================================== */

/** What the header asks of the table for a column; `format` goes with "column-format". */
type ColumnActionHandler = (columnId: string, action: TableMenuAction, format?: TableCellFormat | null) => void;

function SortableColumnHeader({
  column,
  columnIndex,
  letter,
  tableV2,
  tableId,
  readOnly,
  formulaMode,
  capability,
  isOver,
  isDragging,
  dropSide: side,
  rowSpan,
  colSpan,
  cellStyle,
  onUpdate,
  onColumnAction,
}: {
  /** The side a column dragged over this header is dropped on. */
  dropSide?: DropSide;
  column: TableColumn;
  /** Place of the column as shown, in the selection of cells. */
  columnIndex: number;
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
  const calculated = useCalculatedTable();
  const columnName = column.name.trim() || `columna ${letter}`;
  const hidden = isColumnHidden(tableV2, column.id);
  const hint = HOMOLOGATION_HEADER_HINTS[column.id];
  const selection = useContext(TableSelectionContext);
  const selected = selection?.api.isSelected({ row: -1, col: columnIndex }) ?? false;
  const active = selection?.api.isActive({ row: -1, col: columnIndex }) ?? false;

  // Local draft state — typing is free, normalization happens only on commit
  const [draftName, setDraftName] = useState(column.name);
  // The draft follows the column and its name: a name the calculation changes (a factor added before it) shows at once.
  const source = `${column.id}\u0000${column.name}`;
  const [draftSource, setDraftSource] = useState(source);
  if (draftSource !== source) {
    setDraftSource(source);
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

  // Its double header: «Sacar de…» when it is under one, «Meter en…» the nearest one otherwise (video 8.13, 22:00).
  const groupChoice = headerGroupChoice(tableV2, column.id);
  // The actions of the right click and of the header's menu, the same in both.
  const { groups, handlers } = withTableItems(tableContextMenu("editable", {
    kind: "column",
    canInsertBeside: canInsertBesideColumn(tableV2, column.id),
    canRename: capability.headerEditable !== false,
    canMoveLeft: isMovable && canMoveTableColumn(tableV2, column.id, -1),
    canMoveRight: isMovable && canMoveTableColumn(tableV2, column.id, 1),
    canDelete: capability.removable !== false && canRemoveTableColumn(tableV2, column.id),
    hidden,
    canHide: true,
    headerGroup: groupChoice ? { title: groupChoice.group.title, inside: groupChoice.inside } : null,
    // A table the calculation writes: its columns are hidden, not deleted, and its rows keep the calculation's order.
    reasons: calculatedColumnReasons(calculated, column.id),
  }), {
    onAction: (action) => onColumnAction(column.id, action),
    onFormat: (format) => onColumnAction(column.id, "column-format", format),
    currentFormat: column.format,
  }, selection?.tableFormat);

  return (
    <TableHead
      ref={setNodeRef}
      style={{ ...style, ...cellStyle }}
      className="h-auto p-0 align-top"
      rowSpan={rowSpan}
      colSpan={colSpan}
      data-column-hidden={hidden ? "" : undefined}
      data-grid-row={-1}
      data-grid-col={columnIndex}
      data-cell-selected={selected ? "" : undefined}
    >
      <ContextMenu>
        <ContextMenuTrigger>
          {/* The handle, the letter and the menu over the name, not beside it: a column is as wide as what it holds (video 8.9, 06:26: «los factores podrían ser por mitad de tamaño»). */}
          <div
            className={cn(
              "grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-0.5 rounded-sm border px-1 py-0.5 transition-colors",
              // Every table shows its headers as the dictamen prints them: in the palette of the valuation (video 8.12, 25:50).
              CALC_HEAD, "border-transparent [&_textarea]:text-inherit",
              isOver && !isDragging && "border-blue-400 bg-blue-50 dark:bg-blue-500/15",
              // Where it lands: a thick rule on the side it goes to.
              isOver && !isDragging && side === "before" && "border-l-4 border-l-primary",
              isOver && !isDragging && side === "after" && "border-r-4 border-r-primary",
              formulaMode && "opacity-60",
              hidden && "opacity-50",
              selected && "border-primary/50 bg-primary/15 dark:bg-primary/25",
              active && "outline-2 outline-primary -outline-offset-2",
            )}
            title={hidden ? `${hint ?? columnName}: oculta en el dictamen` : hint}
          >
            {!readOnly && isMovable && (
              <div
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                className="col-start-1 row-start-1 shrink-0 cursor-grab touch-none"
                data-column-grip=""
                aria-label={`Arrastrar la columna ${columnName}`}
                title="Arrastra para mover la columna"
              >
                <GripVertical className="h-3 w-3 text-muted-foreground/70" />
              </div>
            )}
            {/* The letter selects the whole column, as a spreadsheet's (Shift and Ctrl/⌘ join it to the selection). */}
            <span
              className={cn("col-start-2 row-start-1 shrink-0 cursor-pointer select-none rounded-sm px-0.5 font-mono text-[10px] text-muted-foreground/70 hover:bg-primary/15 hover:text-foreground", selected && "text-primary")}
              title={`Columna ${letter} en las fórmulas. Clic: seleccionar la columna`}
              data-select-column={columnIndex}
              onMouseDown={(event) => selection?.api.onColumnPointer(columnIndex, event)}
            >
              {letter}
            </span>
            {/* A long header takes a second line instead of widening the column; Alt+Enter breaks it where wanted. */}
            <textarea
              aria-label={`Encabezado de la columna ${columnName}`}
              className="col-span-4 row-start-2 w-full field-sizing-content min-h-5 min-w-0 resize-none overflow-hidden border-0 bg-transparent px-0.5 py-0.5 text-xs leading-tight font-semibold wrap-break-word outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed"
              rows={1}
              disabled={readOnly || capability.headerEditable === false}
              value={draftName}
              data-column-header={column.id}
              // Bold, italic, underline and alignment chosen on a selection, as the dictamen prints them.
              style={cellStyleCss(tableCellStyle(tableV2, headerStyleKey(column.id)))}
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
                      className="col-start-4 row-start-1 h-4 w-4 shrink-0 justify-self-end text-muted-foreground"
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
/** Whether the field of the capture in that cell holds a formula now; false while the page is not in the browser. */
function capturedFieldHasFormula(address: { table: string; row: string; column: string }) {
  if (typeof document === "undefined") return false;
  const field = document.querySelector<HTMLElement>(`[data-capture-slot="${window.CSS.escape(captureSlotKey(address))}"] [data-formula]`);
  return Boolean(field?.dataset.formula?.trim().startsWith("="));
}

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
  const numericProblemOfCell = numericCellProblem(tableV2, column.id, cell);
  const [focused, setFocused] = useState(false);
  // In a selection of several cells, the right click acts on all of them (video 5.7).
  const selection = useContext(TableSelectionContext);
  const point: GridPoint = { row: rowIndex, col: columnIndex };
  const selected = selection?.api.isSelected(point) ?? false;
  const several = selected && (selection?.api.count ?? 0) > 1;
  const styleKey = cellStyleKey(row.id, column.id);
  const cellStyle = tableCellStyle(tableV2, styleKey);
  const styleActions = selection ? (several ? selection.actions : selection.actionsFor([styleKey])) : null;
  // A figure of a table the calculation writes: shown, copied and named in formulas, never typed.
  const calculatedTable = useCalculatedTable();
  // A datum the calculation captures: its panel's own field sits in the cell (capture-host.tsx), and the menu writes in it.
  // Named by the column's id or, in a table saved with ids of its own (income), by its place among the calculation's columns.
  const addressById = { table: tableId, row: row.id, column: column.id };
  const addressByPlace = { table: tableId, row: row.id, column: captureColumnPlace(calculatedTable?.columnPlace?.(column.id) ?? -1) };
  const capturedById = useCaptureDeclared(addressById);
  const capturedByPlace = useCaptureDeclared(addressByPlace);
  const captured = capturedById || capturedByPlace;
  const captureAddress = capturedById ? addressById : addressByPlace;
  const locked = !captured && Boolean(calculatedTable?.row(row.id) && calculatedTable.column(column.id));
  // A figure the calculation cannot give yet («—») in a table captured in place: marked from the start, in every row (video 8.7, 5:39).
  const missingData = locked && Boolean(calculatedTable?.inPlace) && cell?.kind === "value" && cell.value.trim() === MISSING_FIGURE;

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
  // The field of a capture is its panel's (a portal): React hands its clicks to the panel, not to this cell. While a
  // formula is being written, a click on it writes this cell's reference, as on any cell (video 8.7: «se abre el editor»).
  const referenceHandler = useRef(reference.onMouseDownCapture);
  useLayoutEffect(() => {
    referenceHandler.current = reference.onMouseDownCapture;
  });
  const captureCellRef = useCallback((element: HTMLTableCellElement | null) => {
    if (!element) return undefined;
    const onDown = (event: MouseEvent) => {
      const handler = referenceHandler.current;
      const slot = element.querySelector("[data-capture-slot]");
      if (!handler || !slot || !(event.target instanceof Node) || !slot.contains(event.target)) return;
      handler(event as unknown as Parameters<NonNullable<typeof handler>>[0]);
    };
    element.addEventListener("mousedown", onDown, true);
    return () => element.removeEventListener("mousedown", onDown, true);
  }, []);
  // A formula without a number (it divides by zero, reads an empty or deleted cell): an amber warning; the dictamen prints «—».
  const noNumber = Boolean(result && !result.ok);
  // The «—» of the calculation is not letters typed in a figure: it is a datum still missing in the row.
  const numericProblem = missingData ? null : numericProblemOfCell;
  const title = missingData ? MISSING_DATA_HINT
    : result && !result.ok
    ? `${formulaErrorMessage(result.error)} En el dictamen se imprime «—». ${formulaText ?? ""}`
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
  const confirmDelete = useConfirmDelete();
  const cellGroups = tableContextMenu("editable", {
    kind: "cell",
    editable: !locked,
    // In a cell of the capture the formula is its field's: read from it, so the menu says «fórmula» or «valor» as it is.
    hasFormula: captured ? capturedFieldHasFormula(captureAddress) : isFormula,
    hasValue: captured || (cell?.kind === "value" && cell.value.trim() !== ""),
    canPaste: true,
    canInsertRow: true,
    canInsertColumn: canInsertBesideColumn(tableV2, column.id),
    canDeleteColumn: canRemoveTableColumn(tableV2, column.id),
    canDeleteRow: tableV2.rows.length > 1,
    selected: several ? selection?.api.count : undefined,
    reasons: calculatedCellReasons(calculatedTable, row.id, column.id),
  });
  // The menu gives the focus back when it closes; the cell is entered after that.
  const enterCell = () => window.setTimeout(start, 80);
  /**
   * The same menu on a cell the calculation captures: copying, pasting,
   * clearing and filling write in the field of the capture, as typing does,
   * so its panel saves and undoes them.
   */
  const runCaptureAction = async (action: TableMenuAction) => {
    // Found when the menu acts, by the place the capture declared: the cell and its field are the panel's.
    const ownCell = document.querySelector(`[data-capture-slot="${window.CSS.escape(captureSlotKey(captureAddress))}"]`)?.closest("td") ?? null;
    const field = captureMenuField(ownCell);
    if (!field) return;
    const text = captureFieldText(field);
    const shown = field instanceof HTMLSelectElement ? field.selectedOptions[0]?.textContent?.trim() ?? "" : field.value;
    const fields = (along: "row" | "column") => {
      const cells = along === "row"
        ? Array.from(ownCell?.parentElement?.children ?? [])
        : Array.from(ownCell?.closest("tbody")?.querySelectorAll(`:scope > tr > td[data-grid-col="${columnIndex}"]`) ?? []);
      return cells.filter((cell) => cell !== ownCell).flatMap((cell) => {
        const target = captureFieldLike(cell, field);
        return target && captureFieldTakesFill(target) ? [target] : [];
      });
    };
    const writeAll = (targets: Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const written = targets.map((target) => ({ field: target, previous: captureFieldText(target) }));
      targets.forEach((target) => writeCaptureCell(target, text));
      notifyCaptureWrite(written, "llenadas");
    };
    switch (action) {
      case "copy":
      case "cut":
        await copyCellToClipboard(shown, text.trim().startsWith("=") ? text : null);
        if (action === "cut") writeCaptureCell(field, "");
        return;
      case "paste":
      case "paste-values": {
        const pasted = await readCellClipboard();
        if (!pasted) {
          toast.info("No hay nada que pegar.");
          return;
        }
        // Several cells copied in a spreadsheet: from this cell to the right and down.
        if (!(field instanceof HTMLSelectElement) && !pasted.formulaText && /[\t\n]/.test(pasted.text.replace(/[\r\n]+$/, ""))) {
          notifyCaptureWrite(pasteCaptureRange(field, parseTabularText(pasted.text)), "pegadas");
          return;
        }
        if (action === "paste" && pasted.formulaText) writeCaptureCell(field, pasted.formulaText);
        else writeCaptureCell(field, action === "paste-values" ? pasteValuesText(pasted.formulaText ?? pasted.text) ?? pasted.text : pasted.text);
        return;
      }
      case "remove-formula":
      case "clear":
        writeCaptureCell(field, "");
        return;
      case "edit-formula":
        window.setTimeout(() => field.focus(), 80);
        return;
      case "fill-column-empty":
      case "fill-row-empty":
        writeAll(fields(action === "fill-row-empty" ? "row" : "column").filter((target) => !captureFieldText(target).trim()));
        return;
      case "fill-column":
      case "fill-row": {
        const along = action === "fill-row" ? "row" : "column";
        const targets = fields(along);
        const replaced = targets.filter((target) => captureFieldText(target).trim() && captureFieldText(target) !== text).length;
        if (replaced) confirmDelete({ ...fillReplaceConfirmation(replaced, along, text.trim().startsWith("=") ? "fórmula" : "valor"), onConfirm: () => writeAll(targets) });
        else writeAll(targets);
        return;
      }
      default:
        return;
    }
  };
  const runAction = async (action: TableMenuAction) => {
    // Bold, italic, underline and "Limpiar formato": on the cell, or on all the cells selected with it.
    if (styleActions && (action === "bold" || action === "italic" || action === "underline")) {
      styleActions.mark(action);
      return;
    }
    if (styleActions && action === "clear-format") {
      styleActions.clearFormat();
      return;
    }
    if (captured) {
      await runCaptureAction(action);
      return;
    }
    // Copying, cutting, pasting and clearing a selection of several cells: all of them, as Excel.
    if (several && selection) {
      if (action === "copy") return selection.actions.copy();
      if (action === "cut") return selection.actions.cut();
      if (action === "paste" || action === "paste-values") return selection.actions.paste();
      if (action === "clear") return selection.actions.clearContents();
    }
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
        // A formula pasted as a value is the number it gives, not its text (video 7.4, 06:54).
        else setValue(action === "paste-values" ? pasteValuesText(pasted.text) ?? pasted.text : pasted.text);
        return;
      }
      case "insert-row-above": structure.insertRowAbove(row.id); return;
      case "insert-row-below": structure.insertRowBelow(row.id); return;
      case "delete-row": structure.deleteRow(row.id); return;
      case "insert-column-left": structure.insertColumnLeft(column.id); return;
      case "insert-column-right": structure.insertColumnRight(column.id); return;
      case "delete-column": structure.deleteColumn(column.id); return;
      case "edit-formula": enterCell(); return;
      case "fill-column-empty": onUpdate(tableId, v2Updater((v2) => fillColumnWithFormula(v2, row.id, column.id))); return;
      case "fill-row-empty": onUpdate(tableId, v2Updater((v2) => fillRowWithFormula(v2, row.id, column.id))); return;
      case "fill-column":
      case "fill-row": {
        // As Excel's fill: every cell of the column or row, what they hold replaced, asked first (video 7.4, 10:26); Ctrl+Z undoes it.
        const along = action === "fill-row" ? "row" : "column";
        const fill = along === "row" ? fillRowWithFormula : fillColumnWithFormula;
        const write = () => onUpdate(tableId, v2Updater((v2) => fill(v2, row.id, column.id, { overwrite: true })));
        const replaced = fillReplacedCount(tableV2, row.id, column.id, along);
        if (replaced) confirmDelete({ ...fillReplaceConfirmation(replaced, along, isFormula ? "fórmula" : "valor"), onConfirm: write });
        else write();
        return;
      }
      case "remove-formula":
      case "clear":
        onUpdate(tableId, v2Updater((v2) => setCellFormula(v2, row.id, column.id, null)));
        if (action === "clear") setValue("");
        return;
      default:
        return;
    }
  };
  const { groups, handlers } = withTableItems(cellGroups, {
    onAction: (action) => void runAction(action),
    onFormat: (format) => onUpdate(tableId, v2Updater((v2) => setCellResultFormat(v2, row.id, column.id, format))),
    // A cell without a format of its own starts from its column's.
    currentFormat: cell?.format ?? column.format,
    ...(several && selection ? { onUnit: selection.actions.unit, onDecimals: selection.actions.decimals } : {}),
    onAlign: (align) => styleActions?.alignTo(align),
    currentAlign: cellStyle.align,
    onOperation: (operation) => (operation ? onStartSelection(row.id, column.id, operation) : enterCell()),
  }, selection?.tableFormat);

  return (
    <TableCell
      className={cn(
        "p-0.5",
        isFormula && !captured && "bg-blue-50/80 dark:bg-blue-500/15",
        isFormulaTarget && "ring-2 ring-blue-400 ring-inset",
        isFormulaSource && "bg-blue-100/80 dark:bg-blue-500/25 ring-1 ring-blue-300 ring-inset",
        formulaMode && !isFormulaTarget && !isFormulaSource && "opacity-60",
        writingFormula && "ring-2 ring-blue-500 ring-inset",
        reference.active && "cursor-cell hover:ring-2 hover:ring-blue-300 hover:ring-inset [&_input]:cursor-cell",
        hidden && "opacity-50",
        selectedCellClass(selected && !formulaMode, Boolean(selection?.api.isActive(point))),
      )}
      style={formulaReferenceCellStyle(referenceColor)}
      data-grid-row={rowIndex}
      data-grid-col={columnIndex}
      data-cell-selected={selected ? "" : undefined}
      data-cell={`${cellReferenceText(index, tableId, tableV2, row.id, column.id, tableId) ?? ""}`}
      data-reference-color={referenceColor}
      data-numeric-problem={numericProblem ?? undefined}
      onClick={() => formulaMode ? onFormulaCellClick(row.id, column.id) : undefined}
      onMouseDownCapture={reference.onMouseDownCapture}
      ref={captured ? captureCellRef : undefined}
    >
      <ContextMenu>
        <ContextMenuTrigger>
          {captured ? (
            // The field of the calculation's capture, in the cell of its datum: typed here, it is the calculation's.
            <CaptureSlotTarget address={captureAddress} className="flex min-h-7 min-w-0 items-center [&_input]:min-w-12" />
          ) : (
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
                readOnly={Boolean(formulaMode) || locked}
                aria-readonly={locked || undefined}
                value={shownValue}
                data-table-cell={tableId}
                data-row-id={row.id}
                data-column-id={column.id}
                data-row={rowIndex}
                data-col={columnIndex}
                data-calculated={locked ? "" : undefined}
                aria-invalid={numericProblem || noNumber || missingData ? true : undefined}
                data-missing-data={missingData ? "" : undefined}
                data-formula-warning={noNumber ? title : undefined}
                onChange={(event) => {
                  if (locked) return;
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
                onFocus={formulaMode || locked ? () => setFocused(true) : (event) => {
                  setFocused(true);
                  onFocus(event);
                }}
                onBlur={(event) => {
                  setFocused(false);
                  closeSuggestions();
                  if (!locked) onBlur(event);
                }}
                onKeyDown={locked ? undefined : handleKeyDown}
                // Trying to write in a gray cell says why it is not written here (video 8.6, 0:10).
                onDoubleClick={locked ? () => toast.info(missingData ? MISSING_DATA_HINT : lockedCellReason(calculatedTable), { id: "locked-cell", duration: 10_000 }) : undefined}
                onMouseDown={locked ? undefined : onMouseDown}
                onScroll={(event) => {
                  // The colored text follows the field when a long formula scrolls in it.
                  if (overlayRef.current) overlayRef.current.style.transform = `translateX(${-event.currentTarget.scrollLeft}px)`;
                }}
                className={cn(
                  "h-7 w-full min-w-0 border-0 bg-transparent px-1 text-xs box-border",
                  (isFormula || writingFormula) && "font-mono text-blue-600 dark:text-blue-400",
                  writingFormula && references.length > 0 && "text-transparent caret-blue-600 dark:text-transparent dark:caret-blue-400",
                  unreadFormula && draftText === null && "text-destructive dark:text-red-400",
                  noNumber && draftText === null && cn(LIVE_WARNING_CLASS, "rounded-sm"),
                  (factor || formatted) && "tabular-nums",
                  // A numeric cell with letters: a red border, and the reason when hovered.
                  numericProblem && draftText === null && "border border-destructive ring-1 ring-destructive/40 text-destructive dark:text-red-400",
                  locked && "cursor-default rounded-sm bg-muted/70 tabular-nums",
                  missingData && "ring-1 ring-destructive/60 text-destructive dark:text-red-400",
                )}
                title={locked ? (missingData ? MISSING_DATA_HINT : calculatedTable?.capture ? CAPTURE_CELL_HINT : calculatedTable?.inPlace ? CALCULATED_IN_PLACE_HINT : CALCULATED_CELL_HINT) : title}
                // Bold, italic, underline and alignment chosen on a selection, as the dictamen prints them.
                style={cellStyleCss(cellStyle)}
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
          )}
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
  const calculated = useCalculatedTable();
  // A row the calculation writes keeps its order (the comparables' order, set where they are captured): no handle
  // that does not move it (video 8.13, 25:45: «¿para qué me ponen esas opciones si no funcionan aquí?»).
  const rowFixed = Boolean(calculated?.row(row.id) && !calculated.capture);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: row.id, disabled: readOnly || !!formulaMode || rowFixed });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  };
  const hidden = isRowHidden(tableV2, row.id);
  const rowCaptured = useCaptureDeclared({ table: tableId, row: row.id });
  // The same menu from the row's number and from its handle.
  const selection = useContext(TableSelectionContext);
  const { groups, handlers } = withTableItems(tableContextMenu("editable", {
    kind: "row",
    canInsert: true,
    canMoveUp: rowIndex > 0,
    canMoveDown: rowIndex < rowCount - 1,
    hidden,
    canHide: true,
    canDelete: rowCount > 1,
    // A row the calculation writes keeps its place: it is hidden, not deleted, duplicated or moved.
    reasons: calculatedRowReasons(calculated, row.id),
  }), { onAction: (action) => onRowAction(row.id, action) }, selection?.tableFormat);
  const menu = !readOnly ? (
    <ContextMenuContent className="w-56">
      <MenuGroups groups={groups} parts={CONTEXT_PARTS} handlers={handlers} />
    </ContextMenuContent>
  ) : null;

  return (
    <TableRow ref={setNodeRef} style={style} className={cn(
      // The rows the dictamen shades (the «calificación» of the rate table) are shaded here too; otherwise they alternate.
      // In the valuation's palette, as the dictamen: the first row shaded, then every other one (video 8.12, 26:35).
      tableV2.schema?.shadedRows ? tableV2.schema.shadedRows.includes(row.id) && EDITOR_SHADED_ROW : rowIndex % 2 === 0 && EDITOR_ZEBRA_ROW,
      isOver && !isDragging && "bg-blue-50 dark:bg-blue-500/15",
    )} data-row-hidden={hidden ? "" : undefined}>
      <TableCell className={cn("w-6 select-none p-0 text-center font-mono text-[10px] text-muted-foreground/70", hidden && "line-through")} title={hidden ? `Fila ${rowIndex + 1}: oculta en el dictamen` : `Fila ${rowIndex + 1} en las fórmulas`}>
        <ContextMenu>
          <ContextMenuTrigger>
            {/* The number selects the whole row, as a spreadsheet's (Shift and Ctrl/⌘ join it to the selection). */}
            <div
              className="flex h-7 cursor-pointer items-center justify-center rounded-sm hover:bg-primary/15 hover:text-foreground"
              data-row-number={rowIndex + 1}
              title={`Fila ${rowIndex + 1}. Clic: seleccionar la fila`}
              onMouseDown={(event) => selection?.api.onRowPointer(rowIndex, event)}
            >
              {rowIndex + 1}
            </div>
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
        <div className="flex items-center">
          {!rowFixed ? (
            <ContextMenu>
              <ContextMenuTrigger>
                <div
                  className="flex items-center justify-center"
                  ref={setActivatorNodeRef}
                  {...attributes}
                  {...listeners}
                  data-row-grip=""
                  title="Arrastra para mover la fila"
                >
                  <GripVertical className="h-3.5 w-3.5 cursor-grab text-muted-foreground/70" />
                </div>
              </ContextMenuTrigger>
              {menu}
            </ContextMenu>
          ) : null}
          {/* What the calculation's capture does with the row (taking it out of the calculation, its links). */}
          {rowCaptured ? <CaptureSlotTarget address={{ table: tableId, row: row.id }} className="flex items-center" /> : null}
        </div>
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
  actions,
}: {
  table: TableContent;
  onAddColumn: (tableId: string) => void;
  onAddRow: (tableId: string) => void;
  onRemove: (tableId: string) => void;
  onUpdate: (tableId: string, updater: (table: TableContent) => TableContent) => void;
  readOnly: boolean;
  /** What is printed with the table and edited with it, under the grid. */
  footer?: ReactNode;
  /** Beside the title, before the table's buttons: the link of a capture table with the cost approach. */
  actions?: ReactNode;
}) {
  const tableV2 = useMemo(() => ensureTableV2(table), [table]);
  const formulaResults = useMemo(() => evaluateTableFormulas(tableV2), [tableV2]);
  const confirmDelete = useConfirmDelete();
  const calculated = useCalculatedTable();
  const [formulaMode, setFormulaMode] = useState<FormulaSelectionState | null>(null);

  /* ---- Column and row DnD state ---- */
  const [activeColId, setActiveColId] = useState<string | null>(null);
  const [overColId, setOverColId] = useState<string | null>(null);
  // The side of the header under the pointer a column is dropped on: before it or after it.
  const [overSide, setOverSide] = useState<DropSide>("before");
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [overRowId, setOverRowId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Columns and rows are dragged in one context: a column (or a double header with its columns) is dropped on columns, a row on rows.
  const columnIdSet = useMemo(() => new Set(tableV2.columns.map((column) => column.id)), [tableV2.columns]);
  const isColumnDrag = useCallback((id: string) => columnIdSet.has(id) || id.startsWith(GROUP_DRAG_PREFIX), [columnIdSet]);
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const draggingColumn = isColumnDrag(String(args.active.id));
    const droppableContainers = args.droppableContainers.filter((container) => columnIdSet.has(String(container.id)) === draggingColumn);
    // A column lands on the header under the pointer across the table, in either row of a double header (video 8.13,
    // 22:29: «lo suelto y no se mueve; se metió aquí abajo»): the nearest center mixed the two rows.
    if (draggingColumn && args.pointerCoordinates) return headerUnderPointer(args.pointerCoordinates.x, droppableContainers, args.droppableRects);
    return closestCenter({ ...args, droppableContainers });
  }, [columnIdSet, isColumnDrag]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    if (isColumnDrag(id)) setActiveColId(id);
    else setActiveRowId(id);
  }, [isColumnDrag]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    if (isColumnDrag(String(event.active.id))) {
      setOverColId(overId);
      setOverSide(dropSide(event));
    } else setOverRowId(overId);
  }, [isColumnDrag]);

  const handleDragCancel = useCallback(() => {
    setActiveColId(null);
    setOverColId(null);
    setActiveRowId(null);
    setOverRowId(null);
  }, []);

  /**
   * A column dropped at the edge of a double header may be meant in it or out
   * of it: it says where it stayed and offers the other, in place (video
   * 8.13, 24:24: «si yo saco una, me lo debe detectar»).
   */
  const offerHeaderGroupEdge = useCallback((moved: TableV2, columnId: string) => {
    const edge = headerGroupEdge(moved, columnId);
    if (!edge) return;
    const name = moved.columns.find((column) => column.id === columnId)?.name.trim() || "La columna";
    toast.info(edge.inside ? `«${name}» quedó dentro de «${edge.group.title}».` : `«${name}» quedó fuera de «${edge.group.title}», a su lado.`, {
      id: `header-group-edge-${table.id}`,
      description: edge.inside ? "Si la querías fuera del encabezado doble, sácala sin moverla de lugar." : "Si la querías bajo el encabezado doble, métela sin moverla de lugar.",
      action: {
        label: edge.inside ? "Sacarla" : "Meterla",
        onClick: () => onUpdate(table.id, v2Updater((v2) => (edge.inside ? moveColumnOutOfHeaderGroup(v2, columnId) : moveColumnIntoHeaderGroup(v2, columnId, edge.group.id)))),
      },
    });
  }, [table.id, onUpdate]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    handleDragCancel();
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId.startsWith(GROUP_DRAG_PREFIX)) {
      // A double header moves with all its columns (video 8.13, 25:00).
      const groupId = activeId.slice(GROUP_DRAG_PREFIX.length);
      if (columnIdSet.has(overId)) onUpdate(table.id, v2Updater((v2) => moveHeaderGroupTo(v2, groupId, overId)));
      return;
    }
    if (columnIdSet.has(activeId)) {
      // The column goes before or after the one it is dropped on, by the half under the pointer, and takes its zone.
      const side = dropSide(event);
      onUpdate(table.id, v2Updater((v2) => moveTableColumnBeside(v2, activeId, overId, side)));
      // Left at the edge of a double header, in or out of it: the other choice is offered, without dragging again.
      offerHeaderGroupEdge(moveTableColumnBeside(tableV2, activeId, overId, side), activeId);
      return;
    }
    const fromIndex = tableV2.rows.findIndex((r) => r.id === activeId);
    const toIndex = tableV2.rows.findIndex((r) => r.id === overId);
    if (fromIndex < 0 || toIndex < 0) return;
    onUpdate(table.id, v2Updater((v2) => moveTableRow(v2, fromIndex, toIndex)));
  }, [columnIdSet, handleDragCancel, table.id, tableV2, onUpdate, offerHeaderGroupEdge]);

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
    // A column with something written is only deleted on purpose; formulas that read it will show #REF!. One the calculation
    // writes is only taken out (video 8.9): it comes back with «Volver a mostrar» under the table or Ctrl+Z.
    if (columnHasData(tableV2, columnId) && !calculated?.column(columnId)) {
      if (!window.confirm(`${columnName(columnId)} tiene datos. ¿Eliminar la columna y lo que contiene?`)) return;
    }
    onUpdate(table.id, v2Updater((v2) => removeTableColumn(v2, columnId)));
  }, [table.id, tableV2, columnName, onUpdate, calculated]);

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
      case "group-leave": onUpdate(table.id, v2Updater((v2) => moveColumnOutOfHeaderGroup(v2, columnId))); return;
      case "group-join": {
        const choice = headerGroupChoice(tableV2, columnId);
        if (choice && !choice.inside) onUpdate(table.id, v2Updater((v2) => moveColumnIntoHeaderGroup(v2, columnId, choice.group.id)));
        return;
      }
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
      case "delete-row": {
        const remove = () => onUpdate(table.id, v2Updater((v2) => removeTableRow(v2, v2.rows.findIndex((r) => r.id === rowId))));
        // A row of a capture table that is a construction type takes it out of the cost approach: it asks first.
        const confirmation = calculated?.capture?.rowRemoval(rowId);
        if (confirmation) confirmDelete({ ...confirmation, onConfirm: remove });
        else remove();
        return;
      }
      default:
        return;
    }
  }, [rowIndexOf, table.id, onUpdate, calculated, confirmDelete]);

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
  // A capture that puts actions at the end of each row («Ver ficha», «Eliminar») gets their room there.
  const rowActions = useCaptureRowSlots(table.id);
  const tableMinWidth = totalPixels + EDITOR_ROW_CHROME_PX + (rowActions ? ROW_ACTIONS_PX - 32 : 0);

  const headerProps = (columnId: string) => ({
    column: tableV2.columns.find((c) => c.id === columnId)!,
    columnIndex: displayColumns.findIndex((c) => c.id === columnId),
    letter: letterOf(columnId),
    tableV2,
    tableId: table.id,
    readOnly,
    formulaMode,
    capability: resolveColumnCapability(columnId, tableV2.schema),
    isOver: overColId === columnId,
    dropSide: overColId === columnId ? overSide : undefined,
    isDragging: activeColId === columnId,
    cellStyle: getColumnWidth(columnId),
    onUpdate,
    onColumnAction: handleColumnAction,
  });

  // "Espacio antes/después" of "Formato de la tabla" shows here too, as the dictamen prints it.
  const print = tablePrintLayout(tableV2);

  /* ---- Selection of cells, headers and the title (video 5.7) ---- */
  const sectionRef = useRef<HTMLElement | null>(null);
  const { index: formulaIndex, session: formulaSession } = useFormulaEditing();
  const clearCells = useClearCells();
  const shape = { rows: tableV2.rows.length, cols: displayColumns.length, header: true };
  const cellAt = (point: GridPoint) => ({ rowId: tableV2.rows[point.row]?.id ?? "", columnId: displayColumns[point.col]?.id ?? "" });
  const keyOf = (point: GridPoint) => (point.row < 0 ? headerStyleKey(displayColumns[point.col]?.id ?? "") : cellStyleKey(cellAt(point).rowId, cellAt(point).columnId));
  const compile = (text: string): TableFormula | null => {
    const compiled = compileFormula(text, { index: formulaIndex, table: tableV2 });
    return compiled.ok ? compiled.formula : null;
  };
  const pasteCells = (plan: Array<{ point: GridPoint; text: string }>) => {
    const writes = plan.filter((item) => item.point.row >= 0 && displayColumns[item.point.col]).map((item) => ({ ...cellAt(item.point), text: item.text }));
    if (!writes.length) return;
    // One change of the table: one «Deshacer» takes the whole paste back.
    onUpdate(table.id, v2Updater((v2) => writeCellTexts(v2, writes, compile)));
    toast.success(writes.length === 1 ? "Se pegó 1 celda" : `Se pegaron ${writes.length} celdas`);
  };
  const hasContent = (point: GridPoint) => {
    const cell = tableV2.rows[point.row]?.cells[displayColumns[point.col]?.id ?? ""];
    return cell?.kind === "formula" || (cell?.kind === "value" && cell.value !== "");
  };
  // A figure the calculation writes (or that comes linked from it) is not cleared here: it would come back at once (video 8.6, 0:50).
  const lockedPoint = (point: GridPoint) => {
    const { rowId, columnId } = cellAt(point);
    return Boolean(calculated?.row(rowId) && calculated.column(columnId));
  };
  const clearPoints = (points: GridPoint[]) => {
    const withContent = points.filter((point) => point.row >= 0 && hasContent(point));
    const filled = withContent.filter((point) => !lockedPoint(point));
    if (withContent.length > filled.length) {
      toast.info(filled.length ? "Las cifras en gris no se borraron." : "Esta cifra no se borra aquí.", { description: lockedCellReason(calculated), duration: 10_000 });
    }
    if (!filled.length) return;
    const cells = filled.map(cellAt);
    clearCells({ count: filled.length, onClear: () => onUpdate(table.id, v2Updater((v2) => writeCellTexts(v2, cells.map((cell) => ({ ...cell, text: "" }))))) });
  };
  const selection = useCellSelection({
    containerRef: sectionRef,
    shape,
    paused: readOnly || Boolean(formulaMode) || formulaSession !== null,
    withTitle: true,
    readCell: (point) => {
      if (!point) return tableV2.title;
      if (point.row < 0) return displayColumns[point.col]?.name ?? "";
      const { rowId, columnId } = cellAt(point);
      return getCellDisplayValue(tableV2, rowId, columnId, formulaResults, presentation);
    },
    onPaste: pasteCells,
    onClear: clearPoints,
  });
  const selectedKeys = [...(selection.titleSelected ? [TITLE_STYLE_KEY] : []), ...selection.points.map(keyOf)];
  // A header prints bold; a column the schema prints bold, too: N takes it off on them.
  const boldByDefault = (key: string) => key.startsWith("header:") || Boolean(bodyCellsOf(tableV2, [key])[0] && tableV2.schema?.columnPresentation?.[bodyCellsOf(tableV2, [key])[0].columnId]?.bold);
  const actionsFor = (keys: string[]): SelectionActions => {
    const cells = bodyCellsOf(tableV2, keys);
    const update = (change: (v2: TableV2) => TableV2) => {
      if (keys.length) onUpdate(table.id, v2Updater(change));
    };
    const aligns = new Set(keys.map((key) => tableCellStyle(tableV2, key).align));
    return {
      marks: {
        bold: markIsOn(tableV2, keys, "bold", boldByDefault),
        italic: markIsOn(tableV2, keys, "italic"),
        underline: markIsOn(tableV2, keys, "underline"),
      },
      align: aligns.size === 1 ? [...aligns][0] : undefined,
      mark: (mark) => update((v2) => toggleTableMark(v2, keys, mark, mark === "bold" ? boldByDefault : undefined)),
      alignTo: (align) => update((v2) => setTableCellStyles(v2, keys, { align })),
      unit: (unit) => {
        if (cells.length) update((v2) => setCellsValueFormat(v2, cells, { unit }));
      },
      decimals: (decimals) => {
        if (cells.length) update((v2) => setCellsValueFormat(v2, cells, { decimals }));
      },
      clearFormat: () => update((v2) => clearTableFormat(v2, keys)),
      copy: () => void selection.copy(),
      cut: () => {
        void selection.copy();
        clearPoints(selection.points);
      },
      paste: () => {
        void navigator.clipboard.readText().then(
          (text) => pasteCells(pastePlan(selection.selection, shape, parseTabularText(text))),
          () => toast.info("El navegador no dejó leer lo copiado: pega con Ctrl+V (⌘V en Mac)."),
        );
      },
      clearContents: () => clearPoints(selection.points),
    };
  };
  const selectionActions = actionsFor(selectedKeys);
  const selectedBodyCells = bodyCellsOf(tableV2, selectedKeys);
  const firstSelectedCell = selectedBodyCells[0] ? tableV2.rows.find((row) => row.id === selectedBodyCells[0].rowId)?.cells[selectedBodyCells[0].columnId] : undefined;
  const firstSelectedColumn = selectedBodyCells[0] ? tableV2.columns.find((column) => column.id === selectedBodyCells[0].columnId) : undefined;
  // "Formato de la tabla…" of a right click opens the same panel as the button, once the menu has closed.
  const [formatOpen, setFormatOpen] = useState(false);
  const tableFormat: TableFormatMenu = {
    captionShown: tableV2.schema?.hideCaption !== true,
    run: (action) => {
      if (action === "table-format") {
        window.setTimeout(() => setFormatOpen(true), 80);
        return true;
      }
      if (action === "caption-show" || action === "caption-hide") {
        onUpdate(table.id, v2Updater((v2) => setTableCaptionShown(v2, action === "caption-show")));
        toast.info(action === "caption-show" ? "El título de la tabla se imprime en el dictamen." : "El título de la tabla ya no se imprime; sigue nombrándola en el editor.");
        return true;
      }
      return false;
    },
  };
  const selectionContext = { api: selection, actions: selectionActions, actionsFor, tableFormat };
  const titleStyle = tableCellStyle(tableV2, TITLE_STYLE_KEY);

  return (
    <TableSelectionContext.Provider value={selectionContext}>
    <section
      ref={sectionRef}
      className={cn("rounded-lg border bg-muted/20 p-4 outline-none", selection.dragging && "select-none")}
      style={{ marginTop: print.spacingBefore, marginBottom: print.spacingAfter }}
      onKeyDown={(event) => {
        handleKeyDown(event);
        selection.containerProps.onKeyDown(event);
      }}
      onMouseDown={selection.containerProps.onMouseDown}
      onMouseOver={selection.containerProps.onMouseOver}
      tabIndex={-1}
      data-table-editor={table.id}
    >
      {/* Table title + toolbar */}
      <div className="mb-3 flex items-center justify-between gap-3">
        {/* The title is selected with the cells too (Ctrl/⌘+clic or Shift+clic, or Ctrl/⌘+A): bold, italic, alignment. */}
        <div className="min-w-0 flex-1" data-grid-title="">
          {/* Its right click gives the table's format and its title in the dictamen (video 7.3, 00:28). */}
          <ContextMenu>
            <ContextMenuTrigger>
              <Input
                disabled={readOnly}
                value={tableV2.title}
                onChange={(event) => onUpdate(table.id, (current) => ({ ...current, title: event.target.value }))}
                className={cn("font-semibold", selection.titleSelected && "bg-primary/10 ring-2 ring-primary/60 dark:bg-primary/20")}
                style={cellStyleCss(titleStyle)}
                aria-label="Título de la tabla"
                data-table-title={table.id}
              />
            </ContextMenuTrigger>
            {!readOnly ? (
              <ContextMenuContent className="w-72" aria-label="Menú del título de la tabla">
                <MenuGroups groups={[tableFormatGroup(tableFormat)]} parts={CONTEXT_PARTS} handlers={{ onAction: (action) => void tableFormat.run(action) }} />
              </ContextMenuContent>
            ) : null}
          </ContextMenu>
        </div>
        <div className="flex items-center gap-1">
          {actions}
          <Button type="button" size="icon" variant="outline" aria-label="Agregar columna" disabled={readOnly} title="Agregar columna" onClick={() => onAddColumn(table.id)}>
            <Columns3 />
          </Button>
          <Button type="button" size="icon" variant="outline" aria-label="Agregar fila" disabled={readOnly} title="Agregar fila" onClick={() => onAddRow(table.id)}>
            <Rows3 />
          </Button>
          <TableFormatControl table={tableV2} readOnly={readOnly} generated={Boolean(calculated) && !calculated?.capture} onChange={(updater) => onUpdate(table.id, v2Updater(updater))} open={formatOpen} onOpenChange={setFormatOpen} />
          {/* A disabled button takes no pointer events: the reason hangs from what wraps it. */}
          <span title={calculated ? (calculated.capture?.removeHint ?? CALCULATED_TABLE_REMOVE_HINT) : "Quitar tabla"} className="inline-flex">
            <Button type="button" size="icon" variant="ghost" aria-label={`Quitar ${tableV2.title}`} disabled={readOnly || Boolean(calculated)} aria-description={calculated ? (calculated.capture?.removeHint ?? CALCULATED_TABLE_REMOVE_HINT) : undefined} data-remove-table={table.id} onClick={() => requestTableRemoval(confirmDelete, { id: table.id, title: tableV2.title }, onRemove)}>
              <Trash2 />
            </Button>
          </span>
        </div>
      </div>

      {/* Too wide for the page even at the smallest letter: it suggests the page on its side. */}
      <TablePageFitNotice table={tableV2} formulaResults={formulaResults} readOnly={readOnly} />

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

      {/* How to select and what to do with the cells selected, in one place (video 5.7). */}
      {!formulaMode && (
        <CellSelectionBar
          count={selection.count}
          label={selectionLabel(selection.points.length, selection.titleSelected)}
          readOnly={readOnly}
          hint={`Para calcular, escribe = en una celda, por ejemplo =B2*C2 o =SUMA(A1:A5); «10%» vale 0.10.${calculated?.capture ? " Las cifras en gris las calcula el sistema; lo demás que escribas en las columnas del tipo entra al enfoque de costos." : calculated?.inPlace ? " Las celdas en blanco son la captura del cálculo: escribe en ellas. Las cifras en gris las calcula el sistema; los encabezados, el formato y las columnas y filas que agregues son tuyos y se conservan al recalcular." : calculated ? " Las cifras en gris las escribe el cálculo y se cambian en su panel; los encabezados, el formato y las columnas y filas que agregues son tuyos y se conservan al recalcular." : ""}`}
          marks={selectionActions.marks}
          align={selectionActions.align}
          current={firstSelectedCell?.format ?? firstSelectedColumn?.format}
          unitsLocked={selectedBodyCells.length ? undefined : ONLY_BODY_FORMAT_HINT}
          decimalsLocked={selectedBodyCells.length ? undefined : ONLY_BODY_FORMAT_HINT}
          onMark={selectionActions.mark}
          onAlign={selectionActions.alignTo}
          onUnit={selectionActions.unit}
          onDecimals={selectionActions.decimals}
          onClearFormat={selectionActions.clearFormat}
          onCopy={selectionActions.copy}
          onClearContents={selection.points.some((point) => point.row >= 0 && hasContent(point)) ? selectionActions.clearContents : undefined}
          onDone={selection.clear}
        />
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
            {/* «Ajustar al contenido»: as narrow as its columns in the editor too, not only in the dictamen (video 8.10, 24:52). */}
            <Table
              className="table-fixed text-xs"
              style={{ minWidth: tableMinWidth, ...(tableV2.schema?.widthMode === "content" ? { width: tableMinWidth } : {}) }}
              data-width-mode={tableV2.schema?.widthMode ?? "page"}
            >
              <colgroup>
                <col className="w-6" />
                {displayColumns.map((col) => (
                  <col key={col.id} style={getColumnWidth(col.id)} />
                ))}
                <col className={rowActions ? undefined : "w-8"} style={rowActions ? { width: ROW_ACTIONS_PX } : undefined} />
              </colgroup>
              <TableHeader>
                {/* Every column header moves among all the others, in either header row. */}
                <SortableContext items={displayColumnIds} strategy={headerLayout.hasGroups ? NO_SHIFT : horizontalListSortingStrategy}>
                {headerLayout.hasGroups ? (
                  <>
                    {/* Row 1: ungrouped columns (rowSpan=2) + group titles (colSpan) */}
                    <TableRow>
                      <TableHead className="w-6 p-0" rowSpan={2} />
                      {headerLayout.topRow.map((cell) => (
                        cell.kind === "column" ? (
                          <SortableColumnHeader key={cell.columnId} {...headerProps(cell.columnId)} rowSpan={cell.rowSpan} />
                        ) : (
                          <HeaderGroupTitle
                            key={cell.group.id}
                            group={cell.group}
                            colSpan={cell.colSpan}
                            tableV2={tableV2}
                            readOnly={readOnly || Boolean(formulaMode)}
                            isDragging={activeColId === `${GROUP_DRAG_PREFIX}${cell.group.id}`}
                            onRename={() => ctxRenameGroupTitle(cell.group.id, cell.group.title)}
                            onMove={(direction) => onUpdate(table.id, v2Updater((v2) => moveHeaderGroupBy(v2, cell.group.id, direction)))}
                            onColumns={() => window.setTimeout(() => setFormatOpen(true), 80)}
                            onUngroup={() => onUpdate(table.id, v2Updater((v2) => ungroupTableHeaders(v2, cell.group.id)))}
                          />
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

      {/* The notes printed with the table, written in place and in the size of the text (video 8.7); the calculation's tables keep theirs in their layout. */}
      {!calculated ? (
        <TableNotesEditor
          notes={tableV2.schema?.notes ?? []}
          readOnly={readOnly}
          suggestion={homologationNoteSuggestion(tableV2)}
          onChange={(notes) => onUpdate(table.id, v2Updater((v2) => ({ ...v2, schema: { ...(v2.schema ?? { zones: [] }), notes } })))}
        />
      ) : null}

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
    </TableSelectionContext.Provider>
  );
}
