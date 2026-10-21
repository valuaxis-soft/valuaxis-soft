import assert from "node:assert/strict";
import { test } from "node:test";
import { marketDocumentBlocks, withGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import {
  computeMarketRegression,
  defaultMarketRegression,
  distinctValues,
  isNumericVariable,
  regressionFieldOptions,
  type MarketRegressionDto,
} from "../src/features/valuations/calculation/market-regression";
import { comparableInputSchema, marketSettingsSchema } from "../src/features/valuations/calculation/market-schemas";
import {
  defaultCharacteristicFields,
  defaultMarketSettings,
  marketEngineConfig,
  toMarketEngineInput,
  type ComparableDto,
  type MarketCalculationDto,
} from "../src/features/valuations/calculation/market-types";
import { computeMarketApproach } from "../src/features/valuations/engine/market";
import { Trace } from "../src/features/valuations/engine/trace";
import { ensureTableV2, type TableV2 } from "../src/features/valuations/services/table";

const AGE = "custom:edad";

/** The ten comparables of REG.LIN.3: surface, $/m² (the offer is their product) and age. */
const WORKBOOK: Array<[number, number, number]> = [
  [455, 39, 5], [230, 35, 10], [250, 32, 10], [240, 32, 5], [220, 35, 9], [200, 37, 9], [210, 34, 5], [200, 40, 6], [250, 32, 6], [200, 40, 5],
];

function comparable(reference: number, area: number, unitValue: number, age: number, extra: Record<string, string> = {}): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Comparable ${reference}`, area, price: area * unitValue,
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null,
    extra: { [AGE]: String(age), ...extra },
    sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, photos: [], factors: [],
  };
}

const regression = (patch: Partial<MarketRegressionDto> = {}): MarketRegressionDto => ({
  ...defaultMarketRegression(), enabled: true, variables: [{ key: "area" }, { key: AGE }], ...patch,
});

const calculation = (patch: Partial<MarketRegressionDto> = {}): MarketCalculationDto => ({
  settings: {
    ...defaultMarketSettings("INMUEBLE_VENTA"),
    subjectArea: 200,
    adoptedUnitValue: 35,
    characteristicFields: [...defaultCharacteristicFields("INMUEBLE_VENTA"), { key: AGE, label: "EDAD" }],
    subjectCharacteristics: { [AGE]: "12" },
    regression: regression(patch),
  },
  comparables: WORKBOOK.map(([area, unitValue, age], index) => comparable(index + 1, area, unitValue, age)),
  locked: false,
});

function computed(target: MarketCalculationDto, trace?: Trace) {
  const outcome = computeMarketRegression(target, trace);
  assert.ok(outcome?.ok, outcome && !outcome.ok ? outcome.reason : "not enabled");
  return outcome.result;
}

test("the market's own comparables reproduce REG.LIN.3: 33.66 $/m² and 6,732.03", () => {
  const trace = new Trace();
  const result = computed(calculation(), trace);
  assert.equal(result.unitValue, 33.66013722373354);
  assert.equal(result.value, 6732.027444746708);
  assert.equal(result.fit.coefficients[0], 37.242816724519066);
  assert.deepEqual(result.variables, ["SUP. CONST.", "EDAD"]);
  assert.deepEqual(result.subject, [200, 12]);
  assert.equal(trace.find("mercado.regresion.valor")?.value, 6732.027444746708);
  assert.equal(trace.find("mercado.regresion.valor")?.formula, "Y estimado × superficie del sujeto");
});

test("it is a reference: the market's adopted value and value do not change", () => {
  const target = calculation();
  const input = toMarketEngineInput(target);
  const without = toMarketEngineInput({ ...target, settings: { ...target.settings, regression: null } });
  assert.ok(input.ok && without.ok);
  assert.deepEqual(input.input, without.input);
  assert.equal(computeMarketApproach(input.input, marketEngineConfig(target.settings)).adoptedUnitValue, 35);
});

test("off or missing, there is no regression", () => {
  assert.equal(computeMarketRegression({ ...calculation(), settings: { ...calculation().settings, regression: null } }), null);
  assert.equal(computeMarketRegression(calculation({ enabled: false })), null);
});

test("Y as the price: the estimate is the value, and the unit value is over the subject's area", () => {
  const result = computed(calculation({ dependent: "PRICE" }));
  assert.equal(result.value, result.fit.estimate);
  assert.ok(Math.abs((result.unitValue as number) - result.fit.estimate / 200) < 1e-12);
  assert.equal(result.dependentLabel, "Precio");
});

test("an excluded comparable stays out of the regression only", () => {
  const target = calculation();
  const excluded = { ...target, comparables: target.comparables.map((item) => (item.reference === 1 ? { ...item, regressionExcluded: true } : item)) };
  const result = computed(excluded);
  assert.equal(result.fit.n, 9);
  assert.deepEqual(result.excluded, [1]);
  assert.equal(result.rows.some((row) => row.reference === 1), false);
  const input = toMarketEngineInput(excluded);
  assert.ok(input.ok);
  assert.equal(input.input.comparables.length, 10, "the homologation keeps it");
});

test("a qualitative variable takes the numbers of its scale; a value without one is named", () => {
  const qualities = ["Popular", "Medio", "Residencial", "medio", "Popular", "Lujo", "Medio", "Residencial", "Popular", "Lujo"];
  const base = calculation();
  const target: MarketCalculationDto = {
    ...base,
    settings: { ...base.settings, subjectCharacteristics: { [AGE]: "12", quality: "Residencial" } },
    comparables: base.comparables.map((item, index) => ({ ...item, quality: qualities[index] })),
  };
  assert.equal(isNumericVariable(target, "quality"), false);
  assert.equal(isNumericVariable(target, AGE), true);
  assert.deepEqual(distinctValues(target, "quality"), ["Popular", "Medio", "Residencial", "Lujo"], "once each, whatever the case");
  const scale = [{ label: "Popular", value: 1 }, { label: "Medio", value: 2 }, { label: "Residencial", value: 3 }];
  const missing = computeMarketRegression({ ...target, settings: { ...target.settings, regression: regression({ variables: [{ key: "area" }, { key: AGE }, { key: "quality", scale }] }) } });
  assert.ok(missing && !missing.ok);
  assert.match(missing.reason, /la escala de «Lujo» \(CALIDAD, comparable 6\)/);
  const result = computed({
    ...target,
    settings: { ...target.settings, regression: regression({ variables: [{ key: "area" }, { key: AGE }, { key: "quality", scale: [...scale, { label: "Lujo", value: 4 }] }] }) },
  });
  assert.deepEqual(result.rows.map((row) => row.x[2]), [1, 2, 3, 2, 1, 4, 2, 3, 1, 4]);
  assert.equal(result.subject[2], 3);
});

test("what is missing is said, and the engine's reasons come through", () => {
  const base = calculation();
  const reason = (target: MarketCalculationDto) => {
    const outcome = computeMarketRegression(target);
    assert.ok(outcome && !outcome.ok);
    return outcome.reason;
  };
  assert.match(reason({ ...base, settings: { ...base.settings, subjectCharacteristics: {} } }), /«EDAD» del sujeto/);
  assert.match(reason({ ...base, comparables: base.comparables.map((item) => (item.reference === 2 ? { ...item, extra: {} } : item)) }), /«EDAD» del comparable 2/);
  assert.match(reason({ ...base, comparables: base.comparables.slice(0, 3) }), /al menos 4 comparables; hay 3/);
  assert.match(reason(calculation({ variables: [] })), /al menos una variable/);
  assert.match(reason(calculation({ variables: [{ key: "custom:otra" }] })), /ya no está entre las características/);
  assert.match(reason({ ...base, settings: { ...base.settings, subjectArea: null } }), /«SUP\. CONST\.» del sujeto/);
  const byAge = calculation({ variables: [{ key: AGE }] });
  assert.match(reason({ ...byAge, settings: { ...byAge.settings, subjectArea: null } }), /Captura la superficie del sujeto/);
});

test("the variables offered: the market's characteristics but the price and the notes, the area always", () => {
  const keys = regressionFieldOptions({ comparableType: "TERRENO_VENTA", characteristicFields: [{ key: "zone", label: "ZONA" }, { key: "price", label: "OFERTA" }] }).map((field) => field.key);
  assert.deepEqual(keys, ["area", "zone"]);
});

test("the capture is validated with the settings and the comparable", () => {
  const settings = { ...calculation().settings };
  assert.equal(marketSettingsSchema.safeParse(settings).success, true);
  assert.equal(marketSettingsSchema.safeParse({ ...settings, regression: { ...regression(), variables: [{ key: "price" }] } }).success, false);
  assert.equal(marketSettingsSchema.safeParse({ ...settings, regression: { ...regression(), variables: [{ key: "area" }, { key: "area" }] } }).success, false);
  const eightLevels = Array.from({ length: 8 }, (_, index) => ({ label: `N${index}`, value: index }));
  assert.equal(marketSettingsSchema.safeParse({ ...settings, regression: { ...regression(), variables: [{ key: "quality", scale: eightLevels }] } }).success, false);
  const sevenVariables = ["area", "frontage", "depth", "frontCount", "zone", "shape", "quality"].map((key) => ({ key }));
  assert.equal(marketSettingsSchema.safeParse({ ...settings, regression: { ...regression(), variables: sevenVariables } }).success, false);
  const { id: _id, reference: _reference, photos: _photos, ...values } = { ...calculation().comparables[0], location: "x", regressionExcluded: true };
  assert.equal(comparableInputSchema.parse(values).regressionExcluded, true);
});

test("the dictamen prints the apartado of REG.LIN.3 only when the appraiser turns it on", () => {
  const titles = (target: MarketCalculationDto) => marketDocumentBlocks(target, null).flatMap((block) => block.apartados.map((apartado) => apartado.title));
  assert.equal(titles(calculation()).some((title) => title.includes("REGRESIÓN")), false, "off by default");
  assert.equal(marketDocumentBlocks(calculation(), null).length, 1);
  const shown = calculation({ showInDictamen: true });
  const [market, block] = marketDocumentBlocks(shown, null);
  assert.equal(market.apartados.length, 2, "the market's own block is as before");
  assert.equal(block.id, "motor-mercado-inmueble_venta-regresion");
  assert.equal(block.title, "APLICACIÓN ESTADÍSTICA");
  const [apartado] = block.apartados;
  assert.equal(apartado.title, "HOMOLOGACIÓN POR EL MÉTODO DE REGRESIÓN LINEAL (INMUEBLES)");
  const table = ensureTableV2(apartado.tables[0]) as TableV2;
  assert.deepEqual(table.columns.map((column) => column.name), ["N", "X (SUP. CONST.)", "Y ($/M²)", "Z (EDAD)", "X²", "Z²", "XY", "XZ", "YZ"]);
  const cells = (index: number) => table.columns.map((column) => {
    const cell = table.rows[index].cells[column.id];
    return cell?.kind === "value" ? cell.value : "";
  });
  assert.deepEqual(cells(0), ["1", "455", "39", "5", "207,025", "25", "17,745", "2,275", "195"]);
  assert.deepEqual(cells(10), ["N = 10", "2,455", "356", "70", "655,025", "534", "87,715", "16,805", "2,475"]);
  const boxes = table.schema?.summaryBoxes ?? [];
  assert.deepEqual(boxes.find((box) => box.id === "constantes")?.rows.map((row) => [row.label, row.value]), [["A =", "37.242817"], ["B =", "0.0034702172"], ["C =", "-0.35639358"]]);
  assert.deepEqual(boxes.find((box) => box.id === "variables")?.rows.map((row) => [row.label, row.value]), [["SI: X (SUP. CONST.) =", "200"], ["SI: Z (EDAD) =", "12"], ["Y =", "A+BX+CZ"]]);
  assert.deepEqual(boxes.find((box) => box.id === "conclusiones")?.rows.map((row) => [row.label, row.value]), [
    ["PRECIO ESTIMADO/M²:", "$ 33.66"], ["VALOR ESTIMADO DEL INMUEBLE:", "$ 6,732.03"],
  ]);
  // A regression that cannot be computed is not printed.
  assert.equal(titles({ ...shown, comparables: shown.comparables.slice(0, 3) }).some((title) => title.includes("REGRESIÓN")), false);
});

test("the regression block goes after the market's own, and leaves when turned off", () => {
  const section = { id: "mercadoVenta", label: "VII", title: "MERCADO", sourceFile: "", enabled: true, required: false, blocks: [] };
  const shown = withGeneratedBlocks(section, "INMUEBLE_VENTA", marketDocumentBlocks(calculation({ showInDictamen: true }), null));
  assert.deepEqual(shown.blocks.map((block) => block.id), ["motor-mercado-inmueble_venta-enfoque", "motor-mercado-inmueble_venta-regresion"]);
  const hidden = withGeneratedBlocks(shown, "INMUEBLE_VENTA", marketDocumentBlocks(calculation(), null));
  assert.deepEqual(hidden.blocks.map((block) => block.id), ["motor-mercado-inmueble_venta-enfoque"]);
});
