import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADOPTED_VALUE_OUTSIDE_MESSAGE,
  adoptedValueConcludeError,
  marketsWithAdoptedValueOutside,
} from "../src/features/valuations/calculation/adopted-value-check";
import { marketDocumentBlocks } from "../src/features/valuations/calculation/market-document";
import { defaultMarketSettings, toMarketEngineInput, type ComparableDto, type MarketCalculationDto } from "../src/features/valuations/calculation/market-types";
import { STATISTICAL_BLOCK_TITLE } from "../src/features/valuations/calculation/statistical-document";
import { defaultStatisticalSettings, withFoundComparables } from "../src/features/valuations/calculation/statistical-types";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeMarketApproach } from "../src/features/valuations/engine/market";
import { statisticalRuns } from "../src/features/valuations/memory/statistical-memory";
import { ensureTableV2 } from "../src/features/valuations/services/table";

function comparable(reference: number, area: number, price: number): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Comparable ${reference}`, area, price,
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null,
    sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, photos: [],
    factors: [{ type: "NEGOCIACION", value: 0.95, subjectRating: null, comparableRating: null, justification: null }],
  };
}

const market = (type: MarketCalculationDto["settings"]["comparableType"], adoptedUnitValue: number | null): MarketCalculationDto => ({
  settings: { ...defaultMarketSettings(type), subjectArea: 169.78, surfacePower: 6, adoptedUnitValue },
  comparables: [comparable(1, 140, 1260000), comparable(2, 192.5, 2032590), comparable(3, 196.62, 2261130), comparable(4, 140, 1330000)],
  locked: false,
});

function compute(target: MarketCalculationDto) {
  const input = toMarketEngineInput(target);
  assert.ok(input.ok);
  return computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG);
}

test("a value adopted outside the ±30 % holds back concluding, with the market named", () => {
  const within = market("TERRENO_VENTA", 9000);
  const outside = market("INMUEBLE_VENTA", 90000);
  assert.equal(compute(within).adoptedOutsideLimits, false);
  assert.equal(compute(outside).adoptedOutsideLimits, true, "saved as typed: the engine still computes with it");

  const blocking = marketsWithAdoptedValueOutside([within, outside], new Set());
  assert.deepEqual(blocking, ["INMUEBLE_VENTA"]);
  const error = adoptedValueConcludeError(blocking);
  assert.ok(error?.startsWith(ADOPTED_VALUE_OUTSIDE_MESSAGE));
  assert.match(error ?? "", /inmuebles en venta/);
  assert.equal(ADOPTED_VALUE_OUTSIDE_MESSAGE, "Para concluir el avalúo deberá adoptarse un valor dentro del rango calculado ±30 %.");

  assert.equal(adoptedValueConcludeError(marketsWithAdoptedValueOutside([within], new Set())), null, "within the range, it concludes");
  assert.deepEqual(marketsWithAdoptedValueOutside([market("TERRENO_VENTA", null)], new Set()), [], "not adopted: the mean, always within");
});

test("a market left out of the dictamen does not hold back concluding", () => {
  const outside = market("INMUEBLE_VENTA", 90000);
  assert.deepEqual(marketsWithAdoptedValueOutside([outside], new Set(["mercado-inmuebles"])), []);
  assert.deepEqual(marketsWithAdoptedValueOutside([outside], new Set(["mercado-terrenos"])), ["INMUEBLE_VENTA"], "another market left out");
  const rent = market("INMUEBLE_RENTA", 900);
  assert.deepEqual(marketsWithAdoptedValueOutside([rent], new Set(["mercado-rentas"])), []);
  assert.deepEqual(marketsWithAdoptedValueOutside([{ ...outside, comparables: [] }], new Set()), [], "without a result there is no range");
});

test("the homologation table can be left out of the dictamen; the data, statistics and value still print", () => {
  const shown = market("TERRENO_VENTA", 9000);
  const result = compute(shown);
  const [block] = marketDocumentBlocks(shown, result);
  assert.deepEqual(block.apartados.map((apartado) => apartado.title), ["DATOS DE COMPARABLES (TERRENOS)", "HOMOLOGACIÓN (TERRENOS)"], "on by default");
  assert.equal(ensureTableV2(block.apartados[0].tables[1]).schema?.summaryBoxes, undefined, "the offers carry no boxes while it prints");

  const hidden: MarketCalculationDto = { ...shown, settings: { ...shown.settings, showHomologationTable: false, justification: "Zona similar." } };
  const [without] = marketDocumentBlocks(hidden, result);
  assert.deepEqual(without.apartados.map((apartado) => apartado.title), ["DATOS DE COMPARABLES (TERRENOS)"]);
  const tables = without.apartados.flatMap((apartado) => apartado.tables);
  assert.equal(tables.length, 2, "the characteristics and the offers of the comparables");
  assert.ok(tables.every((table) => !ensureTableV2(table).columns.some((column) => column.name === "FRe")), "no factors printed");

  const offers = ensureTableV2(tables[1]).schema;
  assert.deepEqual(offers?.summaryBoxes?.map((box) => box.id), ["sujeto", "dispersion", "valores", "valor"]);
  const rows = offers?.summaryBoxes?.flatMap((box) => box.rows) ?? [];
  assert.ok(rows.some((row) => row.label.startsWith("Valor homologado a utilizar")), "the adopted value");
  assert.ok(rows.some((row) => row.label.startsWith("VALOR COMPARATIVO DE MERCADO")), "the value of the approach");
  assert.deepEqual(offers?.notes?.map((note) => note.text), ["Zona similar."], "the justification follows its own box");
});

test("comparables of the appraiser's base become rows of the alternative methods only", () => {
  const start = { settings: defaultStatisticalSettings("TERRENO_VENTA"), comparables: [{ id: "a", reference: 1, price: 100000, values: { area: "100" } }] };
  let id = 0;
  const found = [
    { key: "despacho:10", comparable: { price: 1500000, area: 160, zone: "Calle inferior", frontage: 8, extra: {} } },
    { key: "despacho:11", comparable: { price: null, area: 120, zone: null } },
  ];
  const next = withFoundComparables(start, found, () => `n-${++id}`);
  assert.equal(next.added, 2);
  assert.deepEqual(next.comparables.slice(1).map((row) => [row.reference, row.price, row.values, row.sourceKey]), [
    [2, 1500000, { area: "160", zone: "Calle inferior", frontage: "8" }, "despacho:10"],
    [3, null, { area: "120" }, "despacho:11"],
  ]);
  assert.deepEqual(next.settings.fields.map((field) => field.key), ["area", "zone", "frontage"], "only the characteristics they carry are added");
  assert.ok(next.comparables.every((row) => !row.marketComparableId), "they are not the market's");

  const again = withFoundComparables(next, found, () => `n-${++id}`);
  assert.equal(again.added, 0, "one already brought is not brought twice");
});

test("the statistical apartado prints and remembers itself as alternative methods", () => {
  assert.equal(STATISTICAL_BLOCK_TITLE, "MÉTODOS ALTERNATIVOS PARA ESTIMACIÓN DE VALOR");
  const settings = defaultStatisticalSettings("TERRENO_VENTA");
  const [run] = statisticalRuns([{
    settings: { ...settings, regression: { ...settings.regression, enabled: true } },
    comparables: [],
    goal: null,
    market: null,
    locked: false,
    configured: true,
    fromMarket: false,
  }]);
  assert.equal(run.title, "Métodos alternativos para estimación de valor · Terrenos en venta");
});
