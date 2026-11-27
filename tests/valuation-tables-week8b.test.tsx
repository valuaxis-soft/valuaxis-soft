/**
 * Videos 8.13 and 8.14 (Álvaro, 27 nov 2026), the mechanics every table of
 * the editor and of the calculation shares:
 *  - 8.13, 00:10: a space typed at the end of a table's title was lost
 *    («Homologacióndeinmuebles»);
 *  - 8.13, 20:46: after adding a factor, the homologation table's headers no
 *    longer matched its figures (FRe over the homologated value, the «valor
 *    unitario resultante» lost): what is set on a column follows the column;
 *  - 8.13, 22:00–25:05: a column taken out of a double header or put into it
 *    without dragging it through every column, the whole group moved as one,
 *    and the double header's columns (from–to) changed in «Formato de la tabla»;
 *  - 8.13, 25:45: no row handle where the rows cannot be moved;
 *  - 8.13, 01:27: the statistics reordered by dragging, not with arrows;
 *  - 8.14, 20:44: «Mostrar el título en el dictamen» with its check, and
 *    unchecking it hides the title of the income tables.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { figureColumn, generatedTable, moneyColumn, resultantColumn } from "../src/features/valuations/calculation/generated-content";
import {
  applyTableLayout,
  carriedLayout,
  editGeneratedTable,
  layoutOf,
  movedColumns,
  sourceOf,
  withTableLayouts,
} from "../src/features/valuations/calculation/generated-table-layout";
import { incomeCaptureBlocks } from "../src/features/valuations/calculation/income-document";
import { DEFAULT_INCOME, type IncomeCalculationDto } from "../src/features/valuations/calculation/income-types";
import { StatisticsTable } from "../src/features/valuations/components/calculation/market-statistics-table";
import { steppedIds } from "../src/features/valuations/components/calculation/sortable-rows";
import { DocumentTable } from "../src/features/valuations/components/document-table";
import { GeneratedTableEditor } from "../src/features/valuations/components/editor/generated-table-editor";
import { TableEditorItem } from "../src/features/valuations/components/editor/table-editor";
import type { Block, TableContent } from "../src/features/valuations/model";
import { buildFormulaIndex, compileFormula } from "../src/features/valuations/services/formula-references";
import {
  ensureTableV2,
  getDisplayColumns,
  getTableHeaderLayout,
  groupTableHeaders,
  headerGroupChoice,
  headerGroupColumns,
  headerGroupEdge,
  insertTableColumnBeside,
  insertTableRow,
  moveColumnIntoHeaderGroup,
  moveColumnOutOfHeaderGroup,
  moveHeaderGroupBy,
  moveHeaderGroupTo,
  moveTableColumnBeside,
  moveTableColumnTo,
  printableColumns,
  removeTableColumn,
  renameTableColumn,
  setCellFormula,
  setColumnWidth,
  setHeaderGroupRange,
  setTableCaptionShown,
  type TableV2,
} from "../src/features/valuations/services/table";
import { tableContextMenu, withTableFormatGroup } from "../src/features/valuations/services/table-context-menu";
import { evaluateTableFormulas, getCellDisplayValue } from "../src/features/valuations/services/table-formula-engine";

const TABLE_ID = "motor-mercado-inmueble_renta-enfoque-tabla-homologacion";
const FACTORS = "FACTORES DE HOMOLOGACIÓN";

/** A market's homologation as the calculation writes it: the factors by their place (col-5…), then FRe and the homologated value. */
function homologation(factors: Array<[string, string[]]>) {
  return generatedTable(TABLE_ID, "Homologación",
    [
      figureColumn("REF"), moneyColumn("RENTA MENSUAL $"), figureColumn("SUP. RENTABLE (m²)"), moneyColumn("Renta unitaria $/m²/mes"),
      ...factors.map(([name]) => figureColumn(name, { group: FACTORS })),
      resultantColumn("FRe", FACTORS),
      moneyColumn("Renta unitaria homologada $/m²/mes"),
    ],
    ["1", "2"].map((reference, row) => [
      reference, row ? "$ 34,000.00" : "$ 40,000.00", row ? "325.00" : "300.00", row ? "$ 104.62" : "$ 133.33",
      ...factors.map(([, values]) => values[row]),
      row ? "0.94" : "0.96",
      row ? "$ 98.34" : "$ 128.00",
    ]),
    { rowKeys: ["1", "2"] });
}

const THREE: Array<[string, string[]]> = [["Neg.", ["0.95", "0.95"]], ["Ubic.", ["1.00", "1.00"]], ["Zona", ["1.10", "1.10"]]];
const FOUR: Array<[string, string[]]> = [...THREE.slice(0, 2), ["Cal.", ["1.00", "1.06"]], THREE[2]];

const edit = (table: TableContent, change: (table: TableV2) => TableV2) =>
  editGeneratedTable(table, (current) => ({ ...change(ensureTableV2(current)), version: 2 }) as unknown as TableContent);
const idOf = (table: TableContent | TableV2, name: string) => ensureTableV2(table).columns.find((column) => column.name === name)!.id;
const block = (table: TableContent): Block => ({
  id: "motor-mercado", title: "MERCADO", sectionLabel: "", enabled: true, required: false, concepts: [], images: [], apartados: [], tables: [table],
});

/** Each header as shown with the figure under it in the first row: what the appraiser reads. */
function headedFigures(table: TableContent) {
  const v2 = ensureTableV2(table);
  const results = evaluateTableFormulas(v2);
  return Object.fromEntries(getDisplayColumns(v2).map((column) => [column.name, getCellDisplayValue(v2, v2.rows[0].id, column.id, results)]));
}

/** The double headers as shown: each title with the names of the columns under it. */
function groupsShown(table: TableContent | TableV2) {
  const v2 = ensureTableV2(table);
  return (v2.schema?.headerGroups ?? []).map((group) => [group.title, headerGroupColumns(v2, group.id).map((id) => v2.columns.find((column) => column.id === id)!.name)]);
}

/* ── 8.13, 00:10: the title takes its spaces ─────────────────────────── */

test("8.13 00:10: a table the calculation writes keeps the space typed at the end of its title, key by key", () => {
  let table = homologation(THREE);
  let typed = "Homologación";
  for (const key of " de inmuebles") {
    typed += key;
    table = edit(table, (v2) => ({ ...v2, title: typed }));
    assert.equal(ensureTableV2(table).title, typed, `after «${key}»`);
  }
  assert.equal(ensureTableV2(table).title, "Homologación de inmuebles");
  // The dictamen prints it trimmed; emptied, the calculation's title comes back.
  const shown = edit(table, (v2) => setTableCaptionShown({ ...v2, title: "Homologación de inmuebles " }, true));
  assert.match(renderToStaticMarkup(createElement(DocumentTable, { variant: "report", table: shown })), />Homologación de inmuebles</);
  assert.equal(ensureTableV2(edit(table, (v2) => ({ ...v2, title: "  " }))).title, "Homologación");
});

/* ── 8.13, 20:46: what is set on a column follows the column ───────────── */

test("8.13 20:46: a factor added moves the columns after it, and their names, widths, order and groups follow them", () => {
  let table = homologation(THREE);
  const value = idOf(table, "Renta unitaria homologada $/m²/mes");
  table = edit(table, (v2) => renameTableColumn(v2, value, "Valor unitario resultante"));
  table = edit(table, (v2) => setColumnWidth(v2, idOf(table, "FRe"), 90));
  // «Zona» taken out of the group, beside it.
  table = edit(table, (v2) => moveColumnOutOfHeaderGroup(v2, idOf(table, "Zona")));
  const before = headedFigures(table);
  assert.equal(before["Valor unitario resultante"], "$ 128.00");
  assert.equal(before.FRe, "0.96");

  // The calculation writes the table again with «Cal.» among the factors: FRe and the value take other ids.
  const [again] = withTableLayouts([block(homologation(FOUR))], [block(table)]);
  const next = again.tables[0];
  const after = headedFigures(next);
  assert.equal(after.FRe, "0.96", "FRe over the resultant factor, not over the value");
  assert.equal(after["Valor unitario resultante"], "$ 128.00", "the renamed value keeps its name and its figure");
  assert.equal(after["Cal."], "1.00", "the new factor with its own figure");
  assert.equal(ensureTableV2(next).schema?.columnPresentation?.[idOf(next, "FRe")]?.width, 90, "the width stays with FRe");
  assert.deepEqual(groupsShown(next), [[FACTORS, ["Neg.", "Ubic.", "Cal.", "FRe"]]], "the new factor joins its group; «Zona» stays out");
  assert.ok(printableColumns(ensureTableV2(next)).some((column) => column.name === "Zona"));
});

test("8.13 20:46: the capture shown in the editor follows the columns too, and a factor taken out leaves nothing on the next one", () => {
  let table = homologation(FOUR);
  table = edit(table, (v2) => renameTableColumn(v2, idOf(table, "Cal."), "Calidad"));
  table = edit(table, (v2) => renameTableColumn(v2, idOf(table, "Renta unitaria homologada $/m²/mes"), "Valor homologado"));
  // «Cal.» taken out by the calculation: its label must not land on «Zona», which takes its id.
  const live = ensureTableV2(homologation(THREE));
  const carried = carriedLayout(layoutOf(table), sourceOf(table), live);
  const shown = applyTableLayout(live, carried);
  const names = getDisplayColumns(ensureTableV2(shown)).map((column) => column.name);
  assert.deepEqual(names.slice(4), ["Neg.", "Ubic.", "Zona", "FRe", "Valor homologado"]);
  assert.equal(headedFigures(shown)["Valor homologado"], "$ 128.00");
  // Nothing moved: the layout is the same object.
  assert.equal(movedColumns(ensureTableV2(homologation(THREE)), live), null);
});

test("8.13 20:46: a formula of the appraiser's reads the same column after a factor is added", () => {
  let table = homologation(THREE);
  table = edit(table, (v2) => insertTableColumnBeside(v2, idOf(v2, "Renta unitaria homologada $/m²/mes"), "right", "Doble del FRe"));
  const own = idOf(table, "Doble del FRe");
  table = edit(table, (v2) => {
    const letter = String.fromCharCode(65 + getDisplayColumns(v2).findIndex((column) => column.id === idOf(v2, "FRe")));
    const formula = compileFormula(`=${letter}1*2`, { table: v2, index: buildFormulaIndex([]) });
    assert.ok(formula.ok);
    return setCellFormula(v2, v2.rows[0].id, own, formula.formula);
  });
  assert.equal(headedFigures(table)["Doble del FRe"], "1.92");
  const [again] = withTableLayouts([block(homologation(FOUR))], [block(table)]);
  assert.equal(headedFigures(again.tables[0])["Doble del FRe"], "1.92", "still FRe × 2, not the new factor × 2");
});

/* ── 8.13, 22:00–25:05: double headers ─────────────────────────────────── */

test("8.13 22:00: a column leaves its double header or joins it in place, from its menu", () => {
  const table = ensureTableV2(homologation(THREE));
  const neg = idOf(table, "Neg.");
  const unit = idOf(table, "Renta unitaria $/m²/mes");
  const order = (v2: TableV2) => getDisplayColumns(v2).map((column) => column.name);
  // The first factor out: it stays where it is, before the group.
  const out = moveColumnOutOfHeaderGroup(table, neg);
  assert.deepEqual(order(out), order(table));
  assert.deepEqual(groupsShown(out), [[FACTORS, ["Ubic.", "Zona", "FRe"]]]);
  // A factor in the middle goes after the group.
  const middle = moveColumnOutOfHeaderGroup(table, idOf(table, "Ubic."));
  assert.deepEqual(order(middle).slice(4), ["Neg.", "Zona", "FRe", "Ubic.", "Renta unitaria homologada $/m²/mes"]);
  // The column beside the group joins it where it is; one farther away goes to its end.
  const joined = moveColumnIntoHeaderGroup(table, unit, table.schema!.headerGroups![0].id);
  assert.deepEqual(order(joined), order(table));
  assert.deepEqual(groupsShown(joined)[0][1], ["Renta unitaria $/m²/mes", "Neg.", "Ubic.", "Zona", "FRe"]);
  const far = moveColumnIntoHeaderGroup(table, idOf(table, "REF"), table.schema!.headerGroups![0].id);
  assert.deepEqual(groupsShown(far)[0][1], ["REF", "Neg.", "Ubic.", "Zona", "FRe"], "at the end of the group nearest to it");
  const farRight = moveColumnIntoHeaderGroup(moveTableColumnTo(table, idOf(table, "REF"), idOf(table, "Renta unitaria homologada $/m²/mes")), idOf(table, "REF"), table.schema!.headerGroups![0].id);
  assert.deepEqual(groupsShown(farRight)[0][1], ["Neg.", "Ubic.", "Zona", "FRe", "REF"]);
  // The menu says which: «Sacar del encabezado…» under it, «Meter en el encabezado…» beside it.
  const menu = (id: string) => {
    const choice = headerGroupChoice(table, id);
    return tableContextMenu("editable", {
      kind: "column", canInsertBeside: true, canRename: true, canMoveLeft: true, canMoveRight: true, canDelete: true, hidden: false, canHide: true,
      headerGroup: choice ? { title: choice.group.title, inside: choice.inside } : null,
    }).flat().map((item) => item.label);
  };
  assert.ok(menu(neg).includes(`Sacar del encabezado «${FACTORS}»`));
  assert.ok(menu(unit).includes(`Meter en el encabezado «${FACTORS}»`));
  // A table without double headers offers neither.
  const plain = ensureTableV2(generatedTable("t", "Sin grupos", [figureColumn("A"), figureColumn("B")], [["1", "2"]]));
  assert.equal(headerGroupChoice(plain, plain.columns[0].id), null);
});

test("8.13 22:29: a column is dropped before or after the header under the pointer and takes its place in or out of the double header; at the group's edge the other place is offered", () => {
  const table = ensureTableV2(homologation(THREE));
  const names = (v2: TableV2) => getDisplayColumns(v2).map((column) => column.name);
  const neg = idOf(table, "Neg.");
  const unit = idOf(table, "Renta unitaria $/m²/mes");
  const value = idOf(table, "Renta unitaria homologada $/m²/mes");
  // «Neg.» dropped on the right half of «Renta unitaria»: right after it, out of the group, beside it, in one drag.
  const out = moveTableColumnBeside(table, neg, unit, "after");
  assert.deepEqual(names(out), names(table));
  assert.deepEqual(groupsShown(out), [[FACTORS, ["Ubic.", "Zona", "FRe"]]]);
  assert.deepEqual(headerGroupEdge(out, neg), { group: out.schema!.headerGroups![0], inside: false }, "it can be put back in, in place");
  // The value dropped on the right half of FRe: under the group, at its end; it can be taken out in place.
  const inside = moveTableColumnBeside(table, value, idOf(table, "FRe"), "after");
  assert.deepEqual(groupsShown(inside)[0][1], ["Neg.", "Ubic.", "Zona", "FRe", "Renta unitaria homologada $/m²/mes"]);
  assert.equal(headerGroupEdge(inside, value)?.inside, true);
  assert.deepEqual(groupsShown(moveColumnOutOfHeaderGroup(inside, value))[0][1], ["Neg.", "Ubic.", "Zona", "FRe"]);
  // On the left half of a header it goes before it.
  assert.deepEqual(names(moveTableColumnBeside(table, value, unit, "before")).slice(2, 5), ["SUP. RENTABLE (m²)", "Renta unitaria homologada $/m²/mes", "Renta unitaria $/m²/mes"]);
  // In the middle of the group, or far from it, nothing to offer.
  assert.equal(headerGroupEdge(table, idOf(table, "Ubic.")), null);
  assert.equal(headerGroupEdge(table, idOf(table, "REF")), null);
});

test("8.13 25:00: the double header moves as one, by dragging it or a column at a time, and passes another group whole", () => {
  let table = ensureTableV2(homologation(THREE));
  table = groupTableHeaders(table, idOf(table, "RENTA MENSUAL $"), idOf(table, "SUP. RENTABLE (m²)"), "OFERTA");
  const factors = table.schema!.headerGroups!.find((group) => group.title === FACTORS)!.id;
  const names = (v2: TableV2) => getDisplayColumns(v2).map((column) => column.name);
  // Dragged onto «REF»: before it, with all its columns.
  const first = moveHeaderGroupTo(table, factors, idOf(table, "REF"));
  assert.deepEqual(names(first).slice(0, 5), ["Neg.", "Ubic.", "Zona", "FRe", "REF"]);
  assert.deepEqual(groupsShown(first).map(([title]) => title).sort(), [FACTORS, "OFERTA"].sort());
  // One step to the left passes «Renta unitaria», the next one the whole «OFERTA» group.
  const step = moveHeaderGroupBy(table, factors, -1);
  assert.deepEqual(names(step).slice(3, 7), ["Neg.", "Ubic.", "Zona", "FRe"]);
  const twice = moveHeaderGroupBy(step, factors, -1);
  assert.deepEqual(names(twice), ["REF", "Neg.", "Ubic.", "Zona", "FRe", "RENTA MENSUAL $", "SUP. RENTABLE (m²)", "Renta unitaria $/m²/mes", "Renta unitaria homologada $/m²/mes"]);
  assert.deepEqual(groupsShown(twice).find(([title]) => title === "OFERTA")?.[1], ["RENTA MENSUAL $", "SUP. RENTABLE (m²)"]);
  // At the edge of the table it stays.
  assert.equal(moveHeaderGroupBy(first, factors, -1), first);
});

test("8.13 22:46: «Formato de la tabla» changes the columns a double header spans, keeping its title", () => {
  const table = ensureTableV2(homologation(THREE));
  const group = table.schema!.headerGroups![0];
  const wider = setHeaderGroupRange(table, group.id, idOf(table, "Neg."), idOf(table, "Renta unitaria homologada $/m²/mes"));
  assert.deepEqual(groupsShown(wider), [[FACTORS, ["Neg.", "Ubic.", "Zona", "FRe", "Renta unitaria homologada $/m²/mes"]]]);
  const narrower = setHeaderGroupRange(wider, group.id, idOf(table, "Ubic."), idOf(table, "FRe"));
  assert.deepEqual(groupsShown(narrower), [[FACTORS, ["Ubic.", "Zona", "FRe"]]]);
  assert.deepEqual(getDisplayColumns(narrower).map((column) => column.name), getDisplayColumns(table).map((column) => column.name), "no column moves");
  const top = getTableHeaderLayout(narrower).topRow.map((cell) => (cell.kind === "group-title" ? `${cell.group.title}:${cell.colSpan}` : cell.columnId));
  assert.equal(top.filter((cell) => cell.startsWith(FACTORS)).length, 1);
  // The panel lists each double header with its range.
  const html = renderToStaticMarkup(createElement(TableEditorItem, {
    table: homologation(THREE), readOnly: false, onAddColumn: () => {}, onAddRow: () => {}, onRemove: () => {}, onUpdate: () => {},
  }));
  assert.match(html, /data-header-group-grip=/, "the double header has its own handle");
  assert.match(html, /aria-label="Opciones del encabezado FACTORES DE HOMOLOGACIÓN"/);
});

test("8.13 21:14: insert, delete, move, leave and join columns of a double header in any order: every header stays over its own figures", () => {
  const operations: Array<[string, (v2: TableV2) => TableV2]> = [
    ["FRe out", (v2) => moveColumnOutOfHeaderGroup(v2, idOf(v2, "FRe"))],
    ["insert in the group", (v2) => insertTableColumnBeside(v2, idOf(v2, "Ubic."), "right", "Propia")],
    ["value onto Neg.", (v2) => moveTableColumnTo(v2, idOf(v2, "Renta unitaria homologada $/m²/mes"), idOf(v2, "Neg."))],
    ["group to the left", (v2) => moveHeaderGroupBy(v2, v2.schema!.headerGroups![0].id, -1)],
    ["FRe back in", (v2) => moveColumnIntoHeaderGroup(v2, idOf(v2, "FRe"), v2.schema!.headerGroups![0].id)],
    ["remove Ubic.", (v2) => removeTableColumn(v2, idOf(v2, "Ubic."))],
    ["range to REF", (v2) => setHeaderGroupRange(v2, v2.schema!.headerGroups![0].id, idOf(v2, "REF"), idOf(v2, "Neg."))],
    ["group onto the end", (v2) => moveHeaderGroupTo(v2, v2.schema!.headerGroups![0].id, getDisplayColumns(v2).at(-1)!.id)],
    ["own row", (v2) => insertTableRow(v2, v2.rows.length)],
  ];
  const expected: Record<string, string> = {
    REF: "1", "RENTA MENSUAL $": "$ 40,000.00", "SUP. RENTABLE (m²)": "300.00", "Renta unitaria $/m²/mes": "$ 133.33",
    "Neg.": "0.95", "Ubic.": "1.00", Zona: "1.10", FRe: "0.96", "Renta unitaria homologada $/m²/mes": "$ 128.00", Propia: "",
  };
  let table = homologation(THREE);
  // Taken out in place, it stays out (it is not taken for a column the calculation writes for the first time).
  const freOut = edit(table, operations[0][1]);
  assert.deepEqual(groupsShown(freOut), [[FACTORS, ["Neg.", "Ubic.", "Zona"]]]);
  assert.deepEqual(groupsShown(withTableLayouts([block(homologation(THREE))], [block(freOut)])[0].tables[0]), [[FACTORS, ["Neg.", "Ubic.", "Zona"]]]);
  for (const [name, operation] of operations) {
    table = edit(table, operation);
    const v2 = ensureTableV2(table);
    for (const [header, figure] of Object.entries(headedFigures(table))) assert.equal(figure, expected[header], `${name}: «${header}»`);
    // Every column shown once, every group over its own run of columns.
    const shown = getDisplayColumns(v2).map((column) => column.id);
    assert.equal(new Set(shown).size, shown.length, `${name}: no column twice`);
    for (const group of v2.schema?.headerGroups ?? []) assert.ok(v2.schema!.zones.some((zone) => zone.id === group.zoneId && zone.columnIds.length), `${name}: «${group.title}» has columns`);
    // Written again by the calculation, the same.
    const [again] = withTableLayouts([block(homologation(THREE))], [block(table)]);
    assert.deepEqual(headedFigures(again.tables[0]), headedFigures(table), `${name}: the same after the calculation writes it again`);
    assert.deepEqual(groupsShown(again.tables[0]), groupsShown(table), `${name}: the same double headers`);
  }
});

/* ── 8.13, 25:45: no row handle that moves nothing ────────────────────── */

test("8.13 25:45: the rows the calculation writes show no handle; the appraiser's own rows keep theirs", () => {
  let table = homologation(THREE);
  table = edit(table, (v2) => insertTableRow(v2, v2.rows.length));
  const html = renderToStaticMarkup(createElement(GeneratedTableEditor, { table, readOnly: false, onUpdate: () => {} }));
  assert.equal(html.match(/data-row-grip=""/g)?.length ?? 0, 1, "only the own row");
  // A table of the appraiser's own keeps a handle on every row.
  const own = renderToStaticMarkup(createElement(TableEditorItem, {
    table: homologation(THREE), readOnly: false, onAddColumn: () => {}, onAddRow: () => {}, onRemove: () => {}, onUpdate: () => {},
  }));
  assert.equal(own.match(/data-row-grip=""/g)?.length ?? 0, 2);
});

/* ── 8.13, 01:27: the statistics are dragged ───────────────────────────── */

test("8.13 01:27: the statistics are reordered by dragging their handle (Space and the arrows from the keyboard), with no arrows", () => {
  const html = renderToStaticMarkup(createElement(StatisticsTable, {
    choice: { order: ["offerMin", "offerMax", "mean"], hidden: [] },
    values: () => "—",
    readOnly: false,
    onChange: () => {},
  }));
  assert.equal(html.match(/aria-label="Mover [^"]+"/g)?.length, 3);
  assert.match(html, /aria-roledescription="sortable"/, "a dnd-kit handle, reachable with the keyboard");
  assert.equal(html.match(/aria-keyshortcuts="ArrowUp ArrowDown"/g)?.length, 3, "the arrows on the focused handle move its row");
  assert.deepEqual(steppedIds(["offerMin", "offerMax", "mean"], "offerMin", 1), ["offerMax", "offerMin", "mean"]);
  assert.deepEqual(steppedIds(["offerMin", "offerMax", "mean"], "offerMin", -1), ["offerMin", "offerMax", "mean"], "the first stays first");
  assert.doesNotMatch(html, /aria-label="(Subir|Bajar) /);
  const source = readFileSync("src/features/valuations/components/calculation/market-statistics-table.tsx", "utf8");
  assert.doesNotMatch(source, /ArrowUp|ArrowDown/);
});

/* ── 8.14, 20:44: «Mostrar el título en el dictamen» ──────────────────── */

test("8.14 20:44: the right click shows «Mostrar el título en el dictamen» with its check", () => {
  const cell = tableContextMenu("editable", { kind: "cell", editable: true, hasFormula: false, canPaste: true, canInsertRow: true, canInsertColumn: true, canDeleteColumn: true, canDeleteRow: true });
  const [, shown] = withTableFormatGroup(cell, { captionShown: true }).at(-1)!;
  const [, hidden] = withTableFormatGroup(cell, { captionShown: false }).at(-1)!;
  assert.deepEqual([shown.label, shown.checked, shown.action], ["Mostrar el título en el dictamen", true, "caption-hide"]);
  assert.deepEqual([hidden.label, hidden.checked, hidden.action], ["Mostrar el título en el dictamen", false, "caption-show"]);
  const editor = readFileSync("src/features/valuations/components/editor/table-editor.tsx", "utf8");
  assert.match(editor, /aria-checked=\{item\.checked\}/, "the menu draws the check");
});

test("8.14 20:44: the deductions' title starts shown as the dictamen prints it, and unchecking it hides it in the dictamen", () => {
  const calculation: IncomeCalculationDto = {
    ...DEFAULT_INCOME,
    rentableUnits: [{ description: "Local", area: 100, unitRent: 150 }],
    deductions: [{ concept: "Vacíos", rate: 0.1 }, { concept: "Predial", rate: 0.04 }],
    appliedRate: 0.1,
    rentMarket: { adoptedUnitRent: null, subjectArea: null, comparables: [], homologation: null },
    configured: true,
    locked: false,
  };
  const capture = incomeCaptureBlocks(calculation, null);
  const deductions = capture.flatMap((item) => [...item.tables, ...item.apartados.flatMap((apartado) => apartado.tables)]).find((table) => table.title === "Deducciones sobre la renta bruta")!;
  assert.ok(deductions, "the capture has the deductions table");
  assert.notEqual(ensureTableV2(deductions).schema?.hideCaption, true, "shown, as the dictamen prints it");
  // Unchecked in the editor: the layout keeps it hidden, also over the dictamen's table (written with its title shown).
  const hiddenTitle = edit(deductions, (v2) => setTableCaptionShown(v2, false));
  assert.equal(layoutOf(hiddenTitle).hideCaption, true);
  const printed = { id: deductions.id, title: deductions.title, columns: ["Concepto", "Porcentaje", "Importe mensual"], rows: [["Vacíos", "10.00 %", "$1,500.00"]], enabled: true } as unknown as TableContent;
  const [again] = withTableLayouts([{ ...block(printed), id: "motor-ingresos-deducciones" }], [{ ...block(hiddenTitle), id: "motor-ingresos-deducciones" }]);
  const html = renderToStaticMarkup(createElement(DocumentTable, { variant: "report", table: again.tables[0] }));
  assert.doesNotMatch(html, /Deducciones sobre la renta bruta/);
  // Checked again, it prints again, though the capture's default is the same.
  const shownAgain = edit(hiddenTitle, (v2) => setTableCaptionShown(v2, true));
  assert.equal(layoutOf(shownAgain).hideCaption, false);
  // A table the calculation writes with its title hidden (the homologation) is shown by checking it, and hidden again.
  const homologationShown = edit(homologation(THREE), (v2) => setTableCaptionShown(v2, true));
  assert.equal(ensureTableV2(homologationShown).schema?.hideCaption, undefined);
  assert.equal(ensureTableV2(edit(homologationShown, (v2) => setTableCaptionShown(v2, false))).schema?.hideCaption, true);
});

/* ── 8.14, 16:38: a new table in a calculation section ──────────────────── */

test("8.14 16:38: a table added in a calculation section shows its headers and rows in the valuation's palette, as the calculation's", () => {
  const own = renderToStaticMarkup(createElement(TableEditorItem, {
    table: { id: "propia", title: "Tabla configurable", columns: ["Concepto", "Dato"], rows: [["", ""]], enabled: true } as unknown as TableContent,
    readOnly: false, onAddColumn: () => {}, onAddRow: () => {}, onRemove: () => {}, onUpdate: () => {},
  }));
  const generated = renderToStaticMarkup(createElement(GeneratedTableEditor, { table: homologation(THREE), readOnly: false, onUpdate: () => {} }));
  for (const html of [own, generated]) {
    assert.match(html, /bg-\[var\(--doc-pastel,#BDD7EE\)\]/, "the header band in the palette");
    assert.match(html, /bg-\[var\(--doc-zebra,#F1F5F9\)\]/, "the shaded rows in the palette");
  }
});
