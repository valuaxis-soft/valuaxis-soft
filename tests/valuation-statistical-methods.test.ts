import assert from "node:assert/strict";
import { test } from "node:test";
import { marketDocumentBlocks } from "../src/features/valuations/calculation/market-document";
import { defaultMarketRegression } from "../src/features/valuations/calculation/market-regression";
import {
  defaultCharacteristicFields,
  defaultMarketSettings,
  type ComparableDto,
  type MarketCalculationDto,
} from "../src/features/valuations/calculation/market-types";
import {
  MAX_PRINTED_COLUMNS,
  NO_CONTRIBUTION_NOTE,
  STATISTICAL_VALUE_NOTE,
  methodComparison,
  splitColumns,
  statisticalDocumentBlocks,
  withStatisticalBlocks,
} from "../src/features/valuations/calculation/statistical-document";
import { statisticalInputSchema } from "../src/features/valuations/calculation/statistical-schemas";
import {
  codedText,
  codedValue,
  computeStatisticalGoal,
  computeStatisticalRegression,
  defaultStatisticalSettings,
  levelOf,
  renumbered,
  statisticalData,
  statisticalFromMarket,
  statisticalGoalProblem,
  unscaledValues,
  withMarketComparables,
  writtenValues,
  type StatisticalCalculationDto,
  type StatisticalComparableDto,
  type StatisticalVariableDto,
} from "../src/features/valuations/calculation/statistical-types";
import { Trace } from "../src/features/valuations/engine/trace";
import { ensureTableV2, type TableV2 } from "../src/features/valuations/services/table";

const AGE = "custom:edad";

/** The ten comparables of REG.LIN.3: surface, $/m² (the offer is their product) and age. */
const WORKBOOK: Array<[number, number, number]> = [
  [455, 39, 5], [230, 35, 10], [250, 32, 10], [240, 32, 5], [220, 35, 9], [200, 37, 9], [210, 34, 5], [200, 40, 6], [250, 32, 6], [200, 40, 5],
];

function marketComparable(reference: number, area: number, unitValue: number, age: number): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Comparable ${reference}`, area, price: area * unitValue,
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null,
    extra: { [AGE]: String(age) }, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, photos: [], factors: [],
  };
}

/** A market as it was saved before the apartado existed: its regression in its own settings. */
const legacyMarket = (): MarketCalculationDto => ({
  settings: {
    ...defaultMarketSettings("INMUEBLE_VENTA"),
    subjectArea: 200,
    adoptedUnitValue: 35,
    characteristicFields: [...defaultCharacteristicFields("INMUEBLE_VENTA"), { key: AGE, label: "EDAD" }],
    subjectCharacteristics: { [AGE]: "12" },
    regression: { ...defaultMarketRegression(), enabled: true, showInDictamen: true, variables: [{ key: "area" }, { key: AGE }] },
  },
  comparables: WORKBOOK.map(([area, unitValue, age], index) => marketComparable(index + 1, area, unitValue, age)),
  locked: false,
});

const dto = (draft: Pick<StatisticalCalculationDto, "settings" | "comparables">, extra: Partial<StatisticalCalculationDto> = {}): StatisticalCalculationDto => ({
  ...draft, locked: false, configured: true, fromMarket: false, goal: null, market: null, ...extra,
});

test("the market's regression of before reads as the apartado and reproduces REG.LIN.3: 33.66 $/m² and 6,732.03", () => {
  const legacy = statisticalFromMarket(legacyMarket());
  assert.ok(legacy);
  assert.equal(legacy.settings.dependent, "UNIT_VALUE");
  assert.deepEqual(legacy.settings.variables, [{ key: "area", coding: "DIRECT" }, { key: AGE, coding: "DIRECT" }]);
  assert.equal(legacy.settings.regression.showInDictamen, true);
  assert.deepEqual(legacy.settings.subject, { area: "200", [AGE]: "12" });
  assert.equal(legacy.comparables[0].marketComparableId, "c-1");
  const trace = new Trace();
  const outcome = computeStatisticalRegression(legacy, trace);
  assert.ok(outcome?.ok, outcome && !outcome.ok ? outcome.reason : "off");
  assert.equal(outcome.result.unitValue, 33.66013722373354);
  assert.equal(outcome.result.value, 6732.027444746708);
  assert.equal(trace.find("estadistico.regresion.valor")?.value, 6732.027444746708);
  // A market without a regression has nothing to read.
  assert.equal(statisticalFromMarket({ ...legacyMarket(), settings: { ...legacyMarket().settings, regression: null } }), null);
});

test("an excluded comparable of the market stays out, as it did", () => {
  const market = legacyMarket();
  market.comparables[0] = { ...market.comparables[0], regressionExcluded: true };
  const legacy = statisticalFromMarket(market);
  assert.ok(legacy);
  const outcome = computeStatisticalRegression(legacy);
  assert.ok(outcome?.ok);
  assert.equal(outcome.result.fit.n, 9);
});

test("codings: direct, contrary (60 − antigüedad), inverse and the appraiser's scale, ordered or free", () => {
  assert.deepEqual(codedValue({ key: "x", coding: "DIRECT" }, "35"), { ok: true, value: 35 });
  assert.deepEqual(codedValue({ key: "x", coding: "CONTRARY" }, "35"), { ok: true, value: 25 });
  assert.deepEqual(codedValue({ key: "x", coding: "CONTRARY", base: 70 }, "35"), { ok: true, value: 35 });
  assert.deepEqual(codedValue({ key: "x", coding: "INVERSE" }, "4"), { ok: true, value: 0.25 });
  assert.deepEqual(codedValue({ key: "x", coding: "INVERSE" }, "0"), { ok: false, missing: "zero" });
  assert.deepEqual(codedValue({ key: "x", coding: "DIRECT" }, ""), { ok: false, missing: "value" });
  const ordered: StatisticalVariableDto = { key: "x", coding: "SCALE", scaleMode: "ORDERED", scale: [{ label: "Malo", value: 9 }, { label: "Regular", value: 9 }, { label: "Bueno", value: 9 }] };
  assert.deepEqual(codedValue(ordered, "regular"), { ok: true, value: 2 }, "ordered: its place, whatever the number kept");
  const free: StatisticalVariableDto = { key: "x", coding: "SCALE", scaleMode: "FREE", scale: [{ label: "Calle inferior", value: 8 }, { label: "Avenida", value: 4 }] };
  assert.deepEqual(codedValue(free, "  calle   INFERIOR "), { ok: true, value: 8 }, "case and spaces do not make another level");
  assert.deepEqual(codedValue(free, "Calle superior"), { ok: false, missing: "scale" });
  assert.equal(codedText(free, "calle inferior"), "Calle inferior (8)");
  assert.equal(codedText(ordered, "Bueno"), "Bueno (3)");
  assert.equal(levelOf(free, "Avenida")?.value, 4);
});

test("written levels are matched without case or spaces: no duplicates, and the ones without rating are named", () => {
  const draft = {
    settings: { ...defaultStatisticalSettings("TERRENO_VENTA"), fields: [{ key: "area", label: "SUPERFICIE" }, { key: "zone", label: "UBICACIÓN" }], subject: { zone: "Calle inferior" } },
    comparables: ["Calle inferior", "calle inferior", "Calle  Inferior ", "Avenida"].map((zone, index): StatisticalComparableDto => ({
      id: `s${index}`, reference: index + 1, price: 1000, values: { area: "100", zone },
    })),
  };
  assert.deepEqual(writtenValues(draft, "zone"), ["Calle inferior", "Avenida"]);
  const variable: StatisticalVariableDto = { key: "zone", coding: "SCALE", scaleMode: "FREE", scale: [{ label: "Calle inferior", value: 1 }] };
  assert.deepEqual(unscaledValues(draft, variable), ["Avenida"]);
});

/** The client's workbook of the goal programming as the apartado captures it. */
function goalDraft() {
  const rows = [
    [106, 136, 2, 42, 3, 3, 4, 3450000], [204, 229, 2, 30, 5, 2, 1, 3850000], [176, 260, 2, 35, 3, 3, 3, 5150000],
    [77, 114, 2, 55, 3, 4, 1, 2490000], [180, 216, 2, 55, 4, 4, 4, 4850000], [140, 194, 3, 50, 3, 3, 4, 5500000],
  ];
  const keys = ["custom:m2t", "area", "custom:plantas", "custom:edad", "custom:rec", "custom:edocon", "custom:colonia"];
  const labels = ["M2T", "M2C", "NoPlantas", "Antigüedad", "NoRec", "EdoCon", "Colonia"];
  // VUR is captured as the age: 60 − 18 = 42, as the workbook's coded column.
  const ages = (vur: number) => String(60 - vur);
  const states = ["", "Malo", "Regular", "Bueno", "Muy bueno"];
  return {
    settings: {
      ...defaultStatisticalSettings("INMUEBLE_VENTA"),
      fields: labels.map((label, index) => ({ key: keys[index], label })),
      subject: { "custom:m2t": "137.24", area: "146.52", "custom:plantas": "2", "custom:edad": ages(40), "custom:rec": "3", "custom:edocon": "Bueno", "custom:colonia": "1" },
      variables: keys.map((key): StatisticalVariableDto => (key === "custom:edad" ? { key, coding: "CONTRARY" }
        : key === "custom:edocon" ? { key, coding: "SCALE", scaleMode: "ORDERED", scale: states.slice(1).map((label, index) => ({ label, value: index + 1 })) }
          : { key, coding: "DIRECT" })),
      goal: { enabled: true, showInDictamen: true, title: null },
      regression: { enabled: false, showInDictamen: false, title: null, showResidual: false },
    },
    comparables: rows.map((row, index): StatisticalComparableDto => ({
      id: `g${index}`,
      reference: index + 1,
      price: row[7],
      values: Object.fromEntries(keys.map((key, j) => [key, key === "custom:edad" ? ages(row[j]) : key === "custom:edocon" ? states[row[j]] : String(row[j])])),
    })),
  };
}

test("the goal programming takes the same coded criteria: the contrary age and the scale give the workbook's matrix", () => {
  const stated = statisticalGoalProblem(goalDraft());
  assert.ok(stated?.ok, stated && !stated.ok ? stated.reason : "off");
  assert.deepEqual(stated.problem.x[0], [106, 136, 2, 42, 3, 3, 4]);
  assert.deepEqual(stated.problem.y, [3450000, 3850000, 5150000, 2490000, 4850000, 5500000]);
  const data = statisticalData(goalDraft(), "PRICE");
  assert.ok(data.ok);
  assert.deepEqual(data.data.subject, [137.24, 146.52, 2, 40, 3, 3, 1]);
});

/** LINGO's solution of the client's workbook, as the server would send it. */
const LINGO = {
  status: "OPTIMAL" as const,
  objective: 1149695.652173913,
  coefficients: [0, 11826.08695652174, 378623.1884057969, 0, 0, 0, 384579.71014492755],
  positive: [0, 0, 164231.88405797124, 0, 0, 531550.7246376814],
  negative: [453913.04347826086, 0, 0, 0, 0, 0],
};

function solvedGoal(): StatisticalCalculationDto {
  const draft = goalDraft();
  const stated = statisticalGoalProblem(draft);
  assert.ok(stated?.ok);
  return dto(draft, { goal: { problem: stated.problem, solution: LINGO } });
}

test("the browser reads the server's solution only for the same data; another is pending", () => {
  const solved = computeStatisticalGoal(solvedGoal());
  assert.ok(solved?.outcome.ok);
  assert.ok(Math.abs(solved.outcome.fit.estimate - 2874584.35) < 0.05);
  const changed = solvedGoal();
  changed.comparables[0] = { ...changed.comparables[0], price: 3500000 };
  const pending = computeStatisticalGoal(changed);
  assert.equal(pending?.pending, true);
  assert.equal(computeStatisticalGoal({ ...changed, settings: { ...changed.settings, goal: { ...changed.settings.goal, enabled: false } } }), null);
});

const cellsOf = (table: TableV2, row: number) => table.columns.map((column) => {
  const cell = table.rows[row].cells[column.id];
  return cell?.kind === "value" ? cell.value : "";
});

test("the dictamen prints the goal programming: deviations to look at, criteria that do not contribute, the value", () => {
  const [block] = statisticalDocumentBlocks(solvedGoal());
  assert.equal(block.id, "motor-estadistico-inmueble_venta");
  assert.equal(block.title, "APLICACIÓN ESTADÍSTICA");
  assert.deepEqual(block.apartados.map((apartado) => apartado.title), [
    "CRITERIOS, CODIFICACIÓN Y DATOS (INMUEBLES)", "CÁLCULO POR EL MÉTODO DE PROGRAMACIÓN POR METAS (INMUEBLES)",
  ]);
  const [deviations, contributions] = block.apartados[1].tables.map((table) => ensureTableV2(table) as TableV2);
  assert.deepEqual(cellsOf(deviations, 0).slice(-1), ["A observar"]);
  assert.deepEqual(cellsOf(deviations, 1).slice(-1), ["—"]);
  assert.equal(cellsOf(contributions, 0)[4], NO_CONTRIBUTION_NOTE, "M2T has a coefficient of 0");
  assert.equal(cellsOf(contributions, 1)[4], "");
  const conclusions = contributions.schema?.summaryBoxes?.find((box) => box.id === "conclusiones");
  assert.deepEqual(conclusions?.rows.map((row) => row.value), ["$ 1,149,695.65", "$ 2,874,584.35"]);
  // The data: the coded criteria with their numbers, in two tables with REF repeated (seven criteria + REF + price > 8).
  const data = block.apartados[0].tables.map((table) => ensureTableV2(table) as TableV2);
  assert.equal(data.length, 2);
  assert.equal(data[0].columns.length, MAX_PRINTED_COLUMNS);
  assert.equal(data[1].columns[0].name, "REF");
  assert.deepEqual(cellsOf(data[0], 1).slice(0, 2), ["1", "$ 3,450,000.00"]);
  assert.ok(cellsOf(data[0], 1).includes("18 (42)"), "contrary: the age and, in parentheses, 60 − age");
  assert.ok(cellsOf(data[0], 0).includes("Bueno (3)"));
  assert.deepEqual(data[1].columns.map((column) => column.name), ["REF", "X7 (COLONIA)"]);
  assert.ok((data[1].schema?.notes ?? []).some((note) => note.label === "Escala de EdoCon:" && note.text.startsWith("Malo = 1, Regular = 2")));
});

test("the regression prints as Excel: equation, statistics, analysis of variance; residual hidden unless asked", () => {
  const legacy = statisticalFromMarket(legacyMarket());
  assert.ok(legacy);
  const [block] = statisticalDocumentBlocks(dto(legacy));
  const apartado = block.apartados[1];
  assert.equal(apartado.title, "CÁLCULO POR EL MÉTODO DE REGRESIÓN LINEAL MÚLTIPLE (INMUEBLES)");
  const [first, data, statistics, anova] = apartado.tables.map((table) => ensureTableV2(table) as TableV2);
  // Ten columns do not fit: the table goes on under, with N (the comparable's number) again.
  assert.deepEqual(first.columns.map((column) => column.name), ["N", "X (SUP. CONST.)", "Y ($/M²)", "Z (EDAD)", "X²", "Z²", "XY", "XZ"]);
  assert.deepEqual(data.columns.map((column) => column.name), ["N", "YZ", "Y ESTIMADO"]);
  assert.deepEqual(cellsOf(first, 10).slice(0, 4), ["N = 10", "2,455", "356", "70"]);
  assert.deepEqual(cellsOf(data, 10).slice(0, 2), ["N = 10", "2,475"]);
  const notes = data.schema?.notes ?? [];
  assert.ok(notes.some((note) => note.label === "Ecuación de regresión lineal:" && note.text.startsWith("Y = 37.242817 + 0.0034702172·X − 0.35639358·Z")));
  assert.ok(notes.some((note) => note.text === STATISTICAL_VALUE_NOTE));
  assert.deepEqual(data.schema?.summaryBoxes?.find((box) => box.id === "conclusiones")?.rows.map((row) => row.value), ["$ 33.66", "$ 6,732.03"]);
  assert.deepEqual(statistics.rows.map((row, index) => cellsOf(statistics, index)[0]), [
    "Coeficiente de correlación múltiple (R)", "Coeficiente de determinación R²", "R² ajustado", "Error típico", "Observaciones",
  ]);
  assert.deepEqual(anova.columns.map((column) => column.name), ["ANÁLISIS DE VARIANZA", "GRADOS DE LIBERTAD", "SUMA DE CUADRADOS", "PROMEDIO DE LOS CUADRADOS", "F", "VALOR CRÍTICO DE F"]);
  assert.deepEqual(cellsOf(anova, 0).slice(0, 2), ["Regresión", "2"]);
  assert.deepEqual(cellsOf(anova, 1).slice(0, 2), ["Residuos", "7"]);
  const withResidual = statisticalDocumentBlocks(dto({ ...legacy, settings: { ...legacy.settings, regression: { ...legacy.settings.regression, showResidual: true, title: "Mi regresión" } } }));
  const shown = withResidual[0].apartados[1];
  assert.equal(shown.title, "MI REGRESIÓN (INMUEBLES)");
  assert.equal((ensureTableV2(shown.tables[1]) as TableV2).columns.at(-1)?.name, "RESIDUO");
});

test("nothing prints until a method is marked and solved; the market no longer prints the regression", () => {
  const legacy = statisticalFromMarket(legacyMarket());
  assert.ok(legacy);
  const hidden = { ...legacy, settings: { ...legacy.settings, regression: { ...legacy.settings.regression, showInDictamen: false } } };
  assert.deepEqual(statisticalDocumentBlocks(dto(hidden)), []);
  assert.deepEqual(statisticalDocumentBlocks(dto({ ...legacy, comparables: legacy.comparables.slice(0, 3) })), [], "too few comparables: not printed");
  assert.equal(marketDocumentBlocks(legacyMarket(), null).length, 1, "the market's own block only");
});

test("the block goes after the market's pages and leaves when nothing is shown", () => {
  const legacy = statisticalFromMarket(legacyMarket());
  assert.ok(legacy);
  const market = { id: "motor-mercado-inmueble_venta-enfoque", title: "M", sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [] };
  const template = { ...market, id: "plantilla" };
  const section = { id: "mercadoVenta", label: "VII", title: "MERCADO", sourceFile: "", enabled: true, required: false, blocks: [market, template] };
  const shown = withStatisticalBlocks(section, "INMUEBLE_VENTA", statisticalDocumentBlocks(dto(legacy)));
  assert.deepEqual(shown.blocks.map((block) => block.id), ["motor-mercado-inmueble_venta-enfoque", "motor-estadistico-inmueble_venta", "plantilla"]);
  const removed = withStatisticalBlocks(shown, "INMUEBLE_VENTA", []);
  assert.deepEqual(removed.blocks.map((block) => block.id), ["motor-mercado-inmueble_venta-enfoque", "plantilla"]);
});

test("the comparison sets the market's homologation beside RLM and PM, none adopted", () => {
  const calculation = solvedGoal();
  const rows = methodComparison({ ...calculation, market: { mean: 20000, median: 19500, adoptedUnitValue: 19800, value: 2901096, subjectArea: 146.52 } });
  assert.deepEqual(rows.map((row) => row.method), [
    "Tradicional (homologación, valor de mercado)", "Promedio homologado", "Mediana homologada", "Programación por metas (PM)",
  ]);
  assert.equal(rows[1].value, 20000 * 146.52);
  assert.ok(Math.abs((rows[3].unitValue as number) - 2874584.35 / 146.52) < 0.01);
});

test("importing the market brings its comparables once, numbered after the own ones, with its fields and subject", () => {
  const own = { settings: defaultStatisticalSettings("INMUEBLE_VENTA"), comparables: [{ id: "propio", reference: 1, price: 5, values: { area: "1" } }] };
  let next = 0;
  const imported = withMarketComparables(own, legacyMarket(), () => `n${(next += 1)}`);
  assert.equal(imported.imported, 10);
  assert.deepEqual(imported.comparables.map((item) => item.reference).slice(0, 3), [1, 2, 3]);
  assert.equal(imported.comparables[1].values[AGE], "5");
  assert.ok(imported.settings.fields.some((field) => field.key === AGE));
  assert.equal(imported.settings.subject.area, "200");
  assert.equal(withMarketComparables(imported, legacyMarket(), () => "x").imported, 0, "not twice");
  assert.deepEqual(renumbered(imported.comparables.slice(2)).map((item) => item.reference).slice(0, 2), [1, 2]);
});

test("the capture is validated: twelve criteria at most, ten levels, the area stays, no duplicate levels", () => {
  const legacy = statisticalFromMarket(legacyMarket());
  assert.ok(legacy);
  assert.equal(statisticalInputSchema.safeParse(legacy).success, true);
  const settings = legacy.settings;
  const fields = Array.from({ length: 13 }, (_, index) => ({ key: `custom:v${index}`, label: `V${index}` }));
  assert.equal(statisticalInputSchema.safeParse({ ...legacy, settings: { ...settings, fields: [...settings.fields, ...fields], variables: fields.map((field) => ({ key: field.key, coding: "DIRECT" })) } }).success, false);
  assert.equal(statisticalInputSchema.safeParse({ ...legacy, settings: { ...settings, fields: [...settings.fields, ...fields], variables: fields.slice(0, 12).map((field) => ({ key: field.key, coding: "DIRECT" })) } }).success, true);
  const eleven = Array.from({ length: 11 }, (_, index) => ({ label: `N${index}`, value: index }));
  assert.equal(statisticalInputSchema.safeParse({ ...legacy, settings: { ...settings, variables: [{ key: AGE, coding: "SCALE", scale: eleven }] } }).success, false);
  assert.equal(statisticalInputSchema.safeParse({ ...legacy, settings: { ...settings, variables: [{ key: AGE, coding: "SCALE", scale: [{ label: "Bueno", value: 1 }, { label: " bueno", value: 2 }] }] } }).success, false);
  assert.equal(statisticalInputSchema.safeParse({ ...legacy, settings: { ...settings, fields: [{ key: AGE, label: "EDAD" }] } }).success, false, "the area cannot be removed");
});

test("wide tables continue under with REF repeated", () => {
  const columns = Array.from({ length: 20 }, (_, index) => index);
  const parts = splitColumns(columns);
  assert.deepEqual(parts.map((part) => part[0]), [0, 0, 0]);
  assert.deepEqual(parts.map((part) => part.length), [8, 8, 6]);
  assert.deepEqual(parts.flatMap((part, index) => (index ? part.slice(1) : part)), columns);
});
