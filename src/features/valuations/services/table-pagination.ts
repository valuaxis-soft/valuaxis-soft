/**
 * Splits a table of the printed document across pages by rows.
 *
 * Pure: it takes the heights measured in the browser and answers which rows
 * print on which page. The header is repeated on every continuation; what
 * closes the table (summary boxes, notes, the final value bar) stays with the
 * last rows.
 */

/** Rows a table must show under its header before it may break. */
export const MIN_ROWS_BEFORE_BREAK = 2;
/** A head shorter than this is only worth a break when it saves a page. */
export const MIN_HEAD_ROWS_WORTH_A_BREAK = 5;
/** Rows that stay with whatever closes the table. */
export const MIN_ROWS_WITH_TAIL = 2;

/** The rows of a table one page prints, and how to dress them. */
export type DocumentTableFragment = {
  /** First row printed (index in the table's rows). */
  from: number;
  /** One past the last row printed. */
  to: number;
  /** Not the first fragment: it repeats the header and leaves out what opens the table. */
  continuation: boolean;
  /** Carries what closes the table. */
  last: boolean;
  /** Widths in px of the columns of the whole table, so every fragment keeps them. Empty: left to the browser. */
  columnWidths: number[];
  /** Taller than a page even alone: its end is cut. */
  clipped?: boolean;
};

export type MeasuredTable = {
  /** Everything above the first row where the table starts: titles, notes, top boxes, caption and header. */
  leadHeight: number;
  /** Caption and header rows, as repeated on top of a continuation. */
  headerHeight: number;
  rowHeights: number[];
  /** Everything below the last row: summary boxes, notes, the final value bar. */
  tailHeight: number;
  /** keepWithNext[i]: rows i and i + 1 share a vertically merged cell and never part. */
  keepWithNext?: boolean[];
  columnWidths?: number[];
};

export type TableRowsFragment = {
  from: number;
  to: number;
  height: number;
  /** Does not fit the page even alone on it. */
  clipped: boolean;
};

export type TableSplit = {
  /** Not even the minimum fits in the space left: the table starts on the next page. */
  startsOnNewPage: boolean;
  /** One per page, in order. A single fragment is the whole table. */
  fragments: TableRowsFragment[];
  /** Rows taller than a page: they take one and are cut at its end. */
  oversizedRows: number[];
};

export function splitTableRows(
  table: MeasuredTable,
  space: {
    /** Height left on the page where the table would start. */
    remainingHeight: number;
    /** Height of an empty page. */
    pageHeight: number;
    /** Nothing precedes the table on its page. */
    atPageTop: boolean;
  },
): TableSplit {
  const startsHere = planFragments(table, space.remainingHeight, space.pageHeight, space.atPageTop);
  const startsFresh = () => ({ startsOnNewPage: true, ...planFragments(table, space.pageHeight, space.pageHeight, true)! });
  if (!startsHere) return startsFresh();
  if (space.atPageTop) return { startsOnNewPage: false, ...startsHere };
  // A thin head that saves no page reads badly: a table that needs fewer pages from the
  // top of the next one is not left with a couple of rows at the bottom of this one.
  const [head] = startsHere.fragments;
  if (startsHere.fragments.length > 1 && head.to - head.from < MIN_HEAD_ROWS_WORTH_A_BREAK) {
    const fresh = startsFresh();
    if (fresh.fragments.length < startsHere.fragments.length) return fresh;
  }
  return { startsOnNewPage: false, ...startsHere };
}

function planFragments(
  table: MeasuredTable,
  firstCapacity: number,
  pageHeight: number,
  atPageTop: boolean,
): Pick<TableSplit, "fragments" | "oversizedRows"> | null {
  const { rowHeights, tailHeight, keepWithNext } = table;
  const count = rowHeights.length;
  const fragments: TableRowsFragment[] = [];
  const oversizedRows: number[] = [];
  /** End of the group of merged rows that starts at `row`. */
  const groupEnd = (row: number) => {
    let end = row + 1;
    while (end < count && keepWithNext?.[end - 1]) end += 1;
    return end;
  };

  let from = 0;
  let capacity = firstCapacity;
  let headHeight = table.leadHeight;
  if (!count) {
    const height = headHeight + tailHeight;
    return atPageTop || height <= capacity ? { fragments: [{ from: 0, to: 0, height, clipped: height > capacity }], oversizedRows } : null;
  }

  while (from < count) {
    const first = from === 0;
    let fit = from;
    let height = headHeight;
    while (fit < count && height + rowHeights[fit] <= capacity) {
      height += rowHeights[fit];
      fit += 1;
    }
    if (fit === count && height + tailHeight <= capacity) {
      fragments.push({ from, to: count, height: height + tailHeight, clipped: false });
      break;
    }

    // It breaks here: the last rows are kept for the tail, and merged rows stay whole.
    let to = Math.min(fit, count - MIN_ROWS_WITH_TAIL);
    while (to > from && keepWithNext?.[to - 1]) to -= 1;
    const onFreshPage = !first || atPageTop;

    if (to >= from + (onFreshPage ? 1 : MIN_ROWS_BEFORE_BREAK)) {
      // Rows from..to fit and enough of them remain for the tail.
    } else if (!onFreshPage) {
      return null;
    } else if (fit === from || groupEnd(from) > fit) {
      // Not even the first row (or its merged group) fits an empty page: it takes the page.
      to = groupEnd(from);
      for (let row = from; row < to; row += 1) oversizedRows.push(row);
      // Alone it would leave the tail with too few rows of a table that is cut anyway: close it here.
      if (count - to < MIN_ROWS_WITH_TAIL && to < count) to = count;
    } else {
      // The few rows left and the tail do not fit one page together: they stay together and are cut.
      to = count;
    }

    let fragmentHeight = headHeight;
    for (let row = from; row < to; row += 1) fragmentHeight += rowHeights[row];
    if (to === count) fragmentHeight += tailHeight;
    fragments.push({ from, to, height: fragmentHeight, clipped: fragmentHeight > capacity });

    from = to;
    capacity = pageHeight;
    headHeight = table.headerHeight;
  }

  return { fragments, oversizedRows };
}
