import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_LAND, costEngineConfig, toCostEngineInput, type CostCalculationDto } from "../src/features/valuations/calculation/cost-types";
import { defaultMarketSettings, marketEngineConfig, toMarketEngineInput, type ComparableDto, type MarketCalculationDto } from "../src/features/valuations/calculation/market-types";
import { defaultStatisticalSettings, type StatisticalCalculationDto } from "../src/features/valuations/calculation/statistical-types";
import { ENGINE_VERSION } from "../src/features/valuations/engine/config";
import { computeCostApproach } from "../src/features/valuations/engine/costs";
import { computeMarketApproach } from "../src/features/valuations/engine/market";
import { Trace } from "../src/features/valuations/engine/trace";
import {
  buildCalculationMemory,
  formatEngineValue,
  memoryChapters,
  memoryComparableCards,
  type CalculationMemoryInput,
  type MemoryCalculations,
  type MemoryConcept,
  type MemoryTable,
} from "../src/features/valuations/memory/calculation-memory";
import type { Apartado, AppSection, Block, Concept, TableContent } from "../src/features/valuations/model";
import { buildFormulaIndex, columnLetter, compileFormula } from "../src/features/valuations/services/formula-references";
import { setCellFormula, type TableV2 } from "../src/features/valuations/services/table";
import { applyValuationFormulas } from "../src/features/valuations/services/valuation-formulas";

/* ------------------------------------------------------------------ */
/*  Builders                                                           */
/* ------------------------------------------------------------------ */

function tableOf(id: string, title: string, columns: string[], rows: string[][]): TableV2 {
  return {
    id,
    title,
    version: 2,
    columns: columns.map((name, index) => ({ id: `${id}-c${index + 1}`, name })),
    rows: rows.map((row, rowIndex) => ({
      id: `${id}-r${rowIndex + 1}`,
      cells: Object.fromEntries(row.map((value, columnIndex) => [`${id}-c${columnIndex + 1}`, { kind: "value" as const, value }])),
    })),
  };
}

/** Writes a formula in a cell as the editor does. */
function typed(table: TableV2, address: string, text: string, sections: AppSection[] = []): TableV2 {
  const compiled = compileFormula(text, { index: buildFormulaIndex(sections), table });
  assert.ok(compiled.ok, `${text} compiles${compiled.ok ? "" : `: ${compiled.message}`}`);
  const [, letters, number] = /^([A-Z]+)(\d+)$/.exec(address)!;
  const column = table.columns.find((_, index) => columnLetter(index) === letters)!;
  return setCellFormula(table, table.rows[Number(number) - 1].id, column.id, compiled.formula);
}

const apartado = (id: string, title: string, parts: Partial<Apartado>): Apartado => ({
  id, title, enabled: true, concepts: [], tables: [], images: [], ...parts,
});
const block = (id: string, title: string, sectionLabel: string, parts: Partial<Block>): Block => ({
  id, title, sectionLabel, enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [], ...parts,
});
const section = (id: string, label: string, title: string, blocks: Block[]): AppSection => ({
  id, label, title, sourceFile: "", enabled: true, required: false, blocks,
});
const asContent = (table: TableV2) => table as unknown as TableContent;

const NO_CALCULATIONS: MemoryCalculations = { markets: [], cost: null, income: null, machinery: null, conclusion: null };

function memoryOf(sections: AppSection[], calculations: MemoryCalculations = NO_CALCULATIONS, stored: CalculationMemoryInput["stored"] = []) {
  return buildCalculationMemory({
    sections: applyValuationFormulas(sections),
    calculations,
    stored,
    folio: "VDA-0001",
    valuationDate: "2026-10-20",
    firmName: "Valuadores de los Altos",
    concluded: true,
    generatedAt: new Date("2026-10-20T18:30:00Z"),
  });
}

/* ------------------------------------------------------------------ */
/*  Document formulas                                                  */
/* ------------------------------------------------------------------ */

/** Terreno with a boundaries apartado: a free table whose C column is A × B, and a total. */
function terrenoSections() {
  let boundaries = tableOf("colindancias", "Medidas y colindancias", ["Medida", "Factor", "Resultado"], [
    ["1200", "0.95", ""],
    ["800", "1.05", ""],
    ["", "", ""],
  ]);
  boundaries = typed(boundaries, "C1", "=A1*B1");
  boundaries = typed(boundaries, "C2", "=A2*B2");
  boundaries = typed(boundaries, "C3", "=PROMEDIO(C1:C2)");
  const plain = tableOf("plain", "Sin fórmulas", ["Dato"], [["40"]]);
  const hidden = { ...typed(tableOf("hidden", "Oculta", ["A"], [["1"], [""]]), "A2", "=A1*2"), enabled: false };
  return [
    section("caratula", "I", "CARÁTULA", []),
    section("terreno", "III", "INFO TERRENO", [
      block("terreno-medidas", "Terreno", "III", {
        apartados: [apartado("medidas", "Medidas y colindancias", { tables: [asContent(boundaries), asContent(plain), asContent(hidden)] })],
      }),
    ]),
  ];
}

test("a formula table prints with column letters and row numbers, computed cells in blue with their formula", () => {
  const memory = memoryOf(terrenoSections());
  const tables = memory.document.filter((item): item is MemoryTable => item.kind === "table");
  assert.deepEqual(tables.map((table) => table.title), ["Medidas y colindancias"], "tables without formulas and hidden tables are left out");

  const [table] = tables;
  assert.deepEqual(table.location, ["III. INFO TERRENO", "III. Terreno", "III.1 Medidas y colindancias", "Medidas y colindancias"]);
  assert.deepEqual(table.columns, [
    { letter: "A", name: "Medida" },
    { letter: "B", name: "Factor" },
    { letter: "C", name: "Resultado" },
  ]);
  assert.deepEqual(table.rows.map((row) => row.number), [1, 2, 3]);

  const [typedCell, factorCell, computedCell] = table.rows[0].cells;
  assert.deepEqual(typedCell, { address: "A1", text: "1200", computed: false }, "a typed value is black and has no formula");
  assert.equal(factorCell.computed, false);
  assert.equal(computedCell.address, "C1");
  assert.equal(computedCell.computed, true, "a formula cell prints blue");
  assert.equal(computedCell.formula, "=A1*B1");
  assert.equal(computedCell.withValues, "=1200*0.95");
  assert.equal(computedCell.text, "1,140");

  const average = table.rows[2].cells[2];
  assert.equal(average.formula, "=PROMEDIO(C1:C2)");
  assert.equal(average.withValues, "=PROMEDIO(1140; 840)", "a range reads its values, results of other formulas included");
  assert.equal(average.text, "990");
});

test("a concept computed by a formula prints its formula, with the values it read, and its value", () => {
  const base = terrenoSections();
  const area: Concept = { id: "sup", label: "Superficie de terreno", value: "169.78", type: "measurement", valueFormat: "m2" };
  const draft = [...base, section("costos", "VI", "ENF. COSTOS", [block("costos-datos", "Datos", "VI", { concepts: [area] })])];
  const compiled = compileFormula("=[Superficie de terreno]*9000", { index: buildFormulaIndex(draft) });
  assert.ok(compiled.ok);
  const value: Concept = { id: "valor", label: "Valor del terreno", value: "", type: "currency", formula: compiled.formula };
  const typedOnly: Concept = { id: "nota", label: "Nota", value: "=1+1" };
  const sections = [...base, section("costos", "VI", "ENF. COSTOS", [block("costos-datos", "Datos", "VI", { concepts: [area, value, typedOnly] })])];

  const concepts = memoryOf(sections).document.filter((item): item is MemoryConcept => item.kind === "concept");
  assert.equal(concepts.length, 1, "only concepts with a formula of their own");
  assert.deepEqual(concepts[0], {
    kind: "concept",
    id: "valor",
    location: ["VI. ENF. COSTOS", "VI. Datos"],
    label: "Valor del terreno",
    value: concepts[0].value,
    formula: "=[Superficie de terreno]*9000",
    withValues: "=169.78*9000",
  });
  assert.match(concepts[0].value, /1,528,020/);
});

test("the engine's own blocks are not repeated as document formulas", () => {
  const generated = typed(tableOf("motor-t", "Homologación", ["A"], [["1"], [""]]), "A2", "=A1*2");
  const memory = memoryOf([section("mercadoVenta", "VII", "MERCADO", [block("motor-mercado-terreno_venta-enfoque", "ENFOQUE", "VII", { tables: [asContent(generated)] })])]);
  assert.deepEqual(memory.document, []);
});

/* ------------------------------------------------------------------ */
/*  Engine traces                                                      */
/* ------------------------------------------------------------------ */

function comparable(reference: number, area: number, price: number, factors: ComparableDto["factors"] = []): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Comparable ${reference}`, area, price,
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null,
    sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, photos: [],
    factors: [{ type: "NEGOCIACION", value: 0.95, subjectRating: null, comparableRating: null, justification: null }, ...factors],
  };
}

const zone = { type: "ZONA" as const, value: 1.25, subjectRating: 1, comparableRating: 0.8, justification: null };
const land: MarketCalculationDto = {
  settings: { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 169.78, surfacePower: 6, adoptedUnitValue: 9000 },
  comparables: [comparable(1, 140, 1260000, [zone]), comparable(2, 192.5, 2032590), comparable(3, 196.62, 2261130), comparable(4, 140, 1330000)],
  locked: false,
  configured: true,
};

const cost: CostCalculationDto = {
  land: { ...DEFAULT_LAND, subjectArea: 169.78 },
  types: [],
  constructions: [],
  installations: [],
  indirects: [],
  market: { adoptedUnitValue: 9000, subjectArea: 169.78, baseArea: null },
  configured: true,
  typesCaptured: false,
  locked: false,
};

const marketSection = section("mercadoVenta", "VII", "ENF. MERCADO", []);
const costSection = section("costos", "VI", "ENF. COSTOS", []);

function marketTrace() {
  const input = toMarketEngineInput(land);
  assert.ok(input.ok);
  const trace = new Trace();
  computeMarketApproach(input.input, marketEngineConfig(land.settings), trace);
  return trace;
}

test("each approach prints the engine's steps in the order of the calculation, with inputs and result", () => {
  const memory = memoryOf([costSection, marketSection], { ...NO_CALCULATIONS, markets: [land], cost });
  assert.equal(memory.engineVersion, ENGINE_VERSION);
  // In the order the dictamen prints their sections: costs (VI) before the market (VII).
  assert.deepEqual(memory.approaches.map((approach) => [approach.key, approach.location]), [
    ["MOTOR.COSTOS", ["VI. ENF. COSTOS", "Enfoque de costos"]],
    ["MOTOR.MERCADO.TERRENO_VENTA", ["VII. ENF. MERCADO", "Enfoque de mercado · Terrenos en venta"]],
  ]);

  const [costs, market] = memory.approaches;
  const trace = marketTrace();
  assert.deepEqual(market.steps.map((step) => step.key), trace.steps.map((step) => step.key), "the engine's order");
  const first = market.steps[0];
  assert.equal(first.label, "Valor unitario, comparable 1");
  assert.equal(first.formula, "precio / superficie");
  assert.deepEqual(first.inputs, [{ name: "Precio", value: "1,260,000" }, { name: "Superficie", value: "140" }]);
  assert.equal(first.value, "9,000");
  const surface = market.steps.find((step) => step.key.endsWith("1.factorSuperficie"));
  assert.ok(surface?.inputs.some((item) => item.name === "Superficie comparable"), "input names read as words");
  const last = market.steps.at(-1)!;
  assert.equal(last.key, "mercado.valor");
  assert.equal(last.value, formatEngineValue(trace.find("mercado.valor")!.value));

  assert.deepEqual(market.captured, [{ label: "Zona, comparable 1", formula: "=1/0.8", value: "1.25" }], "a factor typed as ratings keeps its formula");

  const costInput = toCostEngineInput(cost);
  assert.ok(costInput.ok);
  const costTrace = new Trace();
  computeCostApproach(costInput.input, costEngineConfig(cost), costTrace);
  assert.deepEqual(costs.steps.map((step) => step.label), costTrace.steps.map((step) => step.label));
  const landFactors = costs.steps.find((step) => step.key === "costos.terreno.factorResultante");
  assert.ok(landFactors?.inputs.some((item) => item.name === "Negociación"), "the engine's English keys read in Spanish");
  assert.match(landFactors?.formula ?? "", /^negociación × ubicación/);
});

test("market factors print with the label the appraiser sees, the firm's own factors by their name", () => {
  const settings = {
    ...land.settings,
    factorSlots: [
      { type: "NEGOCIACION" as const, label: "Neg." },
      { type: "SUPERFICIE" as const, label: "Sup." },
      { type: "USO_SUELO" as const, label: "" },
      { type: "OTRO" as const, key: "custom:vista-al-mar", label: "Vista al mar" },
      { type: "OTRO" as const, key: "custom:acceso-vial", label: " " },
    ],
  };
  const market: MarketCalculationDto = { ...land, settings };
  const [approach] = memoryOf([marketSection], { ...NO_CALCULATIONS, markets: [market] }).approaches;
  const resultant = approach.steps.find((step) => step.key.endsWith("1.factorResultante"))!;
  assert.equal(resultant.formula, "Neg. × Sup. × Uso de suelo × Vista al mar × Acceso vial");
  assert.deepEqual(resultant.inputs.map((item) => item.name), ["Neg.", "Sup.", "Uso de suelo", "Vista al mar", "Acceso vial"]);
  const unitValue = approach.steps.find((step) => step.key.endsWith("1.valorUnitario"))!;
  assert.deepEqual(unitValue.inputs.map((item) => item.name), ["Precio", "Superficie"], "the comparable's area is not the surface factor");
});

test("a step that differs from what the server stored is flagged; matching steps are not", () => {
  const trace = marketTrace();
  const results = Object.fromEntries(trace.steps.map((step) => [step.key, step.value]));
  const same = memoryOf([marketSection], { ...NO_CALCULATIONS, markets: [land] }, [{ key: "MOTOR.MERCADO.TERRENO_VENTA", version: ENGINE_VERSION, results }]);
  assert.equal(same.approaches[0].differs, false);
  assert.equal(same.approaches[0].storedVersion, ENGINE_VERSION);
  assert.ok(same.approaches[0].steps.every((step) => step.storedValue === undefined));

  const changed = memoryOf([marketSection], { ...NO_CALCULATIONS, markets: [land] }, [
    { key: "MOTOR.MERCADO.TERRENO_VENTA", version: "motor-2026.09.1", results: { ...results, "mercado.valor": 1 } },
  ]);
  const approach = changed.approaches[0];
  assert.equal(approach.differs, true);
  assert.equal(approach.storedVersion, "motor-2026.09.1");
  assert.equal(approach.steps.find((step) => step.key === "mercado.valor")?.storedValue, "1");
});

test("a calculation that cannot run says why, and a market never captured is left out", () => {
  const incomplete: MarketCalculationDto = { ...land, settings: { ...land.settings, subjectArea: null } };
  const empty: MarketCalculationDto = { settings: defaultMarketSettings("INMUEBLE_RENTA"), comparables: [], locked: false, configured: false };
  const memory = memoryOf([marketSection], { ...NO_CALCULATIONS, markets: [incomplete, empty] });
  assert.equal(memory.approaches.length, 1);
  assert.deepEqual(memory.approaches[0].steps, []);
  assert.equal(memory.approaches[0].pending, "Captura la superficie del sujeto.");
});

test("the conclusion is traced once an approach has a value", () => {
  const memory = memoryOf([section("conclusiones", "X", "CONCLUSIONES", [])], {
    ...NO_CALCULATIONS,
    conclusion: {
      values: { costos: 8_583_412.4, mercado: null, ingresos: null },
      marketSource: null,
      method: { kind: "single", approach: "costos" },
      justification: null,
      configured: true,
      locked: true,
    },
  });
  const [conclusion] = memory.approaches;
  assert.equal(conclusion.key, "MOTOR.CONCLUSION");
  assert.deepEqual(conclusion.location, ["X. CONCLUSIONES", "Conclusión"]);
  assert.equal(conclusion.steps[0].key, "conclusion.costos");
  assert.ok(conclusion.steps.at(-1)!.value.length > 0);
});

test("the cover carries the folio, firm, engine version and when it was generated", () => {
  const memory = memoryOf([]);
  assert.equal(memory.folio, "VDA-0001");
  assert.equal(memory.firmName, "Valuadores de los Altos");
  assert.equal(memory.concluded, true);
  assert.equal(memory.generatedAt, "2026-10-20T18:30:00.000Z");
  assert.deepEqual(memory.document, []);
  assert.deepEqual(memory.approaches, []);
});

/* ------------------------------------------------------------------ */
/*  Order of the dictamen and memoria técnica de comparables           */
/* ------------------------------------------------------------------ */

test("the memory reads by the sections of the dictamen, in their order, each with its formulas and its approaches", () => {
  const sections = [...terrenoSections(), costSection, marketSection];
  const memory = memoryOf(sections, { ...NO_CALCULATIONS, markets: [land], cost });
  assert.deepEqual(memory.sectionHeadings, ["I. CARÁTULA", "III. INFO TERRENO", "VI. ENF. COSTOS", "VII. ENF. MERCADO"]);
  const chapters = memoryChapters(memory);
  assert.deepEqual(chapters.map((chapter) => chapter.heading), ["III. INFO TERRENO", "VI. ENF. COSTOS", "VII. ENF. MERCADO"], "sections without formulas or approaches are left out");
  assert.deepEqual(chapters.map((chapter) => [chapter.document.length > 0, chapter.approaches.map((approach) => approach.key)]), [
    [true, []],
    [false, ["MOTOR.COSTOS"]],
    [false, ["MOTOR.MERCADO.TERRENO_VENTA"]],
  ]);
});

test("an approach whose section is not in the document goes last, as a chapter of its own", () => {
  const memory = memoryOf([marketSection], { ...NO_CALCULATIONS, markets: [land], cost });
  assert.deepEqual(memory.approaches.map((approach) => approach.key), ["MOTOR.MERCADO.TERRENO_VENTA", "MOTOR.COSTOS"]);
  assert.deepEqual(memoryChapters(memory).map((chapter) => chapter.heading), ["VII. ENF. MERCADO", "Enfoque de costos"]);
});

test("the memoria técnica de comparables has the sheet of each comparable used, market by market, without its uses", () => {
  const buildings: MarketCalculationDto = {
    settings: defaultMarketSettings("INMUEBLE_VENTA"),
    comparables: [{ ...comparable(2, 100, 1000000), url: "https://example.com/anuncio", updatedOn: "2026-01-10", validityMonths: 3 }, comparable(1, 90, 900000)],
    locked: false,
    configured: true,
    comparableValidityMonths: 6,
  };
  const cards = memoryComparableCards([buildings, land], { id: "v-1", folio: "VDA-0001", title: null }, "2026-10-20");
  assert.deepEqual(cards.map((card) => [card.type, card.comparable.reference]), [
    ["TERRENO_VENTA", 1], ["TERRENO_VENTA", 2], ["TERRENO_VENTA", 3], ["TERRENO_VENTA", 4],
    ["INMUEBLE_VENTA", 1], ["INMUEBLE_VENTA", 2],
  ], "land before buildings, as the dictamen prints them; each market by reference");
  const withLink = cards.find((card) => card.comparable.url)!;
  assert.equal(withLink.valuation?.folio, "VDA-0001");
  assert.deepEqual(withLink.uses, [], "the sheet of the memory carries no uses in other valuations");
  assert.deepEqual(withLink.warnings, []);
  assert.deepEqual(withLink.validity, { updatedOn: "2026-01-10", validUntil: "2026-04-10", expired: true }, "its own months of validity");
});

test("the statistical methods of a market go right after that market, inside its section", () => {
  const buildings: MarketCalculationDto = { ...land, settings: { ...land.settings, comparableType: "INMUEBLE_VENTA" } };
  const settings = defaultStatisticalSettings("TERRENO_VENTA");
  const statistical: StatisticalCalculationDto = {
    settings: { ...settings, regression: { ...settings.regression, enabled: true } },
    comparables: [], locked: false, configured: true, fromMarket: false, goal: null, market: null,
  };
  const memory = memoryOf([marketSection], { ...NO_CALCULATIONS, markets: [land, buildings], statistical: [statistical] });
  assert.deepEqual(memory.approaches.map((approach) => approach.key), ["MOTOR.MERCADO.TERRENO_VENTA", "MOTOR.ESTADISTICO.TERRENO_VENTA", "MOTOR.MERCADO.INMUEBLE_VENTA"]);
});
