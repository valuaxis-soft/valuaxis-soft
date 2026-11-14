/**
 * Video 5.3 (Álvaro, nov 2026): «una sola tabla». The construction types and
 * the special installations are captured in their table of the construction
 * section, edited as any table, and that is what the cost approach takes;
 * the panel «Tipos de construcción» above it is gone. The figures of the
 * cost approach and of the conclusion do not change.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  asCaptureTable,
  captureColumnIds,
  computedColumnIds,
  findCaptureTable,
  mergeCapture,
  normalizeCapture,
  readCapture,
  serverItems,
  syncedFromTable,
  withConstructionTables,
  withNewCaptureRow,
  withTemplateCaptureTable,
  type SyncedItem,
  type TypeItem,
} from "../src/features/valuations/calculation/construction-capture";
import { DEFAULT_LAND, emptyInstallation, toCostEngineInput, type CostCalculationDto } from "../src/features/valuations/calculation/cost-types";
import { construccionFlowItems } from "../src/features/valuations/components/construccion-preview";
import { calculatedCellReasons, calculatedColumnReasons, calculatedRowReasons, type CalculatedTableLock } from "../src/features/valuations/components/editor/calculated-table-context";
import { ConstructionCaptureAccess, ConstructionCaptureProvider, EditorTable, type ConstructionCaptureContextValue } from "../src/features/valuations/components/editor/construction-capture-table";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeCostApproach } from "../src/features/valuations/engine/costs";
import type { AppSection, TableContent } from "../src/features/valuations/model";
import { construccionSection } from "../src/features/valuations/sections/construccion";
import {
  ensureTableV2,
  getDisplayColumns,
  groupTableHeaders,
  insertTableColumnBeside,
  renameTableColumn,
  setCellFormula,
  setColumnHidden,
  type TableV2,
} from "../src/features/valuations/services/table";
import { compileFormula, buildFormulaIndex } from "../src/features/valuations/services/formula-references";
import { evaluateTableFormulas } from "../src/features/valuations/services/table-formula-engine";

/* ── The appraiser's book (Arandas): one type and eight installations ─────────────── */

const arandasType = { ref: "T-1", description: "Edificio de uso mixto", classification: "Moderno", quality: "Media", area: 467.27, age: 2, usefulLife: 70 };

const arandas: CostCalculationDto = {
  land: { ...DEFAULT_LAND, subjectArea: 169.78 },
  types: [{ id: 11, ...arandasType }],
  constructions: [{ ...arandasType, conservation: 0.98, conservationRating: null, ageFactor: null, otherFactor: 1, resultantFactor: null, completion: 1, undivided: 1, unitReplacementCost: 14361.99 }],
  installations: ([
    [6, 30, 9000, "Pza"], [1, 30, 35000, "Lote"], [11.55, 70, 14361.99, "m²"], [3.54, 70, 14361.99, "m²"],
    [4, 10, 30648, "Lote"], [1, 70, 90000, "Lote"], [4, 20, 4000, "Lote"], [4, 20, 3500, "Pza"],
  ] as const).map(([quantity, usefulLife, unitReplacementCost, unit], index) => ({
    ...emptyInstallation(index), description: `Instalación ${index + 1}`, unit, quantity, age: 2, usefulLife, conservation: 0.975, unitReplacementCost,
  })),
  indirects: [],
  market: { adoptedUnitValue: 9000, subjectArea: 169.78, baseArea: null },
  configured: true,
  typesCaptured: true,
  locked: false,
};

/** The construction section of a new valuation, as the template makes it. */
function templateSection(): AppSection {
  return JSON.parse(JSON.stringify(construccionSection)) as AppSection;
}

const tableOf = (section: AppSection, id: string) => {
  for (const block of section.blocks) for (const container of [block, ...block.apartados]) {
    const table = container.tables.find((item) => item.id === id);
    if (table) return table;
  }
  throw new Error(`no table ${id}`);
};
const typesTable = (section: AppSection) => tableOf(section, "construccion_tipos");
const installationsTable = (section: AppSection) => tableOf(section, "instalaciones_especiales");

/** The table as the editor shows it: each row's texts by column (the template's keys). */
function shown(table: TableContent): Record<string, string>[] {
  const v2 = ensureTableV2(table);
  const columns = getDisplayColumns(v2);
  return v2.rows.map((row) => Object.fromEntries(columns.map((column) => {
    const cell = row.cells[column.id];
    return [column.id, cell?.kind === "value" ? cell.value : "=f"];
  })));
}

/** Writes a text in a cell, by row and column id, as the editor does. */
function write(table: TableContent, rowIndex: number, columnId: string, value: string): TableContent {
  const v2 = ensureTableV2(table);
  const rows = v2.rows.map((row, index) => (index === rowIndex ? { ...row, cells: { ...row.cells, [columnId]: { kind: "value" as const, value } } } : row));
  return { ...v2, rows } as unknown as TableContent;
}

const asTable = (table: TableV2) => table as unknown as TableContent;

/* ── 1. One table, the capture ─────────────────────────────────────────────── */

test("a new valuation's types table becomes the capture: its empty rows T-1…T-3 are not types until something is written", () => {
  const nothing: CostCalculationDto = { ...arandas, types: [], constructions: [], installations: [], configured: false, typesCaptured: false };
  const section = withConstructionTables(templateSection(), nothing);
  const types = typesTable(section);
  assert.deepEqual(ensureTableV2(types).schema?.capture, { kind: "types" });
  assert.deepEqual(readCapture(types, "types", []), [], "rows with only their reference are not types");
  assert.deepEqual(readCapture(installationsTable(section), "installations", []), [], "nor the installations' numbered rows");

  // The appraiser writes a description in T-1: it is a type, with its row.
  const written = write(types, 0, "tipo_construccion", "Casa habitación");
  const items = readCapture(written, "types", []);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].item, { ref: "T-1", description: "Casa habitación", classification: "", quality: "", area: null, age: null, usefulLife: null });
});

test("each row of the capture is a type with every datum the panel captured; the columns of the system are locked, the others are not", () => {
  const section = withConstructionTables(templateSection(), arandas);
  const types = typesTable(section);
  assert.deepEqual(shown(types), [{
    tipo: "T-1", tipo_construccion: "Edificio de uso mixto", clasificacion: "Moderno", calidad: "Media", conservacion: "0.98", edad: "2", vut: "70", vur: "68", sup_m2: "467.27", descripcion: "",
  }]);
  assert.deepEqual(computedColumnIds(types), ["conservacion", "vur"]);
  assert.deepEqual(captureColumnIds(types), ["tipo", "tipo_construccion", "clasificacion", "calidad", "edad", "vut", "sup_m2"]);
  // Read back, the table gives exactly the types the server holds: the cost approach takes the same.
  const synced = syncedFromTable(types, serverItems("types", arandas));
  assert.deepEqual(readCapture(types, "types", synced).map(({ id, item }) => ({ id, ...item })), arandas.types);
});

test("golden: the cost approach of a capture read from the table is the one of before (Arandas V33 = 6,530,000)", () => {
  const section = withConstructionTables(templateSection(), arandas);
  const types = readCapture(typesTable(section), "types", syncedFromTable(typesTable(section), serverItems("types", arandas))).map(({ item }) => item as TypeItem);
  const installations = readCapture(installationsTable(section), "installations", syncedFromTable(installationsTable(section), serverItems("installations", arandas)));
  const fromTable: CostCalculationDto = {
    ...arandas,
    types,
    constructions: arandas.constructions.map((row) => ({ ...row, ...types.find((type) => type.ref === row.ref)! })),
    installations: arandas.installations.map((row, index) => ({ ...row, ...installations[index].item })),
  };
  const run = (calculation: CostCalculationDto) => {
    const input = toCostEngineInput(calculation);
    assert.ok(input.ok);
    return computeCostApproach(input.input, DEFAULT_ENGINE_CONFIG);
  };
  const before = run(arandas);
  const after = run(fromTable);
  assert.equal(after.constructions, 6530000, "V33 as Arandas");
  assert.deepEqual(after, before, "every figure of the cost approach is the same");
});

test("the installations table: description, unit and quantity in their columns, the P/C written once in «Tipo», the conservation of costs", () => {
  const section = withConstructionTables(templateSection(), arandas);
  const rows = shown(installationsTable(section));
  assert.equal(rows.length, 8);
  assert.deepEqual(rows[0], { numero: "1", tipo: "Privativa", descripcion: "Instalación 1", unidad: "Pza", cantidad: "6.00", edad: "2", vut: "30", vur: "28", conservacion: "0.975", mantenimiento: "" });
  const synced = syncedFromTable(installationsTable(section), serverItems("installations", arandas));
  assert.deepEqual(readCapture(installationsTable(section), "installations", synced).map(({ item }) => item), serverItems("installations", arandas).map(({ item }) => item));
});

/* ── 2. Editing the table: references, VUR, rows ─────────────────────────────── */

test("«+ Tipo de construcción» adds a row with the next reference; a duplicated row takes a new one; VUR follows the row", () => {
  let table = typesTable(withConstructionTables(templateSection(), arandas));
  const added = withNewCaptureRow(table);
  assert.equal(added.columnId, "tipo_construccion", "the first datum to write is the description");
  table = added.table;
  assert.equal(shown(table).at(-1)?.tipo, "T-2");
  const installations = withNewCaptureRow(installationsTable(withConstructionTables(templateSection(), arandas))).table;
  assert.equal(shown(installations).at(-1)?.numero, "9");

  // Written: age 10 and VUT 50; VUR is the system's.
  table = normalizeCapture(write(write(write(table, 1, "tipo_construccion", "Bodega"), 1, "edad", "10"), 1, "vut", "50"), arandas);
  assert.equal(shown(table)[1].vur, "40");
  assert.equal(shown(table)[1].conservacion, "—", "not valued in costs yet");

  // A copy of T-1 (right click, «Duplicar fila») is another type: T-3.
  const v2 = ensureTableV2(table);
  const copy = asTable({ ...v2, rows: [...v2.rows, { ...v2.rows[0], id: "copia" }] });
  assert.deepEqual(shown(normalizeCapture(copy, arandas)).map((row) => row.tipo), ["T-1", "T-2", "T-3"]);
  // A row written without reference takes one.
  const noRef = normalizeCapture(write(write(withNewCaptureRow(table).table, 2, "tipo", ""), 2, "clasificacion", "Antigua"), arandas);
  assert.equal(shown(noRef)[2].tipo, "T-3");
});

test("a figure shown with fewer decimals keeps the server's; one written anew is read; a formula gives its result", () => {
  const precise: CostCalculationDto = { ...arandas, types: [{ ...arandas.types[0], area: 467.2749 }] };
  const table = typesTable(withConstructionTables(templateSection(), precise));
  const synced = syncedFromTable(table, serverItems("types", precise));
  assert.equal(shown(table)[0].sup_m2, "467.27");
  assert.equal((readCapture(table, "types", synced)[0].item as { area: number }).area, 467.2749, "shown as saved: the saved value");
  assert.equal((readCapture(write(table, 0, "sup_m2", "500"), "types", synced)[0].item as { area: number }).area, 500);

  // =B? The area as a formula of the table: the result is the datum.
  const v2 = ensureTableV2(table);
  const compiled = compileFormula("=100*2", { index: buildFormulaIndex([]), table: v2 });
  assert.ok(compiled.ok);
  const withFormula = setCellFormula(v2, v2.rows[0].id, "sup_m2", compiled.formula);
  const results = evaluateTableFormulas(withFormula);
  const evaluated = { ...withFormula, formulaResults: Object.fromEntries(results) } as unknown as TableContent;
  assert.equal((readCapture(evaluated, "types", synced)[0].item as { area: number }).area, 200);
});

/* ── 3. Both ways: what the server changed is written, what the table changed is kept ─ */

test("the server's changes are written where they changed; the appraiser's, still being saved, are kept", () => {
  const table = installationsTable(withConstructionTables(templateSection(), arandas));
  const synced: SyncedItem[] = syncedFromTable(table, serverItems("installations", arandas));
  // The appraiser changed the description of 1 (not saved yet); the cost panel changed the quantity of 2.
  const written = write(table, 0, "descripcion", "Tanque de gas estacionario");
  const server: CostCalculationDto = { ...arandas, installations: arandas.installations.map((row, index) => (index === 1 ? { ...row, quantity: 2 } : row)) };
  const merged = mergeCapture(written, serverItems("installations", server), synced, server);
  assert.equal(shown(merged)[0].descripcion, "Tanque de gas estacionario", "the appraiser's text stays");
  assert.equal(shown(merged)[1].cantidad, "2.00", "the cost panel's quantity is written");

  // The cost panel removed installation 8: it leaves the table. A row the appraiser added and is saving stays.
  const withNew = normalizeCapture(write(withNewCaptureRow(merged).table, 8, "descripcion", "Cisterna"), server);
  const removed: CostCalculationDto = { ...server, installations: server.installations.slice(0, 7) };
  const after = mergeCapture(withNew, serverItems("installations", removed), syncedFromTable(merged, serverItems("installations", server)), removed);
  assert.deepEqual(shown(after).map((row) => row.numero), ["1", "2", "3", "4", "5", "6", "7", "9"]);

  // Unchanged on both sides: the same table.
  const settled = syncedFromTable(after, serverItems("installations", removed));
  assert.equal(mergeCapture(after, serverItems("installations", removed), settled, removed), after);
});

test("a type renamed in the table keeps its id (and with it its cost columns); one deleted and brought back is new", () => {
  const table = typesTable(withConstructionTables(templateSection(), arandas));
  const synced = syncedFromTable(table, serverItems("types", arandas));
  const renamed = write(table, 0, "tipo", "T-9");
  assert.deepEqual(readCapture(renamed, "types", synced).map(({ id, item }) => [id, item.ref]), [[11, "T-9"]]);
  // While it is saved, the server still says T-1: the row is not duplicated nor overwritten.
  const merged = mergeCapture(renamed, serverItems("types", arandas), synced, arandas);
  assert.deepEqual(shown(merged).map((row) => row.tipo), ["T-9"]);
  assert.deepEqual(syncedFromTable(merged, serverItems("types", arandas), synced)[0].rowId, ensureTableV2(table).rows[0].id, "the type keeps its row");
});

test("a valuation saved before (types in the panel) opens with its types as the rows of the table, and nothing is lost", () => {
  // The document as the old fill left it: the template's three rows, the types in the server.
  const old: CostCalculationDto = {
    ...arandas,
    types: [
      { id: 21, ...arandasType },
      { id: 22, ref: "T-2", description: "Bodega", classification: "Industrial", quality: "Económica", area: 80, age: 10, usefulLife: 50 },
      // A type saved from the panel with only its reference.
      { id: 23, ref: "T-3", description: "", classification: "", quality: "", area: null, age: null, usefulLife: null },
    ],
  };
  const section = withConstructionTables(templateSection(), old);
  const table = typesTable(section);
  assert.deepEqual(shown(table).map((row) => row.tipo), ["T-1", "T-2", "T-3"]);
  const synced = syncedFromTable(table, serverItems("types", old));
  assert.deepEqual(readCapture(table, "types", synced).map(({ id, item }) => ({ id, ...item })), old.types, "each type, with its id, as saved");
});

test("a table whose capture was unlinked is the appraiser's: neither written by the server nor locked", () => {
  const table = installationsTable(withConstructionTables(templateSection(), arandas));
  const v2 = ensureTableV2(table);
  const unlinked = asTable({ ...v2, schema: { ...v2.schema!, capture: { kind: "installations", unlinked: true } } });
  const changed: CostCalculationDto = { ...arandas, installations: arandas.installations.map((row) => ({ ...row, quantity: 99 })) };
  assert.equal(mergeCapture(unlinked, serverItems("installations", changed), null, changed), unlinked);
  assert.equal(asCaptureTable(unlinked, changed), unlinked);
});

/* ── 4. Menus of the capture table ───────────────────────────────────────────── */

test("on the capture table the rows are the appraiser's; the columns of costs and of the system are hidden, not deleted", () => {
  const lock: CalculatedTableLock = {
    row: () => true,
    column: (id) => id === "vur",
    capture: { keyColumn: (id) => id === "edad", rowRemoval: () => null, removeHint: "" },
  };
  assert.equal(calculatedRowReasons(lock, "r1"), undefined, "insert, duplicate, move and delete rows");
  assert.equal(calculatedColumnReasons(lock, "notas"), undefined, "a column of his own goes as any");
  assert.match(calculatedColumnReasons(lock, "edad")?.["delete-column"] ?? "", /entra al enfoque de costos/);
  assert.match(calculatedColumnReasons(lock, "vur")?.["delete-column"] ?? "", /la calcula el sistema/);
  assert.equal(calculatedCellReasons(lock, "r1", "edad")?.["delete-row"], undefined);
});

/* ── 5. The editor: one table, linked, «+ Tipo de construcción» ──────────────────── */

const context = (tables: Array<[string, "types" | "installations"]>): ConstructionCaptureContextValue => ({
  tables: new Map(tables),
  costs: arandas,
  setExcludedTypes: async () => undefined,
  relink: () => undefined,
});

function renderTable(table: TableContent, value: ConstructionCaptureContextValue | null) {
  const editor = createElement(EditorTable, { table, readOnly: false, onAddColumn: () => {}, onAddRow: () => {}, onRemove: () => {}, onUpdate: () => {} });
  return renderToStaticMarkup(value ? createElement(ConstructionCaptureProvider, { value }, editor) : editor);
}

test("the editor shows the types table as the capture: «Vinculado con Costos», «+ Tipo de construcción», the system's figures in gray", () => {
  const table = typesTable(withConstructionTables(templateSection(), arandas));
  const html = renderTable(table, context([[table.id, "types"]]));
  assert.match(html, /data-capture-table="types"/);
  assert.match(html, /Vinculado con Costos/);
  assert.match(html, /data-capture-add="types"[^>]*>.*Tipo de construcción/);
  const locked = html.match(/<input[^>]*data-calculated=""[^>]*>/g) ?? [];
  assert.equal(locked.length, 2, "Conservación and VUR of T-1");
  assert.ok(locked.every((input) => /Esta cifra la calcula el sistema/.test(input)));
  // Its own data is written in the table: not locked.
  assert.match(html, /<input(?![^>]*data-calculated)[^>]*value="Edificio de uso mixto"/);
});

test("the installations table has its own «+ Instalación especial»; without the workspace it is any table", () => {
  const table = installationsTable(withConstructionTables(templateSection(), arandas));
  assert.match(renderTable(table, context([[table.id, "installations"]])), /data-capture-add="installations"[^>]*>.*Instalación especial/);
  const plain = renderTable(table, null);
  assert.doesNotMatch(plain, /data-capture-table|Vinculado con Costos/);
  assert.equal((plain.match(/data-calculated=""/g) ?? []).length, 0);
});

/* ── 6. The dictamen prints the table as it is seen ──────────────────────────────── */

function printedSection(section: AppSection) {
  return construccionFlowItems(section).map((item) => renderToStaticMarkup(createElement("div", null, item.node))).join("");
}

test("the dictamen prints the capture table as the editor shows it: headers renamed and combined, hidden columns out, own columns and formulas in", () => {
  const section = withConstructionTables(templateSection(), arandas);
  let table = ensureTableV2(typesTable(section));
  table = renameTableColumn(table, "sup_m2", "Superficie construida");
  table = groupTableHeaders(table, "edad", "vur", "Vida útil");
  table = setColumnHidden(table, "descripcion", true);
  table = insertTableColumnBeside(table, "sup_m2", "right", "Notas");
  const notes = table.columns.find((column) => column.name === "Notas")!.id;
  table = { ...table, rows: table.rows.map((row) => ({ ...row, cells: { ...row.cells, [notes]: { kind: "value" as const, value: "Planta baja" } } })) };
  const compiled = compileFormula("=2*3", { index: buildFormulaIndex([]), table });
  assert.ok(compiled.ok);
  table = setCellFormula(table, table.rows[0].id, notes, compiled.formula);
  const edited: AppSection = {
    ...section,
    blocks: section.blocks.map((block) => ({ ...block, apartados: block.apartados.map((apartado) => ({ ...apartado, tables: apartado.tables.map((item) => (item.id === table.id ? asTable(table) : item)) })) })),
  };
  const html = printedSection(edited);
  assert.match(html, /Superficie construida/);
  assert.match(html, /Vida útil/);
  assert.match(html, />6</, "the result of the formula, not an empty cell");
  assert.doesNotMatch(html, /Planta baja/, "the formula wrote over the text");
  assert.match(html, /Edificio de uso mixto/);
  // The hidden column «Descripción» does not print, and the title of the types table does not either (the subbloque says it).
  const header = html.match(/<thead[\s\S]*?<\/thead>/g)?.[0] ?? "";
  assert.doesNotMatch(header, /Descripción/);
  assert.doesNotMatch(html, /<caption[^>]*>TIPOS DE CONSTRUCCIONES/);
});

/* ── 7. A section without its capture table offers to put it back ─────────────────── */

test("a construction section without a capture table offers to put it back, in the template's place, and nothing else", () => {
  const section = templateSection();
  const withoutInstallations: AppSection = { ...section, blocks: section.blocks.map((block) => (block.id === "instalaciones_especiales" ? { ...block, apartados: [] } : block)) };
  const html = renderToStaticMarkup(createElement(ConstructionCaptureAccess, { section: withoutInstallations, readOnly: false, onAdd: () => {} }));
  assert.match(html, /no tiene la tabla de instalaciones especiales/);
  assert.match(html, /Tabla de instalaciones especiales/);
  assert.doesNotMatch(html, /Tabla de tipos de construcción/);
  assert.equal(renderToStaticMarkup(createElement(ConstructionCaptureAccess, { section, readOnly: false, onAdd: () => {} })), "", "with both tables, nothing");

  const restored = withTemplateCaptureTable(withoutInstallations, "installations");
  assert.ok(findCaptureTable(restored, "installations"));
  assert.equal(restored.blocks.find((block) => block.id === "instalaciones_especiales")?.apartados[0].id, "instalaciones_especiales_detalle");
  assert.equal(withTemplateCaptureTable(restored, "installations"), restored, "never a second one");
});
