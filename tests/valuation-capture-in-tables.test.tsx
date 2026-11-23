/**
 * 20 nov 2026 (Álvaro: «hay dos… ¿por qué ahí es editable y no desde
 * arriba?»): a calculation section showed its capture tables in a panel and,
 * under it, the pages of the dictamen with the same figures locked. Each
 * table of the dictamen is now the only place its data is captured: the
 * panel hands the editor its pages as the capture holds them, with every row
 * being written, and each datum has one cell, in the table that prints it.
 * What the dictamen prints does not change.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { captureColumnPlace, captureDisplayBlocks } from "../src/features/valuations/calculation/capture-display";
import { COST_TEMPLATE_BLOCK_IDS, costCaptureColumns, costDocumentBlocks, costIndirectOrder } from "../src/features/valuations/calculation/cost-document";
import { DEFAULT_LAND, costColumnsOf, emptyInstallation, toCostEngineInput, type CostCalculationDto } from "../src/features/valuations/calculation/cost-types";
import { editGeneratedTable, layoutOf, sourceOf } from "../src/features/valuations/calculation/generated-table-layout";
import { INCOME_CAPTURE, incomeCaptureBlocks, incomeDocumentBlocks } from "../src/features/valuations/calculation/income-document";
import { DEFAULT_INCOME, toIncomeEngineInput, type IncomeCalculationDto } from "../src/features/valuations/calculation/income-types";
import { marketCaptureColumns, marketDocumentBlocks } from "../src/features/valuations/calculation/market-document";
import { defaultMarketSettings, marketEngineConfig, toMarketEngineInput, type ComparableDto, type MarketCalculationDto } from "../src/features/valuations/calculation/market-types";
import { CaptureStore, CaptureStoreProvider, captureSlotKey } from "../src/features/valuations/components/editor/capture-host";
import { GeneratedTableEditor } from "../src/features/valuations/components/editor/generated-table-editor";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeCostApproach } from "../src/features/valuations/engine/costs";
import { computeIncomeApproach } from "../src/features/valuations/engine/income";
import { computeMarketApproach } from "../src/features/valuations/engine/market";
import { Trace } from "../src/features/valuations/engine/trace";
import type { Block, TableContent } from "../src/features/valuations/model";
import { ensureTableV2, renameTableColumn } from "../src/features/valuations/services/table";

const tablesOf = (blocks: Block[]) => blocks.flatMap((block) => [...block.tables, ...block.apartados.flatMap((apartado) => apartado.tables)]);
const tableOf = (blocks: Block[], id: string) => {
  const found = tablesOf(blocks).find((table) => table.id === id);
  assert.ok(found, `the page has the table ${id}`);
  return ensureTableV2(found);
};
const cellText = (table: ReturnType<typeof ensureTableV2>, rowId: string, columnId: string) => {
  const cell = table.rows.find((row) => row.id === rowId)?.cells[columnId];
  assert.ok(cell, `the table has the cell ${rowId} × ${columnId}`);
  return cell.kind === "value" ? cell.value : "";
};
const headerOf = (table: ReturnType<typeof ensureTableV2>, columnId: string) => table.columns.find((column) => column.id === columnId)?.name;

/* ------------------------------ Costos ------------------------------ */

// Invented: two types, the second still without its replacement value, and one installation.
const types = [
  { id: 1, ref: "T-1", description: "Casa habitación", classification: "Moderno", quality: "Media", area: 150, age: 12, usefulLife: 60 },
  { id: 2, ref: "T-2", description: "Cochera", classification: "Moderno", quality: "Económica", area: 30, age: 12, usefulLife: 50 },
];
const costRow = { conservation: 0.95, conservationRating: null, ageFactor: null, otherFactor: 1, resultantFactor: null, completion: 1, undivided: 1 };
const costs = (patch: Partial<CostCalculationDto> = {}): CostCalculationDto => ({
  land: { ...DEFAULT_LAND, subjectArea: 300, unitValue: 4100 },
  types,
  constructions: [{ ...types[0], ...costRow, unitReplacementCost: 9800 }, { ...types[1], ...costRow, unitReplacementCost: null }],
  installations: [{ ...emptyInstallation(0), ref: "IE-1", description: "Cisterna", unit: "pza", quantity: 1, age: 12, usefulLife: 40, conservation: 0.9, unitReplacementCost: 38_000 }],
  indirects: [],
  market: { adoptedUnitValue: null, subjectArea: null, baseArea: null },
  configured: true,
  typesCaptured: true,
  locked: false,
  ...patch,
});
function costPages(calculation: CostCalculationDto, capture: boolean) {
  const input = toCostEngineInput(calculation);
  if (!input.ok) return costDocumentBlocks(calculation, null, null, { capture });
  const trace = new Trace();
  const result = computeCostApproach(input.input, DEFAULT_ENGINE_CONFIG, trace);
  return capture ? costDocumentBlocks(calculation, result, trace, { capture: true }) : costDocumentBlocks(calculation, result, trace);
}

test("costos: the tables of the page are the capture, with the construction that has no value yet, and the dictamen prints what it printed", () => {
  const calculation = costs();
  const printed = costPages(calculation, false);
  const captured = costPages(calculation, true);
  const at = costCaptureColumns(costColumnsOf(calculation.columns));
  const refs = calculation.constructions.map((row) => row.ref);

  // The dictamen leaves out the construction without its value; the capture has its row, in both tables, to write it in.
  assert.deepEqual(tableOf(printed, at.constructionValues.table).rows.map((row) => row.id), [at.constructionValues.rows(refs)[0]]);
  assert.deepEqual(tableOf(captured, at.constructions.table).rows.map((row) => row.id), at.constructions.rows(refs));
  assert.deepEqual(tableOf(captured, at.constructionValues.table).rows.map((row) => row.id), at.constructionValues.rows(refs));

  // Each datum has its cell where the dictamen prints it.
  const land = tableOf(captured, at.land.table);
  assert.equal(headerOf(land, at.land.subjectArea), "Superficie de Sujeto (m²)");
  assert.equal(headerOf(land, at.land.unitValue), "Valor Unitario ($/m²)");
  assert.equal(headerOf(land, at.land.factors.negotiation), "Neg.");
  assert.equal(headerOf(land, at.land.factors.surface), "Sup.");
  assert.equal(headerOf(land, at.land.resultantFactor), "FRe");
  const factors = tableOf(captured, at.constructions.table);
  assert.deepEqual(
    [at.constructions.conservation, at.constructions.ageFactor, at.constructions.otherFactor, at.constructions.resultantFactor, at.constructions.completion, at.constructions.undivided].map((id) => headerOf(factors, id)),
    ["Cons.", "Edad", "Otro", "FRe", "Grado de terminación", "Indiviso"],
  );
  assert.equal(headerOf(tableOf(captured, at.constructionValues.table), at.constructionValues.unitReplacementCost), "Valor Unit. $");
  const items = tableOf(captured, at.installations.table);
  assert.deepEqual(
    [at.installations.share, at.installations.description, at.installations.unit, at.installations.quantity, at.installations.age, at.installations.usefulLife, at.installations.conservation].map((id) => headerOf(items, id)),
    ["P/C", "Descripción", "Unidad", "Cant.", "Edad", "Vida útil", "Cons."],
  );
  assert.equal(headerOf(tableOf(captured, at.installationValues.table), at.installationValues.unitReplacementCost), "Valor Unit. $");

  // What is typed reaches the calculation: the value of the second construction, written in its cell, prints its row.
  const typed = costs({ constructions: calculation.constructions.map((row) => (row.ref === "T-2" ? { ...row, unitReplacementCost: 4200 } : row)) });
  const row = at.constructionValues.rows(refs)[1];
  assert.equal(cellText(tableOf(costPages(calculation, true), at.constructionValues.table), row, at.constructionValues.unitReplacementCost), "$ 0.00");
  assert.equal(cellText(tableOf(costPages(typed, true), at.constructionValues.table), row, at.constructionValues.unitReplacementCost), "$ 4,200.00");
  assert.equal(tableOf(costPages(typed, false), at.constructionValues.table).rows.length, 2, "and the dictamen prints it");

  // With every row complete, the page of the capture is the page of the dictamen, cell by cell.
  assert.deepEqual(costPages(typed, true), costPages(typed, false));
});

test("costos: before any value the land has its table to write in, and the indirects being written have their rows after the ones that count", () => {
  const empty = costs({ land: { ...DEFAULT_LAND }, constructions: [], installations: [], indirects: [{ concept: "", percentage: null, base: null }, { concept: "Proyecto", percentage: 0.05, base: null }] });
  assert.deepEqual(costPages(empty, false), [], "nothing to print yet");
  const at = costCaptureColumns(costColumnsOf(empty.columns));
  const captured = costPages(empty, true);
  assert.equal(tableOf(captured, at.land.table).rows[0].id, at.land.row);
  assert.deepEqual(costIndirectOrder(empty.indirects), [1, 0]);
  const indirects = tableOf(captured, at.indirects.table);
  assert.deepEqual(indirects.rows.map((row) => row.id), at.indirects.rows(2));
  assert.equal(cellText(indirects, at.indirects.rows(2)[0], at.indirects.concept), "Proyecto");
});

/* ------------------------------ Mercado ------------------------------ */

function comparable(reference: number, area: number, price: number): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Calle Inventada ${reference}`, area, price,
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null,
    sourceName: "Portal inventado", contactName: null, contactPhone: null, url: null, offerDate: null, photos: [],
    factors: [{ type: "NEGOCIACION", value: 0.95, subjectRating: null, comparableRating: null, justification: "" }],
  };
}
const market = (patch: Partial<MarketCalculationDto["settings"]> = {}): MarketCalculationDto => ({
  settings: { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 300, adoptedUnitValue: 4100, ...patch },
  comparables: [comparable(1, 280, 1_232_000), comparable(2, 320, 1_344_000), comparable(3, 300, 1_290_000)],
  locked: false,
});
function marketPages(calculation: MarketCalculationDto, capture: boolean) {
  const input = toMarketEngineInput(calculation);
  const result = input.ok ? computeMarketApproach(input.input, marketEngineConfig(calculation.settings, calculation.precision)) : null;
  return capture ? marketDocumentBlocks(calculation, result, { capture: true }) : marketDocumentBlocks(calculation, result);
}

test("mercado: factors, the adopted value and each comparable's data are captured in the tables of the page", () => {
  const calculation = market();
  const captured = marketPages(calculation, true);
  assert.deepEqual(captured, marketPages(calculation, false), "the page of the capture is the page of the dictamen");
  const at = marketCaptureColumns(calculation);

  const homologation = tableOf(captured, at.homologation.table);
  assert.deepEqual(homologation.rows.map((row) => row.id), at.homologation.rows, "a row per comparable, by its id");
  // A column per factor, in the order they multiply, between the unit value and the FRe.
  assert.equal(headerOf(homologation, at.homologation.factor(0)), "Neg.");
  assert.equal(headerOf(homologation, at.homologation.factor(calculation.settings.factorSlots.length)), "FRe");
  // The factor typed is the one the table shows in that cell.
  assert.equal(cellText(homologation, at.homologation.rows[0], at.homologation.factor(0)), "0.95");

  // The adopted value: its row of the boxes under the table.
  const [boxId, rowKey] = at.adopted.box.split(".");
  const box = tableOf(captured, at.adopted.table).schema?.summaryBoxes?.find((item) => item.id === boxId);
  const row = box?.rows.find((item, index) => String(item.id ?? index) === rowKey);
  assert.match(row?.label ?? "", /a utilizar|adoptad/i);
  assert.equal(row?.value, "$ 4,100.00");
  const other = marketPages(market({ adoptedUnitValue: 4000 }), true);
  assert.equal(tableOf(other, at.adopted.table).schema?.summaryBoxes?.find((item) => item.id === boxId)?.rows.find((item, index) => String(item.id ?? index) === rowKey)?.value, "$ 4,000.00");

  const characteristics = tableOf(captured, at.characteristics.table);
  assert.equal(headerOf(characteristics, at.characteristics.location), "UBICACIÓN");
  assert.equal(headerOf(characteristics, at.characteristics.text), "CARACTERÍSTICAS");
  const offers = tableOf(captured, at.offers.table);
  assert.match(headerOf(offers, at.offers.area) ?? "", /SUPERFICIE/);
  assert.match(headerOf(offers, at.offers.price) ?? "", /OFERTA/);
  assert.equal(cellText(offers, at.offers.rows[1], at.offers.area), "320.00");
});

test("mercado: a homologation left out of the dictamen is still where its factors are captured", () => {
  const calculation = market({ showHomologationTable: false });
  const at = marketCaptureColumns(calculation);
  assert.equal(tablesOf(marketPages(calculation, false)).some((table) => table.id === at.homologation.table), false, "the dictamen does not print it");
  assert.deepEqual(tableOf(marketPages(calculation, true), at.homologation.table).rows.map((row) => row.id), at.homologation.rows);
});

/* ------------------------------ Ingresos ------------------------------ */

const income = (patch: Partial<IncomeCalculationDto> = {}): IncomeCalculationDto => ({
  ...DEFAULT_INCOME,
  rentableUnits: [{ description: "Casa habitación", area: 180, unitRent: 95 }],
  deductions: [{ concept: "Predial", rate: 0.03 }, { concept: "Mantenimiento", rate: 0.05 }],
  appliedRate: 0.1,
  rentMarket: { adoptedUnitRent: null, subjectArea: null, comparables: [], homologation: null },
  configured: true,
  locked: false,
  ...patch,
});
function incomeResult(calculation: IncomeCalculationDto) {
  const input = toIncomeEngineInput(calculation);
  return input.ok ? computeIncomeApproach(input.input, DEFAULT_ENGINE_CONFIG) : null;
}

test("ingresos: the rentable surfaces, the deductions and the ratings of the rate are captured in the tables of their blocks", () => {
  const calculation = income();
  const result = incomeResult(calculation);
  assert.ok(result);
  const printed = incomeDocumentBlocks(calculation, result);
  const captured = incomeCaptureBlocks(calculation, result);
  // The same blocks as the dictamen, in its order, plus the table of the rate still without its ratings.
  assert.deepEqual(captured.map((block) => block.id), printed.map((block) => block.id));
  const units = tableOf(captured, INCOME_CAPTURE.units.table);
  assert.deepEqual(units.rows.map((row) => row.id), INCOME_CAPTURE.rows(INCOME_CAPTURE.units.table, 1));
  // The columns are named by their place: the dictamen's table of the income approach is saved with ids of its own.
  const place = (table: ReturnType<typeof ensureTableV2>, column: string) => table.columns[Number(column.slice(1))].name;
  assert.equal(INCOME_CAPTURE.units.area, captureColumnPlace(1));
  assert.deepEqual([INCOME_CAPTURE.units.description, INCOME_CAPTURE.units.area, INCOME_CAPTURE.units.unitRent].map((column) => place(units, column)), ["Concepto", "Superficie rentable", "Renta unitaria"]);
  const deductions = tableOf(captured, INCOME_CAPTURE.deductions.table);
  assert.deepEqual([INCOME_CAPTURE.deductions.concept, INCOME_CAPTURE.deductions.rate].map((column) => place(deductions, column)), ["Concepto", "Porcentaje"]);
  const rating = tableOf(captured, INCOME_CAPTURE.rating.table);
  assert.equal(rating.rows.length, 7, "the seven criteria, to rate each in its row");
  assert.equal(place(rating, INCOME_CAPTURE.rating.option), "Calificación");
  // What the dictamen prints of those tables is what the capture shows.
  const text = (table: ReturnType<typeof ensureTableV2>) => table.rows.map((row) => table.columns.map((column) => { const cell = row.cells[column.id]; return cell?.kind === "value" ? cell.value : ""; }));
  assert.deepEqual(text(units), text(tableOf(printed, INCOME_CAPTURE.units.table)));
  assert.deepEqual(text(deductions), text(tableOf(printed, INCOME_CAPTURE.deductions.table)));

  // A surface and a deduction being written have their rows before there is a result; the value typed is the one shown.
  const writing = income({ rentableUnits: [{ description: "", area: null, unitRent: null }, { description: "Local", area: 40, unitRent: 120 }], deductions: [{ concept: "", rate: null }], appliedRate: null });
  const pending = incomeCaptureBlocks(writing, null);
  assert.deepEqual(pending.map((block) => block.id), ["motor-ingresos-rentas", "motor-ingresos-deducciones", "motor-ingresos-tasa"]);
  assert.equal(tableOf(pending, INCOME_CAPTURE.units.table).rows.length, 2);
  assert.equal(tableOf(pending, INCOME_CAPTURE.units.table).rows[1].cells["col-2"].kind === "value" && cellText(tableOf(pending, INCOME_CAPTURE.units.table), INCOME_CAPTURE.rows(INCOME_CAPTURE.units.table, 2)[1], "col-2"), "40.00 m²");
  assert.equal(tableOf(pending, INCOME_CAPTURE.deductions.table).rows.length, 1);
  // The market-rate method prints no table of what it captures: it stays in its panel.
  assert.deepEqual(incomeCaptureBlocks(income({ method: "mercado" }), null), []);
});

/* ------------------------- One place in the editor ------------------------- */

test("the editor shows each block of the calculation once, with the tables of the capture and the appraiser's layout; the template's blocks give way", () => {
  const calculation = costs();
  const at = costCaptureColumns(costColumnsOf(calculation.columns));
  const live = costPages(calculation, true);
  const template: Block = { id: COST_TEMPLATE_BLOCK_IDS[0], title: "Terreno", sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [] };
  const own: Block = { ...template, id: "bloque-propio", title: "Notas del valuador" };
  const pages = { blocks: live, placeholderIds: COST_TEMPLATE_BLOCK_IDS };

  // Nothing written in the dictamen yet: the page of the capture stands where the template's block was, once.
  const before = captureDisplayBlocks([template, own], pages);
  assert.deepEqual(before.filter((item) => !item.placeholder).map((item) => [item.block.id, item.pending, item.capture]), [[live[0].id, true, true], ["bloque-propio", false, false]]);
  // The template's block still prints until the calculation replaces it: it stays within reach, apart.
  assert.deepEqual(before.filter((item) => item.placeholder).map((item) => item.block.id), [template.id]);

  // Written by the calculation, with a header the appraiser renamed and the block hidden: both stay, and the rows are the capture's.
  const saved = costPages(calculation, false)[0];
  const renamed: Block = {
    ...saved,
    enabled: false,
    apartados: saved.apartados.map((apartado) => ({
      ...apartado,
      tables: apartado.tables.map((table) => (table.id === at.constructionValues.table
        ? editGeneratedTable(table, (current) => ({ ...renameTableColumn(ensureTableV2(current), at.constructionValues.unitReplacementCost, "VRN por m²"), version: 2 }) as unknown as TableContent)
        : table)),
    })),
  };
  const after = captureDisplayBlocks([own, renamed], pages);
  assert.deepEqual(after.map((item) => [item.block.id, item.pending]), [["bloque-propio", false], [saved.id, false]]);
  const shown = tableOf([after[1].block], at.constructionValues.table);
  assert.equal(after[1].block.enabled, false);
  assert.equal(headerOf(shown, at.constructionValues.unitReplacementCost), "VRN por m²");
  assert.equal(shown.rows.length, 2, "with the construction the dictamen does not print yet");
  assert.equal(sourceOf(shown).rows.length, 2);
  assert.deepEqual(layoutOf(shown).labels, { [at.constructionValues.unitReplacementCost]: "VRN por m²" });

  // Without a calculation capturing (another section, a reader of the dictamen), the blocks are the document's.
  assert.deepEqual(captureDisplayBlocks([template, own], null).map((item) => item.block.id), [template.id, "bloque-propio"]);
});

test("a cell the calculation captures is one field: the table leaves its place to the capture and shows no locked figure there", () => {
  const calculation = costs();
  const at = costCaptureColumns(costColumnsOf(calculation.columns));
  const table = tablesOf(costPages(calculation, true)).find((item) => item.id === at.constructionValues.table);
  assert.ok(table);
  const [first] = at.constructionValues.rows(calculation.constructions.map((row) => row.ref));
  const address = { table: at.constructionValues.table, row: first, column: at.constructionValues.unitReplacementCost };
  const render = (store: CaptureStore) => renderToStaticMarkup(
    createElement(CaptureStoreProvider, { value: store },
      createElement(GeneratedTableEditor, { table, readOnly: false, capture: true, onUpdate: () => {} })),
  );
  const cells = (html: string) => (html.match(new RegExp(`data-row-id="${first}"`, "g")) ?? []).length;

  const plain = new CaptureStore();
  const without = render(plain);
  assert.equal(without.includes(`data-capture-slot="${captureSlotKey(address)}"`), false);
  const declared = new CaptureStore();
  declared.declare(captureSlotKey(address));
  const withCapture = render(declared);
  assert.equal((withCapture.match(new RegExp(`data-capture-slot="${captureSlotKey(address).replace(/[|]/g, "\\|")}"`, "g")) ?? []).length, 1, "one place for the field");
  assert.equal(cells(withCapture), cells(without) - 1, "and no figure of the table's own in that cell");
  assert.match(withCapture, /Las celdas en blanco son la captura del cálculo/);
});
