/**
 * What a selection of cells does to a table (video 5.7: bold, format or
 * decimals for several cells at once, the way «Seleccionar conceptos» does it
 * for concepts): the style of cells, headers and the title, their "Unidades
 * de valor" and "Decimales", clearing them and writing what is pasted.
 *
 * Styles are kept in the table's schema (`cellStyles`), by key: a body cell
 * by its row and column ids, a header by its column id and the title by
 * itself. The ids never change, so a style follows its cell when rows or
 * columns move, and a copy of the table keeps it. A table the calculation
 * writes keeps them in its layout, so the next calculation keeps them too.
 *
 * Pure TypeScript — no React components, no side effects.
 */
import type { CSSProperties } from "react";

import {
  setCellFormula,
  tableValueDecimals,
  tableValueFormat,
  tableValueUnit,
  type TableCellFormat,
  type TableCellStyle,
  type TableFormula,
  type TableSchema,
  type TableV2,
  type TableValueUnit,
} from "./table";

export const TITLE_STYLE_KEY = "title";
export const headerStyleKey = (columnId: string) => `header:${columnId}`;
export const cellStyleKey = (rowId: string, columnId: string) => `${rowId}:${columnId}`;

/** What a choice changes of a style; `null` gives the default back. */
export type CellStylePatch = { [K in keyof TableCellStyle]?: TableCellStyle[K] | null };

export type StyleMark = "bold" | "italic" | "underline";

const STYLE_FIELDS = ["bold", "italic", "underline", "align", "decimals"] as const;

/** A style with only what was chosen; null when nothing is left. */
function cleanStyle(style: TableCellStyle): TableCellStyle | null {
  const clean: TableCellStyle = {};
  if (typeof style.bold === "boolean") clean.bold = style.bold;
  if (typeof style.italic === "boolean") clean.italic = style.italic;
  if (typeof style.underline === "boolean") clean.underline = style.underline;
  if (style.align === "left" || style.align === "center" || style.align === "right") clean.align = style.align;
  if (typeof style.decimals === "number" && Number.isInteger(style.decimals) && style.decimals >= 0 && style.decimals <= 4) clean.decimals = style.decimals;
  return Object.keys(clean).length ? clean : null;
}

/** The styles with `patches` applied by key; undefined when no style is left. */
export function patchCellStyles(
  styles: Record<string, TableCellStyle> | undefined,
  patches: Array<{ key: string; patch: CellStylePatch | null }>,
): Record<string, TableCellStyle> | undefined {
  const next: Record<string, TableCellStyle> = { ...(styles ?? {}) };
  for (const { key, patch } of patches) {
    if (patch === null) {
      delete next[key];
      continue;
    }
    const merged: Record<string, unknown> = { ...(next[key] ?? {}) };
    for (const field of STYLE_FIELDS) {
      if (!(field in patch)) continue;
      const value = patch[field];
      if (value === null || value === undefined) delete merged[field];
      else merged[field] = value;
    }
    const clean = cleanStyle(merged as TableCellStyle);
    if (clean) next[key] = clean;
    else delete next[key];
  }
  return Object.keys(next).length ? next : undefined;
}

/** The style of a cell, header or title; empty when it has none. */
export function tableCellStyle(table: Pick<TableV2, "schema">, key: string): TableCellStyle {
  return table.schema?.cellStyles?.[key] ?? {};
}

function withStyles(table: TableV2, styles: Record<string, TableCellStyle> | undefined): TableV2 {
  const { cellStyles: _previous, ...schema } = table.schema ?? ({ zones: [] } as TableSchema);
  // A free table without anything else in its schema stays free.
  if (!styles && !table.schema) return table;
  return { ...table, schema: styles ? { ...schema, cellStyles: styles } : schema };
}

/** The table with the same change of style on every key. */
export function setTableCellStyles(table: TableV2, keys: string[], patch: CellStylePatch): TableV2 {
  return withStyles(table, patchCellStyles(table.schema?.cellStyles, keys.map((key) => ({ key, patch }))));
}

/**
 * Whether every key shows `mark` on: what it was given, or else what it has
 * by default (a header is bold, a column the calculation marks bold too).
 */
export function markIsOn(table: Pick<TableV2, "schema">, keys: string[], mark: StyleMark, defaultOn: (key: string) => boolean = () => false): boolean {
  return keys.length > 0 && keys.every((key) => tableCellStyle(table, key)[mark] ?? defaultOn(key));
}

/**
 * N, K or S on a selection, as a word processor does: when every cell already
 * has it, it goes off on all; otherwise it goes on on all. A cell that ends as
 * its default keeps no style for it.
 */
export function toggleTableMark(table: TableV2, keys: string[], mark: StyleMark, defaultOn: (key: string) => boolean = () => false): TableV2 {
  const on = !markIsOn(table, keys, mark, defaultOn);
  return withStyles(table, patchCellStyles(table.schema?.cellStyles, keys.map((key) => ({ key, patch: { [mark]: on === defaultOn(key) ? null : on } }))));
}

/** The keys among `keys` that are body cells (not headers, nor the title), as row and column ids. */
export function bodyCellsOf(table: Pick<TableV2, "rows" | "columns">, keys: string[]): Array<{ rowId: string; columnId: string }> {
  const rows = new Set(table.rows.map((row) => row.id));
  const columns = new Set(table.columns.map((column) => column.id));
  return keys.flatMap((key) => {
    if (key === TITLE_STYLE_KEY || key.startsWith("header:")) return [];
    const split = key.lastIndexOf(":");
    const rowId = key.slice(0, split);
    const columnId = key.slice(split + 1);
    return rows.has(rowId) && columns.has(columnId) ? [{ rowId, columnId }] : [];
  });
}

/** "Limpiar formato": the style of every key out and, in the cells, their units and decimals; what is written stays. */
export function clearTableFormat(table: TableV2, keys: string[]): TableV2 {
  const styled = withStyles(table, patchCellStyles(table.schema?.cellStyles, keys.map((key) => ({ key, patch: null }))));
  return setCellsFormat(styled, bodyCellsOf(table, keys), () => null);
}

/** A change of "Unidades de valor" or of "Decimales": the one chosen; the other stays as each cell has it. */
export type ValueFormatChange = { unit: TableValueUnit } | { decimals: number | undefined };

/** The format of a cell after the change, starting from the one it shows (its own, or its column's). */
export function changedValueFormat(current: TableCellFormat | undefined, change: ValueFormatChange): TableCellFormat | null {
  if ("unit" in change) return tableValueFormat(change.unit, tableValueDecimals(current));
  return tableValueFormat(tableValueUnit(current), change.decimals);
}

function setCellsFormat(
  table: TableV2,
  cells: Array<{ rowId: string; columnId: string }>,
  format: (current: TableCellFormat | undefined, columnFormat: TableCellFormat | undefined) => TableCellFormat | null,
): TableV2 {
  if (!cells.length) return table;
  const byRow = new Map<string, Set<string>>();
  for (const { rowId, columnId } of cells) byRow.set(rowId, (byRow.get(rowId) ?? new Set()).add(columnId));
  const columnFormat = new Map(table.columns.map((column) => [column.id, column.format]));
  return {
    ...table,
    rows: table.rows.map((row) => {
      const columns = byRow.get(row.id);
      if (!columns) return row;
      const nextCells = { ...row.cells };
      for (const columnId of columns) {
        const cell = nextCells[columnId] ?? { kind: "value" as const, value: "" };
        const { format: previous, ...rest } = cell;
        const next = format(previous, columnFormat.get(columnId));
        nextCells[columnId] = { ...rest, ...(next ? { format: next } : {}) } as typeof cell;
      }
      return { ...row, cells: nextCells };
    }),
  };
}

/**
 * "Unidades de valor" or "Decimales" on every selected cell at once (video
 * 5.7: «no tengo que estar haciéndolo una por una»). Each cell starts from
 * the format it shows, its own or its column's, and keeps the other half.
 */
export function setCellsValueFormat(table: TableV2, cells: Array<{ rowId: string; columnId: string }>, change: ValueFormatChange): TableV2 {
  return setCellsFormat(table, cells, (current, column) => changedValueFormat(current ?? column, change));
}

/** Decimals of the figures of selected cells of a table the calculation writes; the values stay as written. */
export function setGeneratedCellDecimals(styles: Record<string, TableCellStyle> | undefined, keys: string[], decimals: number | undefined) {
  return patchCellStyles(styles, keys.map((key) => ({ key, patch: { decimals: decimals ?? null } })));
}

/** Supr on a selection: what is written in the cells, and their formulas, out; their format stays. */
export function clearCellContents(table: TableV2, cells: Array<{ rowId: string; columnId: string }>): TableV2 {
  return writeCellTexts(table, cells.map((cell) => ({ ...cell, text: "" })));
}

/**
 * What is pasted or cleared, cell by cell: a text that is a formula and
 * compiles is written as a formula; anything else as the text, keeping the
 * cell's format.
 */
export function writeCellTexts(
  table: TableV2,
  writes: Array<{ rowId: string; columnId: string; text: string }>,
  compile: (text: string) => TableFormula | null = () => null,
): TableV2 {
  let next = table;
  for (const { rowId, columnId, text } of writes) {
    const formula = text.trim().startsWith("=") ? compile(text.trim()) : null;
    if (formula) {
      next = setCellFormula(next, rowId, columnId, formula);
      continue;
    }
    next = {
      ...next,
      rows: next.rows.map((row) => {
        if (row.id !== rowId) return row;
        const format = row.cells[columnId]?.format;
        return { ...row, cells: { ...row.cells, [columnId]: { kind: "value", value: text, ...(format ? { format } : {}) } } };
      }),
    };
  }
  return next;
}

/**
 * How a style looks on screen and in print. A weight is written only when
 * chosen, so a cell keeps the weight of its place (a header stays bold).
 */
export function cellStyleCss(style: TableCellStyle | undefined): CSSProperties {
  if (!style) return {};
  const css: CSSProperties = {};
  if (style.bold !== undefined) css.fontWeight = style.bold ? 700 : 400;
  if (style.italic !== undefined) css.fontStyle = style.italic ? "italic" : "normal";
  if (style.underline !== undefined) css.textDecoration = style.underline ? "underline" : "none";
  if (style.align) css.textAlign = style.align;
  return css;
}
