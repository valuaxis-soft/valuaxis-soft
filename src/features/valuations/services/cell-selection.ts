/**
 * A selection of cells in a grid, as a spreadsheet's (video 5.7, Álvaro:
 * «Seleccionar conceptos» for the cells and titles of a table): a click
 * selects a cell, a drag or Shift+click a range, Ctrl/⌘+click adds or takes
 * out a cell, a column's letter or a row's number selects all of it, and
 * Ctrl/⌘+A everything, the table's title included. Every table of the editor
 * uses it: the configurable ones, the ones the calculation writes and the
 * capture tables of the panels.
 *
 * Points are row and column indexes as the grid shows them; row -1 is the
 * header row when the grid has one. The title is apart, a flag. Pure
 * TypeScript: no React, no DOM.
 */

export type GridPoint = { row: number; col: number };

/** A rectangle from where it started (`anchor`, the active cell) to where it reaches (`focus`). */
export type GridRange = { anchor: GridPoint; focus: GridPoint };

/** The ranges selected, the last one active, and whether the table's title is in. */
export type GridSelection = { ranges: GridRange[]; title: boolean };

/** The size of the grid: its rows of data, its columns and whether its header row takes a selection. */
export type GridShape = { rows: number; cols: number; header: boolean };

/** How a click joins the selection: it replaces it, extends the active range (Shift) or adds to it (Ctrl/⌘). */
export type SelectMode = "replace" | "extend" | "add";

export const EMPTY_SELECTION: GridSelection = { ranges: [], title: false };

const samePoint = (a: GridPoint, b: GridPoint) => a.row === b.row && a.col === b.col;

const single = (point: GridPoint): GridRange => ({ anchor: point, focus: point });

/** The top, bottom, left and right of a range, whichever way it was dragged. */
export function rangeBounds(range: GridRange) {
  return {
    top: Math.min(range.anchor.row, range.focus.row),
    bottom: Math.max(range.anchor.row, range.focus.row),
    left: Math.min(range.anchor.col, range.focus.col),
    right: Math.max(range.anchor.col, range.focus.col),
  };
}

const inRange = (range: GridRange, point: GridPoint) => {
  const bounds = rangeBounds(range);
  return point.row >= bounds.top && point.row <= bounds.bottom && point.col >= bounds.left && point.col <= bounds.right;
};

export const isCellSelected = (selection: GridSelection, point: GridPoint) => selection.ranges.some((range) => inRange(range, point));

/** The active cell: where the last range started. */
export const activePoint = (selection: GridSelection): GridPoint | null => selection.ranges.at(-1)?.anchor ?? null;

export const hasSelection = (selection: GridSelection) => selection.title || selection.ranges.length > 0;

/** A click on a cell, as `mode` says. Ctrl/⌘+click on a cell alone in the selection takes it out. */
export function selectPoint(selection: GridSelection, point: GridPoint, mode: SelectMode): GridSelection {
  if (mode === "replace" || !selection.ranges.length && mode === "extend") return { ranges: [single(point)], title: false };
  if (mode === "extend") return { ...selection, ranges: [...selection.ranges.slice(0, -1), { anchor: selection.ranges.at(-1)!.anchor, focus: point }] };
  const alone = selection.ranges.findIndex((range) => samePoint(range.anchor, point) && samePoint(range.focus, point));
  if (alone >= 0) return { ...selection, ranges: selection.ranges.filter((_, index) => index !== alone) };
  return { ...selection, ranges: [...selection.ranges, single(point)] };
}

const firstRow = (shape: GridShape) => (shape.header ? -1 : 0);

/** A column's letter: the whole column, its header included, as `mode` says (Shift reaches it from the active column). */
export function selectColumn(selection: GridSelection, shape: GridShape, col: number, mode: SelectMode): GridSelection {
  const top = firstRow(shape);
  const bottom = Math.max(shape.rows - 1, top);
  const last = selection.ranges.at(-1);
  if (mode === "extend" && last) {
    return { ...selection, ranges: [...selection.ranges.slice(0, -1), { anchor: { row: top, col: last.anchor.col }, focus: { row: bottom, col } }] };
  }
  const range = { anchor: { row: top, col }, focus: { row: bottom, col } };
  return mode === "add" ? { ...selection, ranges: [...selection.ranges, range] } : { ranges: [range], title: false };
}

/** A row's number: the whole row, as `mode` says. */
export function selectRow(selection: GridSelection, shape: GridShape, row: number, mode: SelectMode): GridSelection {
  const right = Math.max(shape.cols - 1, 0);
  const last = selection.ranges.at(-1);
  if (mode === "extend" && last) {
    return { ...selection, ranges: [...selection.ranges.slice(0, -1), { anchor: { row: last.anchor.row, col: 0 }, focus: { row, col: right } }] };
  }
  const range = { anchor: { row, col: 0 }, focus: { row, col: right } };
  return mode === "add" ? { ...selection, ranges: [...selection.ranges, range] } : { ranges: [range], title: false };
}

/** Ctrl/⌘+A: every cell, the headers and the title. */
export function selectAll(shape: GridShape, withTitle: boolean): GridSelection {
  if (!shape.cols) return { ranges: [], title: withTitle };
  const top = firstRow(shape);
  return { ranges: [{ anchor: { row: top, col: 0 }, focus: { row: Math.max(shape.rows - 1, top), col: shape.cols - 1 } }], title: withTitle };
}

/** The title in or out of the selection: alone with a plain click, joined with Ctrl/⌘ or Shift. */
export function selectTitle(selection: GridSelection, mode: SelectMode): GridSelection {
  if (mode === "replace") return { ranges: [], title: true };
  return { ...selection, title: !selection.title };
}

/** Every point selected inside the grid, once each, row by row. */
export function selectionPoints(selection: GridSelection, shape: GridShape): GridPoint[] {
  const top = firstRow(shape);
  const seen = new Set<string>();
  const points: GridPoint[] = [];
  for (const range of selection.ranges) {
    const bounds = rangeBounds(range);
    for (let row = Math.max(bounds.top, top); row <= Math.min(bounds.bottom, shape.rows - 1); row += 1) {
      for (let col = Math.max(bounds.left, 0); col <= Math.min(bounds.right, shape.cols - 1); col += 1) {
        const key = `${row}:${col}`;
        if (seen.has(key)) continue;
        seen.add(key);
        points.push({ row, col });
      }
    }
  }
  return points.sort((a, b) => a.row - b.row || a.col - b.col);
}

/** How many cells (and the title) are selected. */
export const selectionCount = (selection: GridSelection, shape: GridShape) => selectionPoints(selection, shape).length + (selection.title ? 1 : 0);

/** The selection inside a grid that changed size (rows or columns deleted): what fell out is dropped. */
export function clampSelection(selection: GridSelection, shape: GridShape): GridSelection {
  const top = firstRow(shape);
  const clamp = (point: GridPoint): GridPoint => ({
    row: Math.min(Math.max(point.row, top), shape.rows - 1),
    col: Math.min(Math.max(point.col, 0), shape.cols - 1),
  });
  if (!shape.cols || shape.rows - 1 < top) return { ranges: [], title: selection.title };
  const ranges = selection.ranges.map((range) => ({ anchor: clamp(range.anchor), focus: clamp(range.focus) }));
  const unchanged = ranges.every((range, index) => samePoint(range.anchor, selection.ranges[index].anchor) && samePoint(range.focus, selection.ranges[index].focus));
  return unchanged ? selection : { ranges, title: selection.title };
}

/* ------------------------------------------------------------------ */
/*  Text separated by tabs, as Excel copies and pastes                 */
/* ------------------------------------------------------------------ */

/**
 * The cells of text copied from Excel or another sheet: rows by line,
 * cells by tab. A cell in quotes may hold tabs, line breaks and doubled
 * quotes, as Excel writes them. The last line break closes the last row.
 */
export function parseTabularText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let index = 0;
  const source = text.replace(/\r\n?/g, "\n");
  let atCellStart = true;
  while (index < source.length) {
    const char = source[index];
    if (atCellStart && char === "\"") {
      // A quoted cell: until the quote that is not doubled.
      let end = index + 1;
      let value = "";
      let closed = false;
      while (end < source.length) {
        if (source[end] === "\"") {
          if (source[end + 1] === "\"") {
            value += "\"";
            end += 2;
            continue;
          }
          closed = true;
          break;
        }
        value += source[end];
        end += 1;
      }
      const next = source[end + 1];
      if (closed && (next === undefined || next === "\t" || next === "\n")) {
        cell = value;
        index = end + 1;
        atCellStart = false;
        continue;
      }
    }
    atCellStart = false;
    if (char === "\t") {
      row.push(cell);
      cell = "";
      atCellStart = true;
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      atCellStart = true;
    } else {
      cell += char;
    }
    index += 1;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Whether what is pasted is a grid of cells (tabs or lines) and not a value for one cell. */
export const isTabularText = (text: string) => /[\t\n\r]/.test(text.replace(/(\r\n|\r|\n)$/, ""));

/** Cells as text Excel reads back: tabs between cells, a line per row, quotes where a cell needs them. */
export function toTabularText(grid: string[][]): string {
  const quote = (value: string) => (/[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value);
  return grid.map((row) => row.map(quote).join("\t")).join("\n");
}

/**
 * What Ctrl/⌘+C copies: the rectangle that holds the selected cells, row by
 * row; a cell inside it that is not selected goes empty.
 */
export function selectionGrid(selection: GridSelection, shape: GridShape, read: (point: GridPoint) => string): string[][] {
  const points = selectionPoints(selection, shape);
  if (!points.length) return [];
  const top = Math.min(...points.map((point) => point.row));
  const bottom = Math.max(...points.map((point) => point.row));
  const left = Math.min(...points.map((point) => point.col));
  const right = Math.max(...points.map((point) => point.col));
  const chosen = new Set(points.map((point) => `${point.row}:${point.col}`));
  const grid: string[][] = [];
  for (let row = top; row <= bottom; row += 1) {
    const line: string[] = [];
    for (let col = left; col <= right; col += 1) line.push(chosen.has(`${row}:${col}`) ? read({ row, col }) : "");
    grid.push(line);
  }
  return grid;
}

/**
 * Where each pasted cell goes, as Excel does: from the top left cell of the
 * active range, over as many rows and columns as were copied, inside the
 * grid. One value pasted on several cells goes in each; a block pasted on a
 * range that holds it whole a number of times repeats to fill it.
 */
export function pastePlan(selection: GridSelection, shape: GridShape, grid: string[][]): Array<{ point: GridPoint; text: string }> {
  const range = selection.ranges.at(-1);
  if (!range || !grid.length) return [];
  const height = grid.length;
  const width = Math.max(...grid.map((row) => row.length));
  if (!width) return [];
  if (height === 1 && width === 1) {
    return selectionPoints(selection, shape).filter((point) => point.row >= 0).map((point) => ({ point, text: grid[0][0] }));
  }
  const bounds = rangeBounds(range);
  const top = Math.max(bounds.top, 0);
  const rangeHeight = bounds.bottom - top + 1;
  const rangeWidth = bounds.right - bounds.left + 1;
  const repeatRows = rangeHeight > height && rangeHeight % height === 0 ? rangeHeight : height;
  const repeatCols = rangeWidth > width && rangeWidth % width === 0 ? rangeWidth : width;
  const plan: Array<{ point: GridPoint; text: string }> = [];
  for (let row = 0; row < repeatRows; row += 1) {
    for (let col = 0; col < repeatCols; col += 1) {
      const point = { row: top + row, col: bounds.left + col };
      if (point.row >= shape.rows || point.col >= shape.cols) continue;
      plan.push({ point, text: grid[row % height][col % width] ?? "" });
    }
  }
  return plan;
}
