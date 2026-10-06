import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { documentBlockFlowItems } from "../src/features/valuations/components/document-block-renderer";
import { splitMeasuredDocumentFlowItems, type DocumentFlowItem } from "../src/features/valuations/components/document-preview-page";
import { DocumentTable } from "../src/features/valuations/components/document-table";
import { figureColumn, generatedTable, textColumn } from "../src/features/valuations/calculation/generated-content";
import type { Apartado, Block, ContentLayout, TableContent } from "../src/features/valuations/model";
import { ensureTableV2 } from "../src/features/valuations/services/table";
import { splitTableRows, type DocumentTableFragment, type MeasuredTable } from "../src/features/valuations/services/table-pagination";

/** A table of `count` rows of 20px under a 40px header (30px where it starts, with 10px of title) and a 50px tail. */
const measuredTable = (count: number, extra: Partial<MeasuredTable> = {}): MeasuredTable => ({
  leadHeight: 40,
  headerHeight: 30,
  rowHeights: Array.from({ length: count }, () => 20),
  tailHeight: 50,
  ...extra,
});

const page = (remainingHeight: number, pageHeight = 600) => ({ remainingHeight, pageHeight, atPageTop: remainingHeight === pageHeight });
const ranges = (split: ReturnType<typeof splitTableRows>) => split.fragments.map((fragment) => [fragment.from, fragment.to]);

/* ------------------------------------------------------------------ */
/*  splitTableRows — which rows print on which page                    */
/* ------------------------------------------------------------------ */

test("a table that fits stays whole", () => {
  const split = splitTableRows(measuredTable(10), page(300));
  assert.equal(split.startsOnNewPage, false);
  assert.deepEqual(split.fragments, [{ from: 0, to: 10, height: 290, clipped: false }]);
  assert.deepEqual(split.oversizedRows, []);
});

test("a table that does not fit breaks once: the rows that fit stay, the rest continue under the header", () => {
  // 240 left: 40 of lead and 10 rows; the other 10 continue with header (30) and tail (50).
  const split = splitTableRows(measuredTable(20), page(240));
  assert.equal(split.startsOnNewPage, false);
  assert.deepEqual(split.fragments, [
    { from: 0, to: 10, height: 240, clipped: false },
    { from: 10, to: 20, height: 280, clipped: false },
  ]);
});

test("a long table runs over as many pages as it needs and loses no row", () => {
  const split = splitTableRows(measuredTable(80), page(240));
  // First page 10 rows; a whole page holds (600 - 30) / 20 = 28 rows.
  assert.deepEqual(ranges(split), [[0, 10], [10, 38], [38, 66], [66, 80]]);
  assert.equal(split.fragments.reduce((rows, fragment) => rows + fragment.to - fragment.from, 0), 80);
  assert.ok(split.fragments.every((fragment) => fragment.height <= 600 && !fragment.clipped));
  assert.equal(split.fragments.at(-1)?.height, 30 + 14 * 20 + 50);
});

test("fewer than the header and two rows do not start a table: it begins on the next page", () => {
  // 40 of lead and one row fit in 70; two would need 80.
  const short = splitTableRows(measuredTable(40), page(70));
  assert.equal(short.startsOnNewPage, true);
  assert.deepEqual(ranges(short), [[0, 28], [28, 40]]);
  // Two rows would fit in 80, but that thin head costs a page: from the top of the next one it needs two, not three.
  const thin = splitTableRows(measuredTable(40), page(80));
  assert.equal(thin.startsOnNewPage, true);
  assert.deepEqual(ranges(thin), [[0, 28], [28, 40]]);
  // A head of five rows or more is worth the break.
  const worth = splitTableRows(measuredTable(40), page(40 + 20 * 6));
  assert.equal(worth.startsOnNewPage, false);
  assert.equal(ranges(worth)[0][1], 6);

  // A table too short to leave two rows on each side moves whole.
  const tiny = splitTableRows(measuredTable(3), page(100));
  assert.equal(tiny.startsOnNewPage, true);
  assert.deepEqual(ranges(tiny), [[0, 3]]);
});

test("summary boxes and the final bar stay with the last two rows", () => {
  // All 10 rows fit in 250 (40 + 200) but the tail does not: two rows go with it.
  const split = splitTableRows(measuredTable(10), page(250));
  assert.deepEqual(split.fragments, [
    { from: 0, to: 8, height: 200, clipped: false },
    { from: 8, to: 10, height: 30 + 40 + 50, clipped: false },
  ]);

  // Four rows: two and two, never the tail alone or with a single row.
  assert.deepEqual(ranges(splitTableRows(measuredTable(4), page(125, 125))), [[0, 2], [2, 4]]);
  // With a whole page below, the four rows go there together instead of two and two.
  assert.deepEqual(ranges(splitTableRows(measuredTable(4), page(125))), [[0, 4]]);
});

test("a row taller than a page takes one, is reported, and the table goes on", () => {
  const rowHeights = [20, 20, 20, 900, 20, 20, 20];
  const split = splitTableRows(measuredTable(7, { rowHeights }), page(600));
  assert.deepEqual(ranges(split), [[0, 3], [3, 4], [4, 7]]);
  assert.deepEqual(split.oversizedRows, [3]);
  assert.deepEqual(split.fragments.map((fragment) => fragment.clipped), [false, true, false]);
  assert.equal(split.fragments[1].height, 930);

  // Even first in the table, and with nothing fitting anywhere, it ends.
  const hopeless = splitTableRows(measuredTable(3, { rowHeights: [900, 900, 900] }), page(100));
  assert.equal(hopeless.startsOnNewPage, true);
  assert.deepEqual(hopeless.oversizedRows, [0, 1]);
  assert.equal(hopeless.fragments.at(-1)?.to, 3);
  assert.equal(hopeless.fragments.reduce((rows, fragment) => rows + fragment.to - fragment.from, 0), 3);
});

test("rows that share a vertically merged cell never part", () => {
  // Rows 8 to 11 are one group: the break that would fall at 10 moves up to 8.
  const keepWithNext = Array.from({ length: 20 }, (_, row) => row >= 8 && row < 11);
  assert.deepEqual(ranges(splitTableRows(measuredTable(20, { keepWithNext }), page(240))), [[0, 8], [8, 20]]);
});

/* ------------------------------------------------------------------ */
/*  The page flow places the fragments                                 */
/* ------------------------------------------------------------------ */

const flowItem = (id: string, splittable = false): DocumentFlowItem => ({ id, node: null, renderTableFragment: splittable ? () => null : undefined });

test("the page flow breaks a table that does not fit and keeps the items around it", () => {
  const table = measuredTable(40, { columnWidths: [100, 200] });
  // The item measures its table plus 16 of gap to the item before.
  const tableHeight = 40 + 40 * 20 + 50;
  const pages = splitMeasuredDocumentFlowItems([
    { item: flowItem("antes"), height: 344 },
    { item: flowItem("tabla", true), height: tableHeight + 16, table },
    { item: flowItem("despues"), height: 100 },
  ], 600);

  // 600 - 344 - 16 of gap = 240: lead and 10 rows. Then 28 rows, then 2 with the tail.
  assert.deepEqual(pages.map((entries) => entries.map((entry) => entry.id)), [["antes", "tabla"], ["tabla"], ["tabla", "despues"]]);
  const fragments = pages.flat().filter((entry) => entry.id === "tabla").map((entry) => entry.fragment);
  assert.deepEqual(fragments, [
    { from: 0, to: 10, continuation: false, last: false, columnWidths: [100, 200] },
    { from: 10, to: 38, continuation: true, last: false, columnWidths: [100, 200] },
    { from: 38, to: 40, continuation: true, last: true, columnWidths: [100, 200] },
  ]);
});

test("a table that fits, or whose item cannot break, is placed as before", () => {
  const fits = splitMeasuredDocumentFlowItems([
    { item: flowItem("antes"), height: 100 },
    { item: flowItem("tabla", true), height: 306, table: measuredTable(10) },
  ], 600);
  assert.deepEqual(fits.map((entries) => entries.map((entry) => [entry.id, entry.fragment])), [[["antes", undefined], ["tabla", undefined]]]);

  // Two tables side by side are one atomic item: it moves whole to the next page.
  const atomic = splitMeasuredDocumentFlowItems([
    { item: flowItem("antes"), height: 400 },
    { item: flowItem("par"), height: 300 },
  ], 600);
  assert.deepEqual(atomic.map((entries) => entries.map((entry) => entry.id)), [["antes"], ["par"]]);

  // Moved whole to the next page, a short table prints unsplit.
  const moved = splitMeasuredDocumentFlowItems([
    { item: flowItem("antes"), height: 540 },
    { item: flowItem("tabla", true), height: 306, table: measuredTable(10) },
  ], 600);
  assert.deepEqual(moved.map((entries) => entries.map((entry) => [entry.id, entry.fragment])), [[["antes", undefined]], [["tabla", undefined]]]);
});

test("a table taller than a page no longer loses rows", () => {
  const pages = splitMeasuredDocumentFlowItems([{ item: flowItem("tabla", true), height: 40 + 60 * 20 + 50, table: measuredTable(60) }], 600);
  const fragments = pages.flat().map((entry) => entry.fragment!);
  assert.deepEqual(fragments.map((fragment) => [fragment.from, fragment.to]), [[0, 28], [28, 56], [56, 60]]);
  assert.ok(fragments.every((fragment) => !fragment.clipped));
});

/* ------------------------------------------------------------------ */
/*  What a fragment prints                                             */
/* ------------------------------------------------------------------ */

/** A generated table with a header group, boxes and notes; unlike the generated ones, it prints its caption. */
const longTable = (rows: number): TableContent => withCaption(generatedTable("larga", "Instalaciones",
  [figureColumn("REF"), textColumn("Concepto"), figureColumn("A", { group: "FACTORES" }), figureColumn("B", { group: "FACTORES" })],
  Array.from({ length: rows }, (_, row) => [String(row + 1), `Concepto ${row + 1}`, "1.00", "0.95"]),
  {
    summaryBoxes: [
      { id: "base", position: "top", rows: [{ label: "Lote tipo:", value: "140.00 m²" }] },
      { id: "valor", position: "bottom", rows: [{ label: "VALOR FINAL:", value: "$ 1,528,000.00", emphasis: "total" }] },
    ],
    notes: [{ position: "top", text: "Nota de arriba." }, { position: "bottom", text: "Nota de abajo." }],
  }));

function withCaption(table: TableContent): TableContent {
  const generated = ensureTableV2(table);
  return { ...generated, schema: { ...generated.schema, hideCaption: false } } as unknown as TableContent;
}

const fragment = (from: number, to: number, extra: Partial<DocumentTableFragment> = {}): DocumentTableFragment =>
  ({ from, to, continuation: from > 0, last: false, columnWidths: [40, 300, 60, 60], ...extra });

const renderFragment = (table: TableContent, part: DocumentTableFragment) =>
  renderToStaticMarkup(createElement(DocumentTable, { variant: "report", table, fragment: part }));

const printedRows = (html: string) => html.match(/<tr[^>]*data-split-table-row[^>]*>/g) ?? [];

test("every fragment repeats the header rows; what opens the table goes first and what closes it last", () => {
  const table = longTable(9);
  const [first, middle, last] = [fragment(0, 3), fragment(3, 7), fragment(7, 9, { last: true })].map((part) => renderFragment(table, part));

  for (const html of [first, middle, last]) {
    assert.match(html, /<th colSpan="2"[^>]*>FACTORES<\/th>/, "the header group row is repeated");
    assert.match(html, /<th rowSpan="2"[^>]*>REF<\/th>/);
    assert.match(html, /<th[^>]*>B<\/th>/);
    assert.match(html, /<table[^>]*class="[^"]*table-fixed/, "columns keep the widths of the whole table");
    assert.match(html, /<col style="width:300px"\/>/);
  }
  assert.deepEqual([first, middle, last].map((html) => printedRows(html).length), [3, 4, 2]);
  assert.match(middle, /Concepto 4<[\s\S]*Concepto 7</);
  assert.doesNotMatch(middle, /Concepto 3<|Concepto 8</);

  assert.match(first, /Nota de arriba\.[\s\S]*Lote tipo:/);
  assert.doesNotMatch(first, /VALOR FINAL|Nota de abajo|continúa/);
  assert.doesNotMatch(middle, /Nota de arriba|Lote tipo|VALOR FINAL|Nota de abajo/);
  assert.match(middle, /<caption[^>]*>Instalaciones \(continúa\)<\/caption>/);
  assert.doesNotMatch(last, /Nota de arriba|Lote tipo/);
  assert.match(last, /VALOR FINAL:[\s\S]*Nota de abajo\./);
});

test("gray and white rows keep alternating across the break", () => {
  const table = longTable(9);
  const gray = (html: string) => printedRows(html).map((row) => /bg-slate-100/.test(row));
  const whole = gray(renderToStaticMarkup(createElement(DocumentTable, { variant: "report", table })));
  assert.deepEqual(whole, [true, false, true, false, true, false, true, false, true]);
  const split = [fragment(0, 3), fragment(3, 7), fragment(7, 9, { last: true })].flatMap((part) => gray(renderFragment(table, part)));
  assert.deepEqual(split, whole, "a continuation that starts on an odd row starts white");
});

/* ------------------------------------------------------------------ */
/*  Which items may break                                              */
/* ------------------------------------------------------------------ */

const plainTable = (id: string, rows: number): TableContent =>
  ({ id, title: "", columns: ["#"], rows: Array.from({ length: rows }, (_, row) => [String(row + 1)]), enabled: true });

const layout = (...rows: string[][]): ContentLayout => ({
  version: 2,
  rows: rows.map((ids, rowIndex) => ({
    id: `row-${rowIndex}`,
    columns: ids.map((id, columnIndex) => ({ id: `col-${rowIndex}-${columnIndex}`, items: [{ type: "table" as const, id }] })),
  })),
});

const blockWith = (extra: Partial<Block>): Block => ({
  id: "bloque", title: "MERCADO", sectionLabel: "IX", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [], ...extra,
} as Block);

test("a table alone in its row may break; tables side by side and short ones stay whole", () => {
  const tables = [plainTable("larga", 30), plainTable("izquierda", 30), plainTable("derecha", 30), plainTable("corta", 3)];
  const apartado = { id: "ap", title: "COMPARABLES", enabled: true, concepts: [], images: [], tables, contentLayout: layout(["larga"], ["izquierda", "derecha"], ["corta"]) } as Apartado;
  const [, titled, pair, short] = documentBlockFlowItems(blockWith({ apartados: [apartado] }));
  assert.deepEqual([titled, pair, short].map((item) => Boolean(item.renderTableFragment)), [true, false, false]);

  // The apartado's title prints with the first rows only; continuations keep its indent and open the page.
  const html = (part: DocumentTableFragment) => renderToStaticMarkup(titled.renderTableFragment!(part));
  const first = html({ from: 0, to: 10, continuation: false, last: false, columnWidths: [] });
  const next = html({ from: 10, to: 30, continuation: true, last: true, columnWidths: [] });
  assert.match(first, /COMPARABLES/);
  assert.equal(printedRows(first).length, 10);
  assert.doesNotMatch(next, /COMPARABLES/);
  assert.match(next, /^<div class="pl-3"><div class="grid grid-cols-1">/);
  assert.equal(printedRows(next).length, 20);

  // A table placed directly in the block breaks too.
  const direct = documentBlockFlowItems(blockWith({ tables: [plainTable("larga", 30)], contentLayout: layout(["larga"]) }));
  assert.equal(Boolean(direct[1].renderTableFragment), true);
});
