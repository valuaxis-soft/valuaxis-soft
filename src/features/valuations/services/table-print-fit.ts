/**
 * How a table of the dictamen fits the width of its page. A table that fits
 * prints as always (11 px, widths after its content). One that does not —
 * many columns, the appraiser's own columns, long headers — never leaves the
 * page: its columns share the width by their content with a minimum each,
 * its headers wrap between words, and only then its letter and the room
 * around each value shrink, step by step, down to a legible floor (8 px).
 * When even that is not enough, the columns are squeezed into the page and
 * the editor suggests printing the block on its side.
 *
 * Pure TypeScript: widths are estimated from the text, in em of the
 * document's letter; the printed table checks itself after layout and takes
 * a further step when a value still overflows its cell.
 */
import { DEFAULT_NUMBER_PRESENTATION, type NumberPresentation } from "./number-presentation";
import { columnWidthOf, printableColumns, printableRows, type FormulaResult, type TableV2 } from "./table";
import { getCellDisplayValue } from "./table-formula-engine";

/** The letter of every table of the document (TABLE_TEXT_SIZE). */
export const TABLE_FONT_PX = 11;
/** The smallest letter a table shrinks to: still legible on paper. */
export const MIN_TABLE_FONT_PX = 8;

/** Width of the content of a Letter page (816 px less 32 px each side, `sm:px-8`), upright and on its side. */
export const PORTRAIT_CONTENT_WIDTH_PX = 752;
export const LANDSCAPE_CONTENT_WIDTH_PX = 992;

/** Room either side of a value as tables print it: `px-2`, or `px-1.5` with more than 7 columns. */
const naturalPadding = (columns: number) => (columns > 7 ? 6 : 8);
/** The rule between two headers (2 px, white). */
const COLUMN_RULE_PX = 2;
/** A wrapped text column asks for at most this many characters per line. */
const WRAPPED_CELL_CHARS = 32;
const MIN_COLUMN_CHARS = 3;

/** Letter and room around each value, tried in order: first the room, then the letter. */
export const TABLE_FIT_STEPS: ReadonlyArray<{ fontPx: number; paddingPx: number }> = [
  { fontPx: 11, paddingPx: 6 },
  { fontPx: 11, paddingPx: 4 },
  { fontPx: 11, paddingPx: 3 },
  { fontPx: 10.5, paddingPx: 3 },
  { fontPx: 10, paddingPx: 3 },
  { fontPx: 9.5, paddingPx: 2 },
  { fontPx: 9, paddingPx: 2 },
  { fontPx: 8.5, paddingPx: 2 },
  { fontPx: MIN_TABLE_FONT_PX, paddingPx: 2 },
];

export type PrintFitColumn = {
  header: string;
  /** The values the column prints, as printed. */
  cells: string[];
  /** Figures kept on one line. */
  noWrap?: boolean;
  /** A width the appraiser set, in px. */
  width?: number;
};

export type TablePrintFit =
  /** It fits: printed as always. */
  | { kind: "natural" }
  | {
      kind: "fit";
      fontPx: number;
      paddingPx: number;
      /** Width of each column in px; they add up to the width given. */
      widths: number[];
      /** False when not even the floor fits: the values wrap anywhere and the editor suggests the page on its side. */
      fits: boolean;
      /** Index in TABLE_FIT_STEPS. */
      step: number;
    };

/** Width of a text in em of the document's letter; bold when it prints in bold. */
export type TextMeasure = (text: string, bold: boolean) => number;

/**
 * Width of a text in em of the document's letter (Geist), estimated by kind
 * of character: digits and capitals wider than lower case, spaces and stops
 * narrow, bold a little wider. The browser measures with the font itself
 * (`canvasTextMeasure`); this stands in where there is no browser.
 */
export const textWidthEm: TextMeasure = (text, bold = false) => {
  let width = 0;
  for (const char of text) {
    if (/\s/.test(char)) width += 0.28;
    else if (/[.,:;'|!il]/.test(char)) width += 0.28;
    else if (/[()[\]/\-fjrt]/.test(char)) width += 0.36;
    else if (/[0-9$%]/.test(char)) width += 0.58;
    else if (/[MWmw]/.test(char)) width += 0.86;
    else if (/[A-ZÁÉÍÓÚÑÜ²³]/.test(char)) width += 0.68;
    else width += 0.55;
  }
  return bold ? width * 1.08 : width;
};

/** Measures with the document's own letter in a canvas; the estimate when the browser cannot. */
export function canvasTextMeasure(fontFamily: string): TextMeasure {
  if (!fontFamily || typeof document === "undefined" || typeof document.createElement !== "function") return textWidthEm;
  const context = document.createElement("canvas").getContext?.("2d");
  if (!context) return textWidthEm;
  const cache = new Map<string, number>();
  return (text, bold) => {
    const key = `${bold ? 1 : 0}${text}`;
    const known = cache.get(key);
    if (known !== undefined) return known;
    context.font = `${bold ? 700 : 400} 100px ${fontFamily}`;
    const width = context.measureText(text).width / 100;
    cache.set(key, width);
    return width;
  };
}

/** Room for rounding and for the letter's own spacing, so a word that fits on paper never wraps. */
const SLACK_PX = 3;

const words = (text: string) => text.split(/\s+/).filter(Boolean);
const longestWordEm = (text: string, bold: boolean, measure: TextMeasure) => words(text).reduce((widest, word) => Math.max(widest, measure(word, bold)), 0);

/** What a header asks for, in em: its longest word at least; in two lines when long; a line broken by hand stays. */
function headerEm(header: string, measure: TextMeasure) {
  const text = header.trim();
  const lines = text.split("\n");
  const min = Math.max(...lines.map((line) => longestWordEm(line, true, measure)));
  const preferred = lines.length > 1
    ? Math.max(...lines.map((line) => measure(line.trim(), true)))
    : Math.max(min, measure(text, true) / 2);
  return { min, preferred };
}

/** What the values of a column ask for, in em: figures their whole width; texts a short line, never less than their longest word. */
function cellsEm(column: PrintFitColumn, measure: TextMeasure) {
  let min = 0;
  let preferred = 0;
  const wrapLimit = measure("a".repeat(WRAPPED_CELL_CHARS), false);
  for (const cell of column.cells) {
    const text = cell.trim();
    const full = measure(text, false);
    if (column.noWrap) {
      min = Math.max(min, full);
      preferred = Math.max(preferred, full);
    } else {
      const word = longestWordEm(text, false, measure);
      min = Math.max(min, word);
      preferred = Math.max(preferred, Math.max(word, Math.min(full, wrapLimit)));
    }
  }
  return { min, preferred };
}

type ColumnNeeds = { min: number; preferred: number; fixed?: number };

function columnNeeds(columns: PrintFitColumn[], fontPx: number, paddingPx: number, measure: TextMeasure): ColumnNeeds[] {
  const floor = measure("0".repeat(MIN_COLUMN_CHARS), false) * fontPx;
  const room = 2 * paddingPx + COLUMN_RULE_PX + SLACK_PX;
  return columns.map((column) => {
    if (column.width) return { min: column.width, preferred: column.width, fixed: column.width };
    const header = headerEm(column.header, measure);
    const cells = cellsEm(column, measure);
    const min = Math.max(floor, header.min * fontPx, cells.min * fontPx) + room;
    const preferred = Math.max(min, Math.max(header.preferred, cells.preferred) * fontPx + room);
    return { min, preferred };
  });
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/**
 * What the browser lays out on its own: headers in two lines (the printed
 * header keeps half its length on a line), figures whole, texts wrapped. Over
 * the width, the table would leave the page.
 */
export function naturalTableWidth(columns: PrintFitColumn[], measure: TextMeasure = textWidthEm): number {
  const padding = naturalPadding(columns.length);
  return sum(columns.map((column) => {
    if (column.width) return column.width;
    const cells = cellsEm(column, measure);
    const header = headerEm(column.header, measure);
    return Math.max(header.preferred, cells.min) * TABLE_FONT_PX + 2 * padding + COLUMN_RULE_PX;
  }));
}

/** Shares the width: what each column prefers when all fit, else its minimum plus a share of the rest by what it would like more. */
function shareWidth(needs: ColumnNeeds[], available: number): number[] {
  const preferred = sum(needs.map((need) => need.preferred));
  if (preferred <= available) {
    const free = needs.filter((need) => !need.fixed);
    const flexible = sum(free.map((need) => need.preferred));
    const extra = available - preferred;
    return needs.map((need) => (need.fixed || !flexible ? need.preferred : need.preferred + (extra * need.preferred) / flexible));
  }
  const minimum = sum(needs.map((need) => need.min));
  const wish = sum(needs.map((need) => need.preferred - need.min));
  const extra = available - minimum;
  return needs.map((need) => need.min + (wish ? (extra * (need.preferred - need.min)) / wish : extra / needs.length));
}

const rounded = (widths: number[]) => widths.map((width) => Math.floor(width * 100) / 100);

/**
 * How the table prints in `available` px. `fromStep` forces a step at least
 * (the printed table asks for it when a value still overflows after layout).
 */
export function planTablePrintFit(
  columns: PrintFitColumn[],
  available: number,
  options: { fromStep?: number; measure?: TextMeasure } = {},
): TablePrintFit {
  const measure = options.measure ?? textWidthEm;
  const fromStep = Math.max(0, Math.min(options.fromStep ?? 0, TABLE_FIT_STEPS.length));
  if (!columns.length || !(available > 0)) return { kind: "natural" };
  if (fromStep === 0 && naturalTableWidth(columns, measure) <= available) return { kind: "natural" };

  for (let step = Math.max(0, fromStep - 1); step < TABLE_FIT_STEPS.length; step += 1) {
    const { fontPx, paddingPx } = TABLE_FIT_STEPS[step];
    const needs = columnNeeds(columns, fontPx, paddingPx, measure);
    if (sum(needs.map((need) => need.min)) <= available) {
      return { kind: "fit", fontPx, paddingPx, widths: rounded(shareWidth(needs, available)), fits: true, step };
    }
  }

  // Not even the floor fits: every column takes its share of the page and the values wrap.
  const step = TABLE_FIT_STEPS.length - 1;
  const { fontPx, paddingPx } = TABLE_FIT_STEPS[step];
  const needs = columnNeeds(columns, fontPx, paddingPx, measure);
  const minimum = sum(needs.map((need) => need.min));
  return { kind: "fit", fontPx, paddingPx, widths: rounded(needs.map((need) => (need.min * available) / minimum)), fits: false, step };
}

/** Width of the content of a page as the appraiser chose it: upright or on its side, less the binding margin. */
export function pageContentWidth(orientation: "portrait" | "landscape" | undefined, bindingExtraPx = 0): number {
  return (orientation === "landscape" ? LANDSCAPE_CONTENT_WIDTH_PX : PORTRAIT_CONTENT_WIDTH_PX) - bindingExtraPx;
}

/** The columns of a table as the dictamen prints them: header, printed values, figures on one line, the width set. */
export function printFitColumns(
  table: TableV2,
  formulaResults: Map<string, FormulaResult>,
  presentation: NumberPresentation = DEFAULT_NUMBER_PRESENTATION,
): PrintFitColumn[] {
  const rows = printableRows(table);
  const extraRows = new Set(table.schema?.generated?.layout.extraRows?.map((row) => row.id) ?? []);
  return printableColumns(table).map((column) => {
    const noWrap = table.schema?.columnPresentation?.[column.id]?.noWrap === true;
    const width = columnWidthOf(table, column.id);
    return {
      header: column.name.trim() || "No se proporcionó",
      // A row of the appraiser's own wraps even in a column of figures: it asks as a text.
      cells: rows.filter((row) => !noWrap || !extraRows.has(row.id)).map((row) => getCellDisplayValue(table, row.id, column.id, formulaResults, presentation)),
      ...(noWrap ? { noWrap } : {}),
      ...(width ? { width } : {}),
    };
  });
}
