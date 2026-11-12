/**
 * How the tables print and how they are set (videos 5.3, 5.4 and 5.7 of
 * November 2026): the rules of a double header, white rules as thick as the
 * apartado's, one size of letter in every table, the comparables'
 * characteristics centered with rules between columns, "Formato de la tabla"
 * (title shown, room, indent, alignment) in every table, and "Unidades de
 * valor" plus "Decimales" in the cells, as in the concepts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { figureColumn, generatedTable, textColumn } from "../src/features/valuations/calculation/generated-content";
import { applyTableLayout, layoutOf, withTableFormat, withTableLayouts } from "../src/features/valuations/calculation/generated-table-layout";
import { MarketCharacteristicsTable } from "../src/features/valuations/components/calculation/market-characteristics-table";
import { DocumentTable } from "../src/features/valuations/components/document-table";
import { DocumentThemeProvider } from "../src/features/valuations/components/document-theme";
import { TableFormatControl } from "../src/features/valuations/components/editor/table-format-control";
import { PagePresentationProvider } from "../src/features/valuations/components/page-presentation-context";
import type { Block, TableContent } from "../src/features/valuations/model";
import { DEFAULT_PAGE_PRESENTATION } from "../src/features/valuations/services/page-presentation";
import {
  ensureTableV2,
  groupTableHeaders,
  setCellResultFormat,
  setColumnFormat,
  setTableCaptionShown,
  setTablePrintLayout,
  setTableWidthMode,
  tablePrintLayout,
  tableValueDecimals,
  tableValueFormat,
  tableValueUnit,
  type TableV2,
} from "../src/features/valuations/services/table";
import { tableContextMenu } from "../src/features/valuations/services/table-context-menu";
import { evaluateTableFormulas, getCellDisplayValue } from "../src/features/valuations/services/table-formula-engine";
import { decodeStoredTable, decodeTableCell, encodeTableCell, serializeTableForSave } from "../src/features/valuations/services/table-persistence";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

const asContent = (table: TableV2) => table as unknown as TableContent;

const printed = (node: ReactNode) =>
  renderToStaticMarkup(
    <PagePresentationProvider presentation={DEFAULT_PAGE_PRESENTATION}>
      <DocumentThemeProvider variant="standard">{node}</DocumentThemeProvider>
    </PagePresentationProvider>,
  );

const report = (table: TableV2 | TableContent, fragment?: Parameters<typeof DocumentTable>[0]["fragment"]) =>
  printed(<DocumentTable table={table as TableContent} variant="report" fragment={fragment} />);

/** A table of invented data: columns by name, rows of text. */
function tableOf(columns: string[], rows: string[][], title = "Tipos de construcción"): TableV2 {
  return ensureTableV2({
    id: "t", title, version: 2,
    columns: columns.map((name, index) => ({ id: `c${index + 1}`, name })),
    rows: rows.map((row, rowIndex) => ({
      id: `r${rowIndex + 1}`,
      cells: Object.fromEntries(row.map((value, index) => [`c${index + 1}`, { kind: "value" as const, value }])),
    })),
  });
}

/** The header cells as printed: their text and their classes. */
const headerCells = (html: string) =>
  [...html.matchAll(/<th\s[^>]*class="([^"]*)"[^>]*>(?:<span[^>]*>)?([^<]*)/g)].map(([, classes, text]) => ({ text, classes: classes.split(" ") }));

/* ------------------------------------------------------------------ */
/*  V5.4-02: the rule after the columns of a double header              */
/* ------------------------------------------------------------------ */

test("V5.4-02: with a double header, the last column under the group keeps its rule when another column follows", () => {
  // As in the video: «gf» over Ref. and Tipo, then Descripción, Clasificación…
  const table = groupTableHeaders(tableOf(["Ref.", "Tipo", "Descripción", "Edad"], [["T-1", "Casa", "Dos niveles", "12"]]), "c1", "c2", "gf");
  const cells = headerCells(report(table));
  const tipo = cells.find((cell) => cell.text === "Tipo")!;
  assert.ok(tipo.classes.includes("border-r-2"), "the rule between Tipo and Descripción");
  assert.ok(!tipo.classes.includes("last:border-r-0"), "it is the last of its row, not of the table");
  const edad = cells.find((cell) => cell.text === "Edad")!;
  assert.ok(edad.classes.includes("last:border-r-0"), "the last column of the table has no rule at the frame");

  // A group that closes the table: its last column is the edge.
  const closing = groupTableHeaders(tableOf(["Ref.", "Tipo", "Edad"], [["T-1", "Casa", "12"]]), "c2", "c3", "Datos");
  const last = headerCells(report(closing)).find((cell) => cell.text === "Edad")!;
  assert.ok(last.classes.includes("last:border-r-0"));
});

/* ------------------------------------------------------------------ */
/*  V5.4-03: rules and one size of letter                              */
/* ------------------------------------------------------------------ */

test("V5.4-03: the header rules are white and 2px, as the rule under the apartado titles", () => {
  const html = report(groupTableHeaders(tableOf(["Ref.", "Tipo", "Edad"], [["T-1", "Casa", "12"]]), "c1", "c2", "gf"));
  for (const cell of headerCells(html)) {
    assert.ok(cell.classes.includes("border-white"), `${cell.text}: white`);
    assert.ok(cell.classes.includes("border-r-2"), `${cell.text}: 2px`);
    assert.ok(!cell.classes.includes("border-r"), `${cell.text}: no 1px rule left`);
  }
  assert.match(html, /<th colSpan="2" class="[^"]*border-b-2/i, "the rule under the group title, 2px too");
});

test("V5.4-03: every table prints its letters at one size, the concepts' 11px, whatever its columns", () => {
  const sizes = (html: string) => [...html.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map(([, size]) => size);
  const narrow = report(tableOf(["A", "B"], [["1", "2"]]));
  const wide = report(tableOf(Array.from({ length: 14 }, (_, index) => `C${index}`), [Array.from({ length: 14 }, () => "1")]));
  const calculated = report(generatedTable("g", "G", [textColumn("Ref."), figureColumn("Valor")], [["1", "2.5"]], {
    summaryBoxes: [{ id: "box", position: "bottom", rows: [{ label: "Total", value: "2.5" }] }],
  }));
  for (const html of [narrow, wide, calculated]) assert.deepEqual([...new Set(sizes(html))], ["11"]);
});

/* ------------------------------------------------------------------ */
/*  V5.4-01: the comparables' characteristics                          */
/* ------------------------------------------------------------------ */

test("V5.4-01: the characteristics of the comparables are centered, with a rule between every column", () => {
  const comparable = { id: "cmp-1", reference: "1", characteristics: { usoSuelo: { text: "H4" }, frentes: { value: 1, text: "1" } } };
  const html = renderToStaticMarkup(
    <MarketCharacteristicsTable
      fields={[{ key: "usoSuelo", label: "USO DE SUELO" }, { key: "frentes", label: "N. FRENTES" }]}
      defaults
      subject={{ usoSuelo: "H4" }}
      comparables={[comparable] as never}
      readOnly={false}
      onFields={() => {}}
      onSubject={() => {}}
      onComparable={() => {}}
    />,
  );
  const cells = [...html.matchAll(/<td class="([^"]*)"/g)].map(([, classes]) => classes.split(" "));
  assert.ok(cells.length > 4);
  for (const classes of cells) assert.ok(classes.includes("border-x"), "a rule on each side");
  const inputs = [...html.matchAll(/<input[^>]*aria-label="([^"]*)"[^>]*class="([^"]*)"/g)];
  const values = inputs.filter(([, label]) => !label.startsWith("Texto libre") && / del sujeto|, comparable /.test(label));
  assert.ok(values.length >= 4);
  for (const [, label, classes] of values) {
    assert.ok(classes.includes("text-center"), `${label}: centered`);
    assert.ok(!classes.split(" ").includes("text-right"), `${label}: not to the right`);
  }
});

/* ------------------------------------------------------------------ */
/*  V5.3-03/04, V5.7-11/12: "Formato de la tabla" in every table        */
/* ------------------------------------------------------------------ */

test("V5.3-03: the title of a table is printed or only names it, as the appraiser chooses", () => {
  const table = tableOf(["Ref.", "Edad"], [["T-1", "12"]], "Tipos de construcción");
  assert.match(report(table), /Tipos de construcción/);
  const hidden = setTableCaptionShown(table, false);
  assert.equal(hidden.schema?.hideCaption, true);
  assert.doesNotMatch(report(hidden), /Tipos de construcción/);
  assert.equal(setTableCaptionShown(hidden, true).schema?.hideCaption, undefined, "shown is the default, not stored");
});

test("V5.3-04, V5.7-11 and V5.7-12: room before and after, indent and alignment print as set", () => {
  const table = setTablePrintLayout(setTableWidthMode(tableOf(["Ref.", "Edad"], [["T-1", "12"]]), "content"), { spacingBefore: 12, spacingAfter: 24, indent: 36, align: "center" });
  assert.deepEqual(tablePrintLayout(table), { spacingBefore: 12, spacingAfter: 24, indent: 36, align: "center" });
  const html = report(table);
  assert.match(html, /padding-top:12px/);
  assert.match(html, /padding-bottom:24px/);
  assert.match(html, /padding-left:36px/);
  assert.match(html, /<table class="[^"]*mx-auto/, "narrower than the page, centered");
  assert.match(report(setTablePrintLayout(table, { align: "right" })), /<table class="[^"]*ml-auto/);

  // A table that breaks across pages: the room before goes with its first rows, the room after with its last ones.
  const opening = report(table, { from: 0, to: 1, continuation: false, last: false, columnWidths: [] });
  assert.match(opening, /padding-top:12px/);
  assert.doesNotMatch(opening, /padding-bottom/);
  const closing = report(table, { from: 0, to: 1, continuation: true, last: true, columnWidths: [] });
  assert.doesNotMatch(closing, /padding-top/);
  assert.match(closing, /padding-bottom:24px/);

  // Back to the defaults: nothing stored.
  const reset = setTablePrintLayout(table, { spacingBefore: 0, spacingAfter: null, indent: 0, align: "left" });
  assert.deepEqual(tablePrintLayout(reset), {});
  for (const key of ["spacingBefore", "spacingAfter", "indent", "align"] as const) assert.equal(reset.schema?.[key], undefined);
  // Out of range: kept within the page.
  assert.deepEqual(tablePrintLayout(setTablePrintLayout(table, { spacingBefore: -5, indent: 9_999 })), { spacingAfter: 24, indent: 240, align: "center" });
});

test("the format of the table is saved with it and comes back on reload (no migration)", () => {
  const table = setTableCaptionShown(setTablePrintLayout(tableOf(["Ref."], [["T-1"]]), { spacingAfter: 16, indent: 20, align: "right" }), false);
  const onServer = ensureTableV2(serializeTableForSave(asContent(table)));
  const reloaded = decodeStoredTable({
    id: onServer.id, title: onServer.title, enabled: true, schema: JSON.parse(JSON.stringify(onServer.schema)), columns: onServer.columns,
    rows: onServer.rows.map((row) => ({
      id: row.id,
      cells: onServer.columns.map((column) => {
        const stored = encodeTableCell(row.cells[column.id]);
        return { text: stored.text, numeric: null, boolean: null, date: null, complex: stored.complex, calculated: stored.calculated };
      }),
    })),
  });
  assert.deepEqual(tablePrintLayout(reloaded), { spacingAfter: 16, indent: 20, align: "right" });
  assert.equal(reloaded.schema?.hideCaption, true);
});

test("a table the calculation writes takes the same format, and the next calculation keeps it", () => {
  const written = () => generatedTable("motor-mercado-homologacion", "Homologación", [textColumn("Ref."), figureColumn("FRe")], [["1", "0.95"]]);
  assert.equal(ensureTableV2(written()).schema?.hideCaption, true, "the calculation prints it without a title");
  const layout = withTableFormat(layoutOf(written()), { hideCaption: false, print: { spacingBefore: 8, indent: 24, align: "center" } });
  const block = { id: "b", title: "Mercado", concepts: [], images: [], apartados: [], tables: [applyTableLayout(written(), layout)] } as unknown as Block;
  const [again] = withTableLayouts([{ ...block, tables: [written()] }], [block]);
  const table = ensureTableV2(again.tables[0]);
  assert.equal(table.schema?.hideCaption, undefined, "its title prints now");
  assert.deepEqual(tablePrintLayout(table), { spacingBefore: 8, indent: 24, align: "center" });
  assert.match(report(table), /Homologación/);
  assert.match(report(table), /padding-left:24px/);
  // Back to the calculation's.
  const back = applyTableLayout(table, withTableFormat(layoutOf(table), { hideCaption: null, print: { spacingBefore: null, indent: null, align: null } }));
  assert.equal(ensureTableV2(back).schema?.hideCaption, true);
  assert.deepEqual(tablePrintLayout(ensureTableV2(back)), {});
});

test("«Formato de la tabla» offers the title, room, indent and alignment in every table", () => {
  const html = renderToStaticMarkup(<TableFormatControl table={tableOf(["A"], [["1"]])} readOnly={false} onChange={() => {}} />);
  assert.match(html, /aria-label="Formato de la tabla"/);
  assert.match(html, /título, ancho, espacio, sangría/);
});

/* ------------------------------------------------------------------ */
/*  V5.7-16: "Unidades de valor" and "Decimales" in the cells           */
/* ------------------------------------------------------------------ */

test("V5.7-16: a cell or a column takes the concepts' units, and its decimals apart", () => {
  const table = tableOf(["Lado", "Medida", "Superficie", "Precio"], [["Norte", "12.5", "120.456", "1500000"]], "Medidas y colindancias");
  const shown = (v2: TableV2, column: string) => getCellDisplayValue(v2, "r1", column, evaluateTableFormulas(v2));

  // The unit: "m" and "m²" print as the concepts print them.
  let next = setColumnFormat(table, "c2", tableValueFormat({ kind: "unit", unit: "m" }, undefined));
  assert.equal(shown(next, "c2"), "12.50 m");
  next = setColumnFormat(next, "c3", tableValueFormat({ kind: "unit", unit: "m2" }, undefined));
  assert.equal(shown(next, "c3"), "120.46 m²");
  // The decimals change without losing the unit; the unit changes without losing the decimals.
  const m2 = next.columns[2].format;
  next = setColumnFormat(next, "c3", tableValueFormat(tableValueUnit(m2), 0));
  assert.equal(shown(next, "c3"), "120 m²");
  next = setColumnFormat(next, "c3", tableValueFormat({ kind: "unit", unit: "ha" }, tableValueDecimals(next.columns[2].format)));
  assert.equal(shown(next, "c3"), "120 ha");
  // Money with the legal tender mark, and a unit of the firm.
  next = setCellResultFormat(next, "r1", "c4", tableValueFormat({ kind: "unit", unit: "mxn-mn" }, undefined));
  assert.equal(shown(next, "c4"), "$1,500,000.00 M.N.");
  next = setColumnFormat(next, "c2", tableValueFormat({ kind: "firm", unit: "ml" }, 1));
  assert.equal(shown(next, "c2"), "12.5 ml");
  assert.deepEqual(tableValueUnit(next.columns[1].format), { kind: "firm", unit: "ml" });

  // Automático is the default, in both.
  assert.equal(tableValueFormat({ kind: "auto" }, undefined), null);
  assert.deepEqual(tableValueFormat({ kind: "auto" }, 2), { type: "number", precision: 2 });
  assert.deepEqual(tableValueUnit(undefined), { kind: "auto" });
  assert.equal(tableValueDecimals(undefined), undefined);
});

test("a value with units of its own is saved in one column, as the database requires, and comes back whole", () => {
  // The cell check `devpware_celdas_tablas_documentos_un_valor_check` takes one value: text and format together were rejected.
  const format = tableValueFormat({ kind: "unit", unit: "m2" }, 2)!;
  const stored = encodeTableCell({ kind: "value", value: "120.456", format });
  assert.equal([stored.text, stored.complex].filter((value) => value !== null).length, 1);
  const back = decodeTableCell({ text: stored.text, numeric: null, boolean: null, date: null, complex: JSON.parse(JSON.stringify(stored.complex)), calculated: false });
  assert.deepEqual(back, { kind: "value", value: "120.456", format });
  // Saved before, with the text in its own column: still read.
  assert.deepEqual(decodeTableCell({ text: "98.2", numeric: null, boolean: null, date: null, complex: { kind: "value", format }, calculated: false }), { kind: "value", value: "98.2", format });
  // Without a format the text stays in its column.
  assert.deepEqual(encodeTableCell({ kind: "value", value: "Norte" }), { text: "Norte", complex: null, calculated: false });
});

test("V5.7-16 and UNI-04: the right click on a value opens «Unidades de valor» and «Decimales» right there", () => {
  const cell = tableContextMenu("editable", { kind: "cell", editable: true, hasFormula: false, canPaste: true, canInsertRow: true, canInsertColumn: true, canDeleteColumn: true, canDeleteRow: true });
  const items = cell.flat();
  assert.equal(items.find((entry) => entry.label === "Unidades de valor")?.submenu, "units");
  assert.equal(items.find((entry) => entry.label === "Decimales")?.submenu, "decimals");
  assert.ok(!items.some((entry) => entry.label.startsWith("Formato del valor")), "renamed as the appraiser asked");
  const column = tableContextMenu("editable", { kind: "column", canInsertBeside: true, canRename: true, canMoveLeft: true, canMoveRight: true, canDelete: true, hidden: false, canHide: true }).flat();
  assert.equal(column.find((entry) => entry.action === "column-format")?.submenu, "units");
  assert.equal(column.find((entry) => entry.action === "column-decimals")?.submenu, "decimals");
});
