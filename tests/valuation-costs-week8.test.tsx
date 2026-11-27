/**
 * Álvaro's observations of week 8 on the cost approach and its tables
 * (videos 8.5 to 8.7 and 8.12, 26 nov 2026): the Cons. cell written as
 * «Nuevo = 0.98» with the factor for the calculation and the word in the
 * construction section, P/C written, the boxes under the installations
 * (VRN, sums, VNR) arranged as a small table, missing data marked from the
 * start, the lote tipo saying what it takes, the criteria kept for the firm,
 * and where a linked datum appears.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { normalizeCapture, withConstructionTables } from "../src/features/valuations/calculation/construction-capture";
import {
  CONSERVATION_STATE_TABLE,
  DEFAULT_CONSERVATION_CRITERION,
  DEFAULT_LAND,
  conservationText,
  conservationWord,
  emptyInstallation,
  landReferencePlaceholder,
  missingCostFields,
  readConservationText,
  readInstallationShare,
  toCostEngineInput,
  type ConservationCriterionDto,
  type CostCalculationDto,
} from "../src/features/valuations/calculation/cost-types";
import { applyTableLayout, arrangedBoxRows, sourceOf, withBoxLabel, withBoxRows } from "../src/features/valuations/calculation/generated-table-layout";
import { generatedTable, figureColumn, textColumn } from "../src/features/valuations/calculation/generated-content";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeCostApproach } from "../src/features/valuations/engine/costs";
import { removeCriterionFrom, resolveSavedCriteria, saveCriterionTo, savedCriterionSchema } from "../src/features/firm/conservation-criteria";
import { resolveCustomUnits } from "../src/features/firm/custom-units";
import { resolveFirmLists } from "../src/features/firm/firm-lists";
import type { AppSection, TableContent } from "../src/features/valuations/model";
import { construccionSection } from "../src/features/valuations/sections/construccion";
import { linkedPlaces } from "../src/features/valuations/services/concept-link-suggestions";
import { ensureTableV2, getDisplayColumns } from "../src/features/valuations/services/table";
import { GeneratedBlockTables } from "../src/features/valuations/components/editor/generated-block-tables";
import { TableEditorItem } from "../src/features/valuations/components/editor/table-editor";
import { CalculatedTableProvider } from "../src/features/valuations/components/editor/calculated-table-context";
import { incomeDocumentBlocks } from "../src/features/valuations/calculation/income-document";
import { DEFAULT_ANNUITY, DEFAULT_DEDUCTIONS, DEFAULT_MARKET_RATE, toIncomeEngineInput, type IncomeCalculationDto } from "../src/features/valuations/calculation/income-types";
import { computeIncomeApproach } from "../src/features/valuations/engine/income";

const own: ConservationCriterionDto = {
  kind: "PROPIO",
  name: "Criterio Valuaxis",
  options: [{ label: "Nuevo", factor: 0.98 }, { label: "Normal", factor: 0.95 }, { label: "Reparaciones Sencillas", factor: 0.75 }],
};

test("Cons. is written as «Nuevo = 0.98», a factor or a state: the calculation takes the number, the word is kept (video 8.12, 29:30)", () => {
  assert.deepEqual(readConservationText("Nuevo = 0.98", own), { conservation: 0.98, state: "Nuevo" });
  assert.deepEqual(readConservationText("0.5", own), { conservation: 0.5, state: null }, "a factor of his own");
  assert.deepEqual(readConservationText("normal", own), { conservation: 0.95, state: "Normal" }, "a state of the list alone takes its factor");
  assert.deepEqual(readConservationText("Bueno = 0,9x", own), { conservation: null, state: "Bueno" }, "a factor that does not read leaves the row without Cons.");
  assert.deepEqual(readConservationText("", own), { conservation: null, state: null });
  assert.deepEqual(readConservationText("Muy bueno", DEFAULT_CONSERVATION_CRITERION), { conservation: null, state: "Muy bueno" });
  // Read back, the cell shows it as it was picked.
  assert.equal(conservationText({ conservation: 0.98, conservationState: "Nuevo" }), "Nuevo = 0.98");
  assert.equal(conservationText({ conservation: 0.75, conservationState: null }), "0.75");
  assert.equal(conservationText({ conservation: null }), "");
});

test("the factor written with its word values the installation as the factor alone", () => {
  const base: CostCalculationDto = {
    land: DEFAULT_LAND, types: [], constructions: [], indirects: [],
    installations: [{ ...emptyInstallation(0), description: "Tanque", unit: "Pza", quantity: 1, age: 6, usefulLife: 20, conservation: 0.98, unitReplacementCost: 9400 }],
    market: { adoptedUnitValue: null, subjectArea: null, baseArea: null }, configured: true, typesCaptured: true, locked: false,
  };
  const read = readConservationText("Nuevo = 0.98", own);
  const withWord = { ...base, installations: [{ ...base.installations[0], conservation: read.conservation, conservationState: read.state }] };
  const value = (calculation: CostCalculationDto) => {
    const input = toCostEngineInput(calculation);
    assert.ok(input.ok);
    return computeCostApproach(input.input, DEFAULT_ENGINE_CONFIG).specialInstallations;
  };
  assert.equal(value(withWord), value(base));
});

test("INF. CONSTRUCCIÓN shows the word of the conservation linked from costs, not its number (video 8.6, 1:10)", () => {
  assert.equal(conservationWord({ conservationState: "Nuevo" }), "Nuevo");
  assert.equal(conservationWord({ conservationState: null, conservationRating: 9 }), "Nuevo", "Ross-Heidecke: the estado of the calificación");
  assert.equal(conservationWord({ conservationState: null, conservationRating: null }), null);

  const section = JSON.parse(JSON.stringify(construccionSection)) as AppSection;
  const costs: CostCalculationDto = {
    land: DEFAULT_LAND, types: [], constructions: [], indirects: [],
    installations: [
      { ...emptyInstallation(0), description: "Tanque", unit: "Pza", quantity: 1, age: 6, usefulLife: 20, conservation: 0.98, conservationState: "Nuevo", unitReplacementCost: 9400 },
      { ...emptyInstallation(1), ref: "2", description: "Enrejado", unit: "Lote", quantity: 1, age: 6, usefulLife: 30, conservation: 0.95, unitReplacementCost: 24000 },
    ],
    market: { adoptedUnitValue: null, subjectArea: null, baseArea: null }, configured: true, typesCaptured: true, locked: false,
  };
  const withTables = withConstructionTables(section, costs);
  const table = withTables.blocks.flatMap((block) => [block, ...block.apartados]).flatMap((container) => container.tables).find((item) => item.id === "instalaciones_especiales")!;
  const normalized = ensureTableV2(normalizeCapture(table, costs));
  const conservation = getDisplayColumns(normalized).find((column) => column.id === "conservacion")!;
  const texts = normalized.rows.slice(0, 2).map((row) => {
    const cell = row.cells[conservation.id];
    return cell?.kind === "value" ? cell.value : "";
  });
  assert.deepEqual(texts, ["Nuevo", "0.950"], "the word when costs has one; its factor otherwise");
});

test("P/C is written: P or C, or the word, in any case (video 8.12, 31:10)", () => {
  assert.equal(readInstallationShare("p"), "P");
  assert.equal(readInstallationShare(" C "), "C");
  assert.equal(readInstallationShare("Común"), "C");
  assert.equal(readInstallationShare("privativa"), "P");
  assert.equal(readInstallationShare("X"), null);
});

test("what a row lacks is marked from the start, in every row (video 8.7, 5:39)", () => {
  const started = { ...emptyInstallation(0), description: "Cocina integral", unit: "Lote" };
  assert.deepEqual(missingCostFields(started, "installations"), ["quantity", "age", "usefulLife", "conservation", "unitReplacementCost"]);
  assert.deepEqual(missingCostFields({ ...started, quantity: 1, age: 6, usefulLife: 20, conservation: 0.98 }, "installations"), ["unitReplacementCost"]);
  assert.deepEqual(missingCostFields({ ...started, quantity: 1, age: 6, usefulLife: 20, conservationRating: 10, unitReplacementCost: 75000 }, "installations"), []);
  assert.deepEqual(missingCostFields(emptyInstallation(3), "installations"), [], "a row not started is not marked");
});

test("the lote tipo says what it takes: «Igual al sujeto: 360 m²», not just «Igual al sujeto» (video 8.7, 1:10)", () => {
  const market = { adoptedUnitValue: null, subjectArea: null, baseArea: null };
  assert.equal(landReferencePlaceholder({ land: { ...DEFAULT_LAND, subjectArea: 360 }, market }), "Igual al sujeto: 360 m²");
  assert.equal(landReferencePlaceholder({ land: DEFAULT_LAND, market: { ...market, subjectArea: 1250.5 } }), "Igual al sujeto: 1,250.5 m²");
  assert.equal(landReferencePlaceholder({ land: DEFAULT_LAND, market }), "Igual al sujeto (falta su superficie)");
  assert.equal(landReferencePlaceholder({ land: DEFAULT_LAND, market: { ...market, baseArea: 140 } }), "De mercado: 140 m²");
});

/** A table with the boxes of the installations, as cost-document writes it. */
function installationsValues(): TableContent {
  return generatedTable("motor-costos-enfoque-tabla-instalaciones-valores", "Valor de las instalaciones especiales", [textColumn("Ref."), figureColumn("VNR")], [["1", "$ 9,400.00"]], {
    summaryBoxes: [
      { id: "vrn", position: "bottom", align: "center", rows: [{ id: "total", label: "Valor de Reposición Nuevo (V.R.N.):", value: "$ 493,135.89" }] },
      { id: "sumas", position: "bottom", align: "end", rows: [
        { id: "0", label: "Suma Privativa (P):", value: "$ 440,131.88" },
        { id: "1", label: "Suma Común (C):", value: "$ 0.00" },
        { id: "2", label: "Valor Neto de Reposición (V.N.R.):", value: "$ 440,131.88" },
      ] },
    ],
  });
}
const printedBox = (table: TableContent, id: string) => ensureTableV2(table).schema?.summaryBoxes?.find((box) => box.id === id)?.rows.map((row) => [row.label, row.value]);

test("the rows of a box are arranged as a small table: hidden, reordered, own rows added, labels renamed (video 8.7, 13:10)", () => {
  const table = installationsValues();
  const box = sourceOf(table).schema!.summaryBoxes![1];
  let layout = withBoxRows({}, "sumas", (current) => ({ ...current, hidden: ["sumas.1"] }));
  layout = withBoxRows(layout, "sumas", (current) => ({ ...current, extra: [{ id: "propio-1", label: "Redondeo:", value: "$ 440,000.00" }] }));
  layout = withBoxRows(layout, "sumas", (current) => ({ ...current, order: ["sumas.2", "sumas.0", "sumas.propio-1", "sumas.1"] }));
  layout = withBoxLabel(layout, "sumas.2", "VNR:");
  assert.deepEqual(arrangedBoxRows(box, layout).map((item) => [item.key, item.hidden, item.own]), [
    ["sumas.2", false, false], ["sumas.0", false, false], ["sumas.propio-1", false, true], ["sumas.1", true, false],
  ]);
  const shown = applyTableLayout(table, layout);
  assert.deepEqual(printedBox(shown, "sumas"), [["VNR:", "$ 440,131.88"], ["Suma Privativa (P):", "$ 440,131.88"], ["Redondeo:", "$ 440,000.00"]]);
  assert.deepEqual(printedBox(shown, "vrn"), [["Valor de Reposición Nuevo (V.R.N.):", "$ 493,135.89"]], "the other box as written");
  // Written again by the calculation, the arrangement stays; emptied, the box is the calculation's again.
  assert.deepEqual(printedBox(applyTableLayout(installationsValues(), layout), "sumas"), printedBox(shown, "sumas"));
  const cleared = withBoxRows(layout, "sumas", () => ({}));
  assert.equal(cleared.boxRows?.sumas, undefined);
  assert.deepEqual(printedBox(applyTableLayout(table, { ...cleared, boxLabels: {} }), "sumas")?.map(([label]) => label), ["Suma Privativa (P):", "Suma Común (C):", "Valor Neto de Reposición (V.N.R.):"]);
});

test("a «Criterio propio» is kept for the firm or for the appraiser alone and offered again (video 8.7, 1:40)", () => {
  const units = ["m²", { lista: "tipoAvaluo", nombre: "Catastral" }];
  const criterion = savedCriterionSchema.parse({ name: " Criterio  Valuaxis ", scope: "despacho", options: own.options });
  let stored: unknown = saveCriterionTo(units, criterion, 7);
  stored = saveCriterionTo(stored, { name: "Mío", scope: "personal", options: CONSERVATION_STATE_TABLE }, 7);
  assert.deepEqual(resolveSavedCriteria(stored, 7).map((item) => [item.name, item.scope]), [["Criterio Valuaxis", "despacho"], ["Mío", "personal"]]);
  assert.deepEqual(resolveSavedCriteria(stored, 8).map((item) => item.name), ["Criterio Valuaxis"], "another member of the team sees the firm's only");
  // Saved again with other states, it replaces the one of the same name and scope.
  stored = saveCriterionTo(stored, { ...criterion, name: "criterio valuaxis", options: [{ label: "Nuevo", factor: 1 }] }, 9);
  assert.deepEqual(resolveSavedCriteria(stored, 7).find((item) => item.scope === "despacho")?.options, [{ label: "Nuevo", factor: 1 }]);
  // The units and the firm's lists stay where they were.
  assert.deepEqual(resolveCustomUnits(stored), ["m²"]);
  assert.deepEqual(resolveFirmLists(stored).appraisalKinds, ["Catastral"]);
  // Another user cannot take out someone's own.
  assert.equal(removeCriterionFrom(stored, "Mío", "personal", 8).removed, false);
  const removed = removeCriterionFrom(stored, "Mío", "personal", 7);
  assert.equal(removed.removed, true);
  assert.deepEqual(resolveSavedCriteria(removed.stored, 7).map((item) => item.name), ["criterio valuaxis"]);
  assert.equal(savedCriterionSchema.safeParse({ name: "", scope: "despacho", options: own.options }).success, false);
  assert.equal(savedCriterionSchema.safeParse({ name: "X", scope: "despacho", options: [] }).success, false);
});

test("a linked concept lists where else its datum is, as «Buscar valor» does (video 8.5, 13:20)", () => {
  const concept = (id: string, label: string, valueKey?: string, labelKey?: string) => ({ id, label, value: "De tambor", enabled: true, ...(valueKey ? { valueKey } : {}), ...(labelKey ? { labelKey } : {}) });
  const sections = [
    { id: "caratula", label: "", title: "CARÁTULA", sourceFile: "", enabled: true, required: true, blocks: [
      { id: "b1", title: "Datos del bien", sectionLabel: "", enabled: true, required: false, concepts: [concept("c1", "Puertas", "k1")], apartados: [], tables: [], images: [] },
    ] },
    { id: "construccion", label: "", title: "IV. INF CONSTRUCCIONES", sourceFile: "", enabled: true, required: false, blocks: [
      { id: "b2", title: "Carpintería", sectionLabel: "", enabled: true, required: false, concepts: [concept("c2", "Puertas de intercomunicación", "k1", "l1"), concept("c3", "Puertas de closets", "k1", "l1"), concept("c4", "Closets")], apartados: [], tables: [], images: [] },
    ] },
  ] as AppSection[];
  assert.deepEqual(linkedPlaces(sections, "c2").map((place) => [place.concept.id, place.location, place.shares]), [
    ["c1", "CARÁTULA › Datos del bien", "dato"],
    ["c3", "IV. INF CONSTRUCCIONES › Carpintería", "título y dato"],
  ]);
  assert.deepEqual(linkedPlaces(sections, "c4"), [], "a concept without links");
});

test("the tables of a calculation's block are dragged as any block's, without «Junto a la anterior» / «En su renglón» (video 8.10, 25:40)", () => {
  const income: IncomeCalculationDto = {
    method: "tabla", annuity: DEFAULT_ANNUITY, marketRate: DEFAULT_MARKET_RATE,
    rentableUnits: [{ description: "Casa", area: 250, unitRent: 30 }], deductions: DEFAULT_DEDUCTIONS, ratingColumns: [1, 3, 1, 2, 2, 0, 4],
    appliedRate: null, rateFromMarket: null, weightedRate: null, rounding: null,
    rentMarket: { adoptedUnitRent: 30, subjectArea: 250, comparables: [], homologation: null }, configured: true, locked: false,
  };
  const input = toIncomeEngineInput(income);
  assert.ok(input.ok);
  const block = incomeDocumentBlocks(income, computeIncomeApproach(input.input, DEFAULT_ENGINE_CONFIG)).find((item) => item.id === "motor-ingresos-tasa")!;
  const html = renderToStaticMarkup(createElement(GeneratedBlockTables, {
    block, capture: true, pending: false, readOnly: false,
    onLayoutChange: () => undefined, onUpdateTable: () => undefined, onAddTableColumn: () => undefined, onAddTableRow: () => undefined, onRemoveTable: () => undefined,
  }));
  assert.equal((html.match(/aria-label="Reordenar elemento"/g) ?? []).length, 3, "one handle per table, as in any block");
  assert.ok(!html.includes("Junto a la anterior") && !html.includes("En su renglón"));
  // «Ajustar al contenido» narrows «Tasa a utilizar» in the editor too, not only in the dictamen.
  assert.match(html, /data-width-mode="content"/);
});

test("«—» of a table captured in place is marked as a missing datum from the start, and says what is missing", () => {
  const table = generatedTable("motor-costos-enfoque-tabla-instalaciones-valores", "Valor", [textColumn("Ref."), figureColumn("VRN")], [["1", "$ 9,400.00"], ["2", "—"]]);
  const source = ensureTableV2(table);
  const lock = { row: () => true, column: (id: string) => id === source.columns[1].id, inPlace: true, columnPlace: () => -1 };
  const html = renderToStaticMarkup(createElement(CalculatedTableProvider, { value: lock }, createElement(TableEditorItem, {
    table, readOnly: false, onUpdate: () => undefined, onAddColumn: () => undefined, onAddRow: () => undefined, onRemove: () => undefined,
  })));
  const marked = html.match(/<input[^>]*data-missing-data=""[^>]*>/g) ?? [];
  assert.equal(marked.length, 1);
  assert.match(marked[0], /Falta un dato de este renglón/);
});
