"use client";

/**
 * The cells of a table the calculation writes, as the dictamen prints them,
 * to select and give format (video 5.7): bold, italic, underline, alignment
 * and decimals of cells, headers and the title, with the same selection and
 * bar as the editor's tables. The figures stay the calculation's: only how
 * they print changes, and it is kept in the table's layout, so the next
 * calculation keeps it.
 */
import { useMemo, useRef } from "react";

import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { applyTableLayout, layoutOf, sourceOf, withCellStyles } from "@/features/valuations/calculation/generated-table-layout";
import type { TableContent } from "@/features/valuations/model";
import { cn } from "@/lib/utils";
import { ensureTableV2, getDisplayColumns, type TableCellStyle, type TableV2 } from "../../services/table";
import {
  TITLE_STYLE_KEY,
  bodyCellsOf,
  cellStyleCss,
  cellStyleKey,
  clearTableFormat,
  headerStyleKey,
  markIsOn,
  setGeneratedCellDecimals,
  setTableCellStyles,
  tableCellStyle,
  toggleTableMark,
} from "../../services/table-cell-style";
import { GENERATED_UNITS_HINT, tableContextMenu, type TableMenuAction } from "../../services/table-context-menu";
import { evaluateTableFormulas, getCellDisplayValue } from "../../services/table-formula-engine";
import { useNumberPresentation } from "../number-presentation-context";
import { CellSelectionBar, selectionLabel } from "./cell-selection-bar";
import { MenuGroups } from "./table-editor";
import { CONTEXT_PARTS } from "./table-value-format-items";
import { useCellSelection } from "./use-cell-selection";

export function GeneratedTableCells({ table, readOnly, onChange }: { table: TableContent; readOnly: boolean; onChange: (table: TableContent) => void }) {
  const printed = useMemo(() => ensureTableV2(table), [table]);
  const formulaResults = useMemo(() => evaluateTableFormulas(printed), [printed]);
  const presentation = useNumberPresentation();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const columns = getDisplayColumns(printed);
  const rows = printed.rows;
  const shape = { rows: rows.length, cols: columns.length, header: true };
  const display = (rowId: string, columnId: string) => getCellDisplayValue(printed, rowId, columnId, formulaResults, presentation);
  const selection = useCellSelection({
    containerRef: frameRef,
    shape,
    paused: readOnly,
    withTitle: true,
    readCell: (point) => {
      if (!point) return printed.title;
      if (point.row < 0) return columns[point.col]?.name ?? "";
      return display(rows[point.row]?.id ?? "", columns[point.col]?.id ?? "");
    },
  });
  const keyOf = (row: number, col: number) => (row < 0 ? headerStyleKey(columns[col]?.id ?? "") : cellStyleKey(rows[row]?.id ?? "", columns[col]?.id ?? ""));
  const keys = [...(selection.titleSelected ? [TITLE_STYLE_KEY] : []), ...selection.points.map((point) => keyOf(point.row, point.col))];
  const bodyKeys = bodyCellsOf(printed, keys).map((cell) => cellStyleKey(cell.rowId, cell.columnId));
  const boldByDefault = (key: string) => key.startsWith("header:") || Boolean(printed.schema?.columnPresentation?.[bodyCellsOf(printed, [key])[0]?.columnId ?? ""]?.bold);

  /** What the appraiser chose, into the layout the calculation keeps. */
  const save = (styles: Record<string, TableCellStyle> | undefined) => onChange(applyTableLayout(sourceOf(table), withCellStyles(layoutOf(table), styles)));
  const restyle = (change: (v2: TableV2) => TableV2, on: string[] = keys) => {
    if (on.length) save(change(printed).schema?.cellStyles);
  };
  const actionsOn = (on: string[]) => {
    const body = bodyCellsOf(printed, on).map((cell) => cellStyleKey(cell.rowId, cell.columnId));
    const aligns = new Set(on.map((key) => tableCellStyle(printed, key).align));
    const decimals = new Set(body.map((key) => tableCellStyle(printed, key).decimals));
    return {
      marks: {
        bold: markIsOn(printed, on, "bold", boldByDefault),
        italic: markIsOn(printed, on, "italic"),
        underline: markIsOn(printed, on, "underline"),
      },
      align: aligns.size === 1 ? [...aligns][0] : undefined,
      decimalsNow: decimals.size === 1 ? [...decimals][0] : undefined,
      mark: (mark: "bold" | "italic" | "underline") => restyle((v2) => toggleTableMark(v2, on, mark, mark === "bold" ? boldByDefault : undefined), on),
      alignTo: (align: "left" | "center" | "right") => restyle((v2) => setTableCellStyles(v2, on, { align }), on),
      decimals: (value: number | undefined) => {
        if (body.length) save(setGeneratedCellDecimals(printed.schema?.cellStyles, body, value));
      },
      clearFormat: () => restyle((v2) => clearTableFormat(v2, on), on),
    };
  };
  const actions = actionsOn(keys);

  const cellMenu = (row: number, col: number) => {
    const key = keyOf(row, col);
    const several = selection.count > 1 && selection.isSelected({ row, col });
    const on = several ? actions : actionsOn([key]);
    const run = (action: TableMenuAction) => {
      if (action === "copy") {
        if (several) void selection.copy();
        else void navigator.clipboard.writeText(display(rows[row]?.id ?? "", columns[col]?.id ?? "")).catch(() => undefined);
      }
      if (action === "bold" || action === "italic" || action === "underline") on.mark(action);
      if (action === "clear-format") on.clearFormat();
    };
    const groups = tableContextMenu("generated", {
      kind: "cell",
      editable: false,
      hasFormula: false,
      canPaste: false,
      canInsertRow: false,
      canInsertColumn: false,
      canDeleteColumn: false,
      canDeleteRow: false,
      selected: several ? selection.count : undefined,
    });
    return (
      <ContextMenuContent className="w-64">
        <MenuGroups
          groups={groups}
          parts={CONTEXT_PARTS}
          handlers={{
            onAction: run,
            onDecimals: on.decimals,
            currentFormat: on.decimalsNow === undefined ? undefined : { type: "number", precision: on.decimalsNow },
            onAlign: on.alignTo,
            currentAlign: on.align,
          }}
        />
      </ContextMenuContent>
    );
  };

  const selectedClass = (row: number, col: number) => cn(
    selection.isSelected({ row, col }) && "bg-primary/10 dark:bg-primary/20",
    selection.isActive({ row, col }) && "outline-2 -outline-offset-2 outline-primary",
  );
  const styled = Object.keys(printed.schema?.cellStyles ?? {}).length;

  return (
    <details className="rounded-md border bg-background text-xs" data-generated-table-cells={printed.id}>
      <summary className="cursor-pointer px-2 py-1.5 font-medium">
        Formato de celdas de «{printed.title}»
        <span className="font-normal text-muted-foreground"> · negrita, alineación y decimales{styled ? ` · ${styled} con formato` : ""}</span>
      </summary>
      <div className="grid gap-2 border-t p-2">
        <CellSelectionBar
          count={selection.count}
          label={selectionLabel(selection.points.length, selection.titleSelected)}
          readOnly={readOnly}
          hint="Las cifras las escribe el cálculo: aquí cambia solo cómo se imprimen."
          marks={actions.marks}
          align={actions.align}
          current={actions.decimalsNow === undefined ? undefined : { type: "number", precision: actions.decimalsNow }}
          unitsLocked={GENERATED_UNITS_HINT}
          decimalsLocked={bodyKeys.length ? undefined : "Los decimales son de las cifras, no de los encabezados ni del título."}
          onMark={actions.mark}
          onAlign={actions.alignTo}
          onUnit={() => undefined}
          onDecimals={actions.decimals}
          onClearFormat={actions.clearFormat}
          onCopy={() => void selection.copy()}
          onDone={selection.clear}
        />
        <div
          ref={frameRef}
          className={cn("overflow-x-auto rounded-md border outline-none", selection.dragging && "select-none")}
          tabIndex={-1}
          onMouseDown={selection.containerProps.onMouseDown}
          onMouseOver={selection.containerProps.onMouseOver}
          onKeyDown={selection.containerProps.onKeyDown}
        >
          <div
            className={cn("cursor-cell px-2 py-1 font-semibold", selection.titleSelected && "bg-primary/10 ring-2 ring-primary/60 ring-inset dark:bg-primary/20")}
            style={cellStyleCss(tableCellStyle(printed, TITLE_STYLE_KEY))}
            data-grid-title=""
          >
            {printed.title}
          </div>
          <table className="w-full border-collapse text-xs">
            <thead className="bg-muted">
              <tr>
                {columns.map((column, col) => (
                  <ContextMenu key={column.id}>
                    <ContextMenuTrigger
                      render={
                        <th
                          className={cn("cursor-cell border px-1.5 py-1 text-center font-bold", selectedClass(-1, col))}
                          style={cellStyleCss(tableCellStyle(printed, headerStyleKey(column.id)))}
                          data-grid-row={-1}
                          data-grid-col={col}
                        />
                      }
                    >
                      {column.name}
                    </ContextMenuTrigger>
                    {readOnly ? null : cellMenu(-1, col)}
                  </ContextMenu>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.id} className="odd:bg-muted/40">
                  {columns.map((column, col) => (
                    <ContextMenu key={column.id}>
                      <ContextMenuTrigger
                        render={
                          <td
                            className={cn("cursor-cell border px-1.5 py-1 tabular-nums", selectedClass(rowIndex, col))}
                            style={cellStyleCss(tableCellStyle(printed, cellStyleKey(row.id, column.id)))}
                            data-grid-row={rowIndex}
                            data-grid-col={col}
                          />
                        }
                      >
                        {display(row.id, column.id)}
                      </ContextMenuTrigger>
                      {readOnly ? null : cellMenu(rowIndex, col)}
                    </ContextMenu>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
