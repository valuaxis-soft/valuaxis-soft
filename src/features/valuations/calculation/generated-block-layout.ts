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
  const withOwn = own.length ? { ...block, tables: [...block.tables, ...own] } : block;
  // The tables of each subbloque (a market's data, its homologation) keep how they were arranged too.
  const before = new Map(previous.apartados.map((apartado) => [apartado.id.toLowerCase(), apartado]));
  const apartados = withOwn.apartados.map((apartado) => {
    const kept = before.get(apartado.id.toLowerCase())?.contentLayout;
    return isContentLayout(kept) ? { ...apartado, contentLayout: keptContentLayout(apartado, kept) } : apartado;
  });
  const next = apartados.some((apartado, index) => apartado !== withOwn.apartados[index]) ? { ...withOwn, apartados } : withOwn;
  if (!isContentLayout(previous.contentLayout)) return next;
  return { ...next, contentLayout: keptContentLayout(next, previous.contentLayout) };
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

/* ------------------------------------------------------------------ */
/*  The tables' rows, dragged as in any block                          */
/* ------------------------------------------------------------------ */

/**
 * The rows of a block's layout that hold only tables of `tableIds` (the ones
 * the editor lays out among themselves): what is dragged, side by side or to
 * another row, exactly as the tables of any block (video 8.10, 25:40).
 */
export function tableRowsOf(layout: ContentLayout, tableIds: ReadonlySet<string>): ContentLayout {
  const ids = new Set([...tableIds].map((id) => id.toLowerCase()));
  const movable = (row: ContentLayoutRowV2) => row.columns.length > 0
    && row.columns.every((column) => column.items.length > 0 && column.items.every((item) => item.type === "table" && ids.has(item.id.toLowerCase())));
  return { version: 2, rows: layout.rows.filter(movable) };
}

/**
 * The block's layout with its rows of tables as they were arranged
 * (`tables`, from `tableRowsOf`): the rows of concepts and of other content
 * stay where they were, and the rows of tables take the place of the first
 * of them.
 */
export function withTableRows(layout: ContentLayout, tables: ContentLayout, tableIds: ReadonlySet<string>): ContentLayout {
  const before = new Set(tableRowsOf(layout, tableIds).rows);
  const at = layout.rows.findIndex((row) => before.has(row));
  const kept = layout.rows.filter((row) => !before.has(row));
  const place = at === -1 ? kept.length : layout.rows.slice(0, at).filter((row) => !before.has(row)).length;
  return { version: 2, rows: uniqueRowIds([...kept.slice(0, place), ...tables.rows, ...kept.slice(place)]) };
}
