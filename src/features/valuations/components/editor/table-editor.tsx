"use client";

import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import type { TableContent } from "@/features/valuations/model";
import {
  ensureTableV2,
  type TableV2,
  type TableCellV2,
  type TableFormula,
  type TableColumn,
  type FormulaResult,
  type ColumnCapability,
  type HeaderLayoutCell,
  moveTableColumn,
  moveTableRow,
  insertTableColumn,
  removeTableColumn,
  renameTableColumn,
  insertTableRow,
  removeTableRow,
  clearTableRow,
  clearTableColumn,
  duplicateTableRow,
  setCellFormula,
  buildFormulaFromSelection,
  resolveColumnCapability,
  getTableHeaderLayout,
  getDisplayColumns,
  updateHeaderGroupTitle,
} from "../../services/table";
import { evaluateTableFormulas, getCellDisplayValue } from "../../services/table-formula-engine";

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
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
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
  Columns3,
  GripVertical,
  Plus,
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

type FormulaSelectionOp = "SUM" | "AVERAGE" | "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE";

type FormulaSelectionState = {
  targetRowId: string;
  targetColumnId: string;
  operation: FormulaSelectionOp;
  sources: Array<{ rowId: string; columnId: string }>;
};

/* ================================================================== */
/*  Sortable column header                                             */
/* ================================================================== */

function SortableColumnHeader({
  column,
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
  onContextMenuClear,
  onContextMenuDelete,
}: {
  column: TableColumn;
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
  onContextMenuClear: (columnId: string) => void;
  onContextMenuDelete: (columnId: string) => void;
}) {
  const isMovable = capability.movable !== false;

  // Local draft state — typing is free, normalization happens only on commit
  const [draftName, setDraftName] = useState(column.name);
  const prevColIdRef = useRef(column.id);
  if (prevColIdRef.current !== column.id) {
    prevColIdRef.current = column.id;
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

  return (
    <TableHead ref={setNodeRef} style={{ ...style, ...cellStyle }} className="p-0" rowSpan={rowSpan} colSpan={colSpan}>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={cn(
              "flex min-w-[140px] items-center gap-1 rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5 transition-colors",
              isOver && !isDragging && "border-blue-400 bg-blue-50",
              formulaMode && "opacity-60",
            )}
          >
            {!readOnly && isMovable && (
              <div ref={setActivatorNodeRef} {...attributes} {...listeners}>
                <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-slate-400" />
              </div>
            )}
            <Input
              className="h-6 min-w-0 flex-1 border-0 bg-transparent px-0.5 text-xs font-semibold"
              disabled={readOnly || capability.headerEditable === false}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitDraft();
                  (event.target as HTMLInputElement).blur();
                }
              }}
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {capability.removable !== false && (
            <>
              <ContextMenuItem onClick={() => onContextMenuInsertLeft(column.id)}>
                Insertar columna a la izquierda
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onContextMenuInsertRight(column.id)}>
                Insertar columna a la derecha
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          {capability.headerEditable !== false && (
            <ContextMenuItem onClick={() => onContextMenuRename(column.id, column.name)}>
              Renombrar
            </ContextMenuItem>
          )}
          {capability.clearable !== false && (
            <ContextMenuItem onClick={() => onContextMenuClear(column.id)}>
              Limpiar columna
            </ContextMenuItem>
          )}
          {capability.removable !== false && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                disabled={tableV2.columns.length <= 1}
                onClick={() => onContextMenuDelete(column.id)}
              >
                Eliminar columna
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </TableHead>
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
  onContextMenuEditFormula,
  onContextMenuClearFormula,
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
  onContextMenuEditFormula: (rowId: string, columnId: string) => void;
  onContextMenuClearFormula: (rowId: string, columnId: string) => void;
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

  const updateCell = useCallback((rowId: string, columnId: string, value: string) => {
    onUpdate(tableId, v2Updater((v2) => {
      const newRows = v2.rows.map((r) => {
        if (r.id !== rowId) return r;
        const cells = { ...r.cells };
        if (cells[columnId]?.kind === "formula") return r;
        cells[columnId] = { kind: "value", value };
        return { ...r, cells };
      });
      return { ...v2, rows: newRows };
    }));
  }, [tableId, onUpdate]);

  return (
    <TableRow ref={setNodeRef} style={style} className={cn(
      rowIndex % 2 === 1 && "bg-primary/[0.03]",
      isOver && !isDragging && "bg-blue-50",
    )}>
      {displayColumns.map((column) => {
        const cell = row.cells[column.id];
        const isFormula = cell?.kind === "formula";
        const displayValue = getCellDisplayValue(tableV2, row.id, column.id, formulaResults);
        const isFormulaTarget = formulaMode?.targetRowId === row.id && formulaMode?.targetColumnId === column.id;
        const isFormulaSource = formulaMode?.sources.some((s) => s.rowId === row.id && s.columnId === column.id);

        return (
          <TableCell
            key={column.id}
            className={cn(
              "p-0.5",
              isFormula && "bg-blue-50/80",
              isFormulaTarget && "ring-2 ring-blue-400 ring-inset",
              isFormulaSource && "bg-blue-100/80 ring-1 ring-blue-300 ring-inset",
              formulaMode && !isFormulaTarget && !isFormulaSource && "opacity-60",
            )}
            onClick={() => formulaMode ? onFormulaCellClick(row.id, column.id) : undefined}
          >
            <ContextMenu>
              <ContextMenuTrigger>
                <div className="flex items-center">
                  <Input
                    disabled={readOnly}
                    value={isFormula ? displayValue : cell?.kind === "value" ? cell.value : ""}
                    onChange={(event) => updateCell(row.id, column.id, event.target.value)}
                    className={cn(
                      "h-7 w-full min-w-0 border-0 bg-transparent px-1 text-xs box-border",
                      isFormula && "font-mono text-blue-600",
                    )}
                    readOnly={isFormula}
                    title={isFormula ? `Fórmula: ${cell?.kind === "formula" ? cell.formula?.description : ""}` : undefined}
                  />
                  {isFormula && (
                    <FunctionSquare className="h-3 w-3 shrink-0 text-blue-500 mr-1" />
                  )}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                {isFormula ? (
                  <>
                    <ContextMenuItem onClick={() => onContextMenuEditFormula(row.id, column.id)}>
                      Editar fórmula
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => onContextMenuClearFormula(row.id, column.id)}>
                      Quitar fórmula
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                  </>
                ) : (
                  <>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>Resultado / Fórmula</ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-40">
                        <ContextMenuItem onClick={() => onContextMenuEditFormula(row.id, column.id)}>Sumar</ContextMenuItem>
                        <ContextMenuItem onClick={() => onContextMenuEditFormula(row.id, column.id)}>Restar</ContextMenuItem>
                        <ContextMenuItem onClick={() => onContextMenuEditFormula(row.id, column.id)}>Multiplicar</ContextMenuItem>
                        <ContextMenuItem onClick={() => onContextMenuEditFormula(row.id, column.id)}>Dividir</ContextMenuItem>
                        <ContextMenuItem onClick={() => onContextMenuEditFormula(row.id, column.id)}>Promedio</ContextMenuItem>
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
      })}
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
              <GripVertical className="h-3.5 w-3.5 cursor-grab text-slate-400" />
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
}: {
  table: TableContent;
  onAddColumn: (tableId: string) => void;
  onAddRow: (tableId: string) => void;
  onRemove: (tableId: string) => void;
  onUpdate: (tableId: string, updater: (table: TableContent) => TableContent) => void;
  readOnly: boolean;
}) {
  const tableV2 = useMemo(() => ensureTableV2(table), [table]);
  const formulaResults = useMemo(() => evaluateTableFormulas(tableV2), [tableV2]);
  const [formulaMode, setFormulaMode] = useState<FormulaSelectionState | null>(null);

  /* ---- Column DnD state ---- */
  const [activeColId, setActiveColId] = useState<string | null>(null);
  const [overColId, setOverColId] = useState<string | null>(null);

  /* ---- Row DnD state ---- */
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [overRowId, setOverRowId] = useState<string | null>(null);

  const isDndDisabled = readOnly || !!formulaMode;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  /* ---- Column DnD handlers ---- */
  const handleColDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveColId(id);
  }, []);

  const handleColDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    setOverColId(overId ?? null);
  }, []);

  const handleColDragEnd = useCallback((event: DragEndEvent) => {
    setActiveColId(null);
    setOverColId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // Zone constraint: only reorder within same zone
    if (tableV2.schema) {
      const activeZone = tableV2.schema.zones.find((z) => z.columnIds.includes(active.id as string));
      const overZone = tableV2.schema.zones.find((z) => z.columnIds.includes(over.id as string));
      if (!activeZone || !overZone || activeZone.id !== overZone.id) return;
      if (activeZone.kind === "fixed") return;
    }
    const fromIndex = tableV2.columns.findIndex((c) => c.id === active.id);
    const toIndex = tableV2.columns.findIndex((c) => c.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    onUpdate(table.id, v2Updater((v2) => moveTableColumn(v2, fromIndex, toIndex)));
  }, [table.id, tableV2.columns, tableV2.schema, onUpdate]);

  const handleColDragCancel = useCallback(() => {
    setActiveColId(null);
    setOverColId(null);
  }, []);

  /* ---- Row DnD handlers ---- */
  const handleRowDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveRowId(id);
  }, []);

  const handleRowDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    setOverRowId(overId ?? null);
  }, []);

  const handleRowDragEnd = useCallback((event: DragEndEvent) => {
    setActiveRowId(null);
    setOverRowId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = tableV2.rows.findIndex((r) => r.id === active.id);
    const toIndex = tableV2.rows.findIndex((r) => r.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    onUpdate(table.id, v2Updater((v2) => moveTableRow(v2, fromIndex, toIndex)));
  }, [table.id, tableV2.rows, onUpdate]);

  const handleRowDragCancel = useCallback(() => {
    setActiveRowId(null);
    setOverRowId(null);
  }, []);

  /* ---- Formula selection mode ---- */
  const startFormulaMode = useCallback((rowId: string, columnId: string, op: FormulaSelectionOp) => {
    setFormulaMode({ targetRowId: rowId, targetColumnId: columnId, operation: op, sources: [] });
  }, []);

  const handleFormulaCellClick = useCallback((rowId: string, columnId: string) => {
    if (!formulaMode) return;
    if (rowId === formulaMode.targetRowId && columnId === formulaMode.targetColumnId) return;
    if (formulaMode.sources.some((s) => s.rowId === rowId && s.columnId === columnId)) return;
    setFormulaMode((prev) => prev ? { ...prev, sources: [...prev.sources, { rowId, columnId }] } : null);
  }, [formulaMode]);

  const applyFormulaSelection = useCallback(() => {
    if (!formulaMode || formulaMode.sources.length === 0) { setFormulaMode(null); return; }
    const formula = buildFormulaFromSelection(formulaMode.operation, formulaMode.sources);
    if (formula) {
      onUpdate(table.id, v2Updater((v2) => setCellFormula(v2, formulaMode.targetRowId, formulaMode.targetColumnId, formula)));
    }
    setFormulaMode(null);
  }, [formulaMode, table.id, onUpdate]);

  const cancelFormulaSelection = useCallback(() => { setFormulaMode(null); }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!formulaMode) return;
    if (e.key === "Escape") cancelFormulaSelection();
    if (e.key === "Enter" && formulaMode.sources.length > 0) applyFormulaSelection();
  }, [formulaMode, cancelFormulaSelection, applyFormulaSelection]);

  /* ---- Context menu column actions ---- */
  const ctxRenameColumn = useCallback((columnId: string, currentName: string) => {
    const newName = prompt("Nuevo nombre de columna:", currentName);
    if (newName !== null && newName.trim()) {
      onUpdate(table.id, v2Updater((v2) => renameTableColumn(v2, columnId, newName)));
    }
  }, [table.id, onUpdate]);

  const ctxInsertColumnLeft = useCallback((columnId: string) => {
    const idx = tableV2.columns.findIndex((c) => c.id === columnId);
    onUpdate(table.id, v2Updater((v2) => insertTableColumn(v2, idx, `Nueva columna`)));
  }, [table.id, tableV2.columns, onUpdate]);

  const ctxInsertColumnRight = useCallback((columnId: string) => {
    const idx = tableV2.columns.findIndex((c) => c.id === columnId);
    onUpdate(table.id, v2Updater((v2) => insertTableColumn(v2, idx + 1, `Nueva columna`)));
  }, [table.id, tableV2.columns, onUpdate]);

  const ctxClearColumn = useCallback((columnId: string) => {
    onUpdate(table.id, v2Updater((v2) => clearTableColumn(v2, columnId)));
  }, [table.id, onUpdate]);

  const ctxDeleteColumn = useCallback((columnId: string) => {
    onUpdate(table.id, v2Updater((v2) => removeTableColumn(v2, columnId)));
  }, [table.id, onUpdate]);

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

  /* ---- Context menu formula actions ---- */
  const ctxEditFormula = useCallback((rowId: string, columnId: string) => {
    startFormulaMode(rowId, columnId, "SUM");
  }, [startFormulaMode]);

  const ctxClearFormula = useCallback((rowId: string, columnId: string) => {
    onUpdate(table.id, v2Updater((v2) => setCellFormula(v2, rowId, columnId, null)));
  }, [table.id, onUpdate]);

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

  const columnIds = useMemo(() => tableV2.columns.map((c) => c.id), [tableV2.columns]);
  const rowIds = useMemo(() => tableV2.rows.map((r) => r.id), [tableV2.rows]);
  const headerLayout = useMemo(() => getTableHeaderLayout(tableV2), [tableV2]);
  const displayColumns = useMemo(() => getDisplayColumns(tableV2), [tableV2]);

  const getColumnWidth = useCallback((columnId: string): React.CSSProperties => {
    const pres = tableV2.schema?.columnPresentation?.[columnId];
    if (!pres) return {};
    const style: React.CSSProperties = {};
    if (pres.width) style.width = pres.width;
    if (pres.minWidth) style.minWidth = pres.minWidth;
    if (pres.maxWidth) style.maxWidth = pres.maxWidth;
    return style;
  }, [tableV2.schema]);

  return (
    <section className="rounded-lg border bg-muted/20 p-4" onKeyDown={handleKeyDown} tabIndex={-1}>
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
          <Button type="button" size="icon" variant="ghost" aria-label={`Quitar ${tableV2.title}`} disabled={readOnly} title="Quitar tabla" onClick={() => onRemove(table.id)}>
            <Trash2 />
          </Button>
        </div>
      </div>

      {/* Formula selection mode indicator */}
      {formulaMode && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
          <Calculator className="h-3.5 w-3.5" />
          <span>Selecciona celdas fuente para <strong>{formulaMode.operation}</strong> ({formulaMode.sources.length} seleccionadas)</span>
          <Button type="button" size="sm" variant="ghost" className="ml-auto h-6 gap-1 text-xs text-blue-700 hover:text-blue-900" onClick={applyFormulaSelection} disabled={formulaMode.sources.length === 0}>
            <Check className="h-3 w-3" /> Aplicar
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 text-xs text-blue-700 hover:text-blue-900" onClick={cancelFormulaSelection}>
            <X className="h-3 w-3" /> Cancelar
          </Button>
        </div>
      )}

      {/* Hint */}
      {!readOnly && !formulaMode && (
        <p className="mb-2 text-[10px] text-muted-foreground">Click derecho para más opciones</p>
      )}

      {/* Table grid */}
      <div className="overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          autoScroll={{ canScroll: editorCanScroll }}
          onDragStart={handleColDragStart}
          onDragOver={handleColDragOver}
          onDragEnd={handleColDragEnd}
          onDragCancel={handleColDragCancel}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            autoScroll={{ canScroll: editorCanScroll }}
            onDragStart={handleRowDragStart}
            onDragOver={handleRowDragOver}
            onDragEnd={handleRowDragEnd}
            onDragCancel={handleRowDragCancel}
          >
            <Table className={headerLayout.hasGroups ? "table-fixed" : undefined}>
              <colgroup>
                {displayColumns.map((col) => (
                  <col key={col.id} style={getColumnWidth(col.id)} />
                ))}
                <col className="w-8" />
              </colgroup>
              <TableHeader>
                {headerLayout.hasGroups ? (
                  <>
                    {/* Row 1: ungrouped columns (rowSpan=2) + group titles (colSpan) */}
                    <TableRow>
                      {headerLayout.topRow.map((cell) => (
                        cell.kind === "column" ? (
                          <SortableColumnHeader
                            key={cell.columnId}
                            column={tableV2.columns.find((c) => c.id === cell.columnId)!}
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
                            onContextMenuClear={ctxClearColumn}
                            onContextMenuDelete={ctxDeleteColumn}
                          />
                        ) : (
                          <TableHead
                            key={cell.group.id}
                            colSpan={cell.colSpan}
                            className="p-0 text-center bg-slate-100"
                          >
                            <ContextMenu>
                              <ContextMenuTrigger>
                                <div
                                  className="px-2 py-1 text-xs font-semibold cursor-pointer hover:bg-slate-200 rounded"
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
                        <SortableContext items={headerLayout.bottomRow} strategy={horizontalListSortingStrategy}>
                          {headerLayout.bottomRow.map((colId) => {
                            const column = tableV2.columns.find((c) => c.id === colId);
                            if (!column) return null;
                            return (
                              <SortableColumnHeader
                                key={colId}
                                column={column}
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
                                onContextMenuClear={ctxClearColumn}
                                onContextMenuDelete={ctxDeleteColumn}
                              />
                            );
                          })}
                        </SortableContext>
                      </TableRow>
                    )}
                  </>
                ) : (
                  /* Free table: single-row header */
                  <TableRow>
                    <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
                      {displayColumns.map((column) => (
                        <SortableColumnHeader
                          key={column.id}
                          column={column}
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
                          onContextMenuClear={ctxClearColumn}
                          onContextMenuDelete={ctxDeleteColumn}
                        />
                      ))}
                    </SortableContext>
                    <TableHead className="w-8 p-0" />
                  </TableRow>
                )}
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
                      onContextMenuEditFormula={ctxEditFormula}
                      onContextMenuClearFormula={ctxClearFormula}
                    />
                  ))}
                </SortableContext>
              </TableBody>
            </Table>
          </DndContext>
        </DndContext>
      </div>

      {/* Result groups */}
      {tableV2.schema?.resultGroups && tableV2.schema.resultGroups.length > 0 && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <div className="flex items-start justify-between gap-4 text-[11px]">
            <div className="flex flex-col gap-1">
              {tableV2.schema.resultGroups
                .filter((g) => g.align === "start" || !g.align)
                .flatMap((g) => g.items)
                .map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className="font-medium text-slate-600">{item.label}</span>
                    <span className="text-slate-400 italic text-[10px]">—</span>
                  </div>
                ))}
            </div>
            <div className="flex flex-col gap-1 text-center">
              {tableV2.schema.resultGroups
                .filter((g) => g.align === "center")
                .flatMap((g) => g.items)
                .map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className="font-medium text-slate-600">{item.label}</span>
                    <span className="text-slate-400 italic text-[10px]">—</span>
                  </div>
                ))}
            </div>
            <div className="flex flex-col gap-1 text-right">
              {tableV2.schema.resultGroups
                .filter((g) => g.align === "end")
                .flatMap((g) => g.items)
                .map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className="font-medium text-slate-600">{item.label}</span>
                    <span className="text-slate-400 italic text-[10px]">—</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
