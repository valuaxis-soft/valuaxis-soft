/**
 * The tables of a block the calculation writes, laid out like those of any
 * block (24 nov 2026, Álvaro: «si yo quiero dos tablas así… no me deja»):
 * two or three tables side by side in one row, a table moved up or down, and
 * tables of the appraiser's own added to the block. The layout is the block's
 * `contentLayout`, the same one every block prints with, and it is kept when
 * the calculation writes the block again, as the tables of his own are.
 *
 * Pure and deterministic: the same block and layout give the same result,
 * so a valuation saved before can be written again with it.
 */
import type { Block, ContentLayout, ContentLayoutItemRef, ContentLayoutRowV2, TableContent } from "../model";
import {
  CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW,
  isContentLayout,
  normalizeContentLayout,
  reconcileContentLayout,
} from "../services/content-layout";

/** What the ids of the blocks and tables a calculation writes start with (GENERATED_BLOCK_PREFIX). */
export const GENERATED_ID_PREFIX = "motor-";

/** A table the appraiser added to a block the calculation writes: it is his, the calculation never writes it. */
export const isOwnTable = (table: Pick<TableContent, "id">) => !table.id.toLowerCase().startsWith(GENERATED_ID_PREFIX);

type Container = Pick<Block, "concepts" | "tables" | "images" | "contentLayout">;

const refKey = (ref: ContentLayoutItemRef) => `${ref.type}:${ref.id.toLowerCase()}`;

/** The items of a container in their order, by type: concepts, tables, images. */
function itemsOf(container: Container): ContentLayoutItemRef[] {
  return [
    ...container.concepts.map((item) => ({ type: "concept" as const, id: item.id })),
    ...container.tables.map((item) => ({ type: "table" as const, id: item.id })),
    ...container.images.map((item) => ({ type: "image" as const, id: item.id })),
  ];
}

const rowHas = (row: ContentLayoutRowV2, key: string) => row.columns.some((column) => column.items.some((item) => refKey(item) === key));

/**
 * The layout the appraiser left on a block, over the content the calculation
 * writes now: what is gone leaves it, and what is new takes a row of its own
 * next to the item before it of its kind (a new concept after the concepts, a
 * new table after the tables), never beside a table.
 */
export function keptContentLayout(container: Container, layout: ContentLayout): ContentLayout {
  const rows = reconcileContentLayout(container, normalizeContentLayout(layout)).rows.map((row) => ({
    ...row,
    columns: row.columns.map((column) => ({ ...column, items: [...column.items] })),
  }));
  const items = itemsOf(container);
  for (const [index, item] of items.entries()) {
    const key = refKey(item);
    if (rows.some((row) => rowHas(row, key))) continue;
    const own: ContentLayoutRowV2 = { id: `r-${item.type}-${item.id}`, columns: [{ id: `c-${item.type}-${item.id}`, items: [item] }] };
    const sameKind = items.filter((other) => other.type === item.type);
    const place = sameKind.findIndex((other) => refKey(other) === key);
    const before = sameKind.slice(0, place).reverse().map(refKey).map((other) => rows.findIndex((row) => rowHas(row, other))).find((at) => at !== -1);
    const after = sameKind.slice(place + 1).map(refKey).map((other) => rows.findIndex((row) => rowHas(row, other))).find((at) => at !== -1);
    if (before !== undefined) rows.splice(before + 1, 0, own);
    else if (after !== undefined) rows.splice(after, 0, own);
    else rows.splice(item.type === "concept" ? firstRowOf(rows, items.slice(index + 1)) : rows.length, 0, own);
  }
  return { version: 2, rows };
}

/** The first row holding any of `items`, or the end. */
function firstRowOf(rows: ContentLayoutRowV2[], items: ContentLayoutItemRef[]): number {
  const keys = new Set(items.map(refKey));
  const at = rows.findIndex((row) => row.columns.some((column) => column.items.some((item) => keys.has(refKey(item)))));
  return at === -1 ? rows.length : at;
}

/**
 * The block the calculation writes now, with what the appraiser put on the
 * one before: his own tables (after the calculation's) and how the tables
 * are laid out.
 */
export function withAppraiserLayout(block: Block, previous: Block | undefined): Block {
  if (!previous) return block;
  const written = new Set(block.tables.map((table) => table.id.toLowerCase()));
  const own = previous.tables.filter((table) => isOwnTable(table) && !written.has(table.id.toLowerCase()));
  const next = own.length ? { ...block, tables: [...block.tables, ...own] } : block;
  if (!isContentLayout(previous.contentLayout)) return next;
  return { ...next, contentLayout: keptContentLayout(next, previous.contentLayout) };
}

/* ------------------------------------------------------------------ */
/*  Moving a table                                                     */
/* ------------------------------------------------------------------ */

const tableKey = (tableId: string) => refKey({ type: "table", id: tableId });
const rowOfTable = (layout: ContentLayout, tableId: string) => layout.rows.findIndex((row) => rowHas(row, tableKey(tableId)));
const onlyTables = (row: ContentLayoutRowV2) => row.columns.every((column) => column.items.every((item) => item.type === "table"));

function cloneRows(layout: ContentLayout): ContentLayoutRowV2[] {
  return layout.rows.map((row) => ({ ...row, columns: row.columns.map((column) => ({ ...column, items: [...column.items] })) }));
}

/** The row of tables right before the table's, where it can sit beside them; null when there is none or it is full. */
function rowBefore(layout: ContentLayout, tableId: string): number | null {
  const at = rowOfTable(layout, tableId);
  if (at <= 0) return null;
  const row = layout.rows[at - 1];
  return onlyTables(row) && row.columns.length < CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW ? at - 1 : null;
}

/** What can be done with a table of the block: put it beside the table before it, on a row of its own, or move it up or down. */
export function tablePlacement(layout: ContentLayout, tableId: string) {
  const at = rowOfTable(layout, tableId);
  const row = layout.rows[at];
  return {
    beside: at !== -1 && (row?.columns.length ?? 0) === 1 && rowBefore(layout, tableId) !== null,
    alone: at !== -1 && (row?.columns.length ?? 0) > 1,
    up: at > 0,
    down: at !== -1 && at < layout.rows.length - 1,
  };
}

/** The table beside the tables of the row before it: two (or three) tables side by side. */
export function placeTableBeside(layout: ContentLayout, tableId: string): ContentLayout {
  const target = rowBefore(layout, tableId);
  const at = rowOfTable(layout, tableId);
  if (target === null || layout.rows[at].columns.length !== 1) return layout;
  const rows = cloneRows(layout);
  const [moved] = rows[at].columns;
  rows[target].columns.push(moved);
  rows.splice(at, 1);
  return { version: 2, rows };
}

/** The table on a row of its own, right after the one it shared. */
export function placeTableAlone(layout: ContentLayout, tableId: string): ContentLayout {
  const at = rowOfTable(layout, tableId);
  if (at === -1 || layout.rows[at].columns.length < 2) return layout;
  const rows = cloneRows(layout);
  const index = rows[at].columns.findIndex((column) => column.items.some((item) => refKey(item) === tableKey(tableId)));
  const [moved] = rows[at].columns.splice(index, 1);
  rows.splice(at + 1, 0, { id: `r-table-${tableId}`, columns: [moved] });
  return { version: 2, rows: uniqueRowIds(rows) };
}

/** The table's row one place up or down, with what shares it. */
export function moveTableRow(layout: ContentLayout, tableId: string, direction: -1 | 1): ContentLayout {
  const at = rowOfTable(layout, tableId);
  const to = at + direction;
  if (at === -1 || to < 0 || to >= layout.rows.length) return layout;
  const rows = cloneRows(layout);
  [rows[at], rows[to]] = [rows[to], rows[at]];
  return { version: 2, rows };
}

/** Row ids stay unique: a row split again takes a numbered id. */
function uniqueRowIds(rows: ContentLayoutRowV2[]): ContentLayoutRowV2[] {
  const used = new Set<string>();
  return rows.map((row) => {
    let id = row.id;
    for (let n = 2; used.has(id); n += 1) id = `${row.id}-${n}`;
    used.add(id);
    return id === row.id ? row : { ...row, id };
  });
}
