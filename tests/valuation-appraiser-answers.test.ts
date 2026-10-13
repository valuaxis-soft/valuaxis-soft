/**
 * The rules the appraiser gave in his answers (docs/fase0/RESPUESTAS-PERITO.md):
 * surface factor by direct or indirect homologation or typed (the subject is
 * homologated only in the land of the cost approach, 9 Oct 2026), the ±30 %
 * guard on the adopted value, indirects on the constructions, and free formulas.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { costInputSchema } from "../src/features/valuations/calculation/cost-schemas";
import { DEFAULT_LAND, landReferenceArea, toCostEngineInput } from "../src/features/valuations/calculation/cost-types";
import { evaluateFormula, parseDecimal } from "../src/features/valuations/calculation/free-formula";
import { marketSettingsSchema } from "../src/features/valuations/calculation/market-schemas";
import { marketEngineConfig, toMarketEngineInput, type ComparableDto, type MarketSettingsDto } from "../src/features/valuations/calculation/market-types";
import { DEFAULT_ENGINE_CONFIG, EXCEL_PROFILES } from "../src/features/valuations/engine/config";
import { computeCostApproach } from "../src/features/valuations/engine/costs";
import { SURFACE_SLOT } from "../src/features/valuations/engine/factors";
import { adoptedValueLimits, computeMarketApproach, type ComparableInput } from "../src/features/valuations/engine/market";
import { Trace } from "../src/features/valuations/engine/trace";

function close(actual: number | undefined | null, expected: number, label: string) {
  assert.ok(actual !== undefined && actual !== null, `${label}: sin valor`);
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${label}: ${actual} ≠ ${expected}`);
}

const comparables: ComparableInput[] = [
  { id: "1", price: 2_000_000, area: 200, factors: [SURFACE_SLOT] },
  { id: "2", price: 1_100_000, area: 100, factors: [SURFACE_SLOT] },
  { id: "3", price: 3_300_000, area: 400, factors: [SURFACE_SLOT] },
];

test("direct homologation: each comparable uses (subject / comparable)^(1/n)", () => {
  const result = computeMarketApproach({ subjectArea: 160, surfacePower: 3, comparables }, DEFAULT_ENGINE_CONFIG);
  close(result.homologation.comparables[0].surfaceFactor, (160 / 200) ** (1 / 3), "comparable 1");
  close(result.homologation.comparables[1].surfaceFactor, (160 / 100) ** (1 / 3), "comparable 2");
  close(result.homologation.comparables[0].homologatedUnitValue, 10000 * (160 / 200) ** (1 / 3), "homologado 1");
});

test("indirect homologation: comparables against the lote tipo; the market value is subject area × adopted value, as the books", () => {
  const trace = new Trace();
  const config = { ...DEFAULT_ENGINE_CONFIG, rounding: { ...DEFAULT_ENGINE_CONFIG.rounding, market: { comparativeValue: null } } };
  const result = computeMarketApproach({ subjectArea: 160, baseArea: 250, surfacePower: 6, comparables, adoptedUnitValue: 9500 }, config, trace);
  close(result.homologation.comparables[0].surfaceFactor, (250 / 200) ** (1 / 6), "lote tipo / comparable 1");
  close(result.homologation.comparables[2].surfaceFactor, (250 / 400) ** (1 / 6), "lote tipo / comparable 3");
  // No subject factor in the market approach (9 Oct 2026): T53 = T52 × T50.
  close(result.value, 160 * 9500, "valor");
  assert.equal(trace.find("mercado.subtotal")?.formula, "superficie del sujeto × valor adoptado");
  assert.equal(trace.find("mercado.factorSuperficieSujeto"), undefined);
  assert.equal(computeMarketApproach({ subjectArea: 160, baseArea: 160, surfacePower: 6, comparables, adoptedUnitValue: 9500 }, config).value, 160 * 9500);
});

// TCH, VI. ENF. COSTOS rows 12–20: lote tipo 140, subject 160, 5,000 $/m², n = 3, Neg. 0.95, Ubic. 0.9, Serv. 1.05.
const tchLand = {
  kind: "urban" as const, subjectArea: 160, referenceArea: 140, marketUnitValue: 5000, surfacePower: 3,
  factors: [
    { key: "negotiation", label: "Negociación", value: 0.95 }, { key: "location", label: "Ubicación", value: 0.9 }, SURFACE_SLOT,
    { key: "services", label: "Servicios", value: 1.05 }, { key: "classification", label: "Clasificación", value: 1 }, { key: "topography", label: "Topografía", value: 1 },
  ],
};

test("the cost approach homologates the subject against the lote tipo with the full factor table (TCH: 750,000 as the book; 690,000 with Sup. = lote tipo / sujeto)", () => {
  // The book's Y18 is inverted, (sujeto / lote tipo)^(1/3) = 1.0455; its profile reproduces it.
  const book = new Trace();
  const asExcel = computeCostApproach({ land: tchLand }, EXCEL_PROFILES.TCH, book);
  close(book.find("costos.terreno.factorSuperficie")?.value, 1.0455159171494204, "Y18");
  close(book.find("costos.terreno.factorResultante")?.value, 0.9386119146208922, "P18");
  close(book.find("costos.terreno.valorUnitarioNeto")?.value, 4693.059573104461, "R18");
  close(book.find("costos.terreno.valorParcial")?.value, 750889.5316967138, "U18");
  assert.equal(asExcel.land, 750000, "V20");

  // Ours: Sup. = (lote tipo / sujeto)^(1/n) = (140 / 160)^(1/3), the rest of the table as typed.
  const trace = new Trace();
  const result = computeCostApproach({ land: tchLand }, { ...EXCEL_PROFILES.TCH, surfaceOrientation: DEFAULT_ENGINE_CONFIG.surfaceOrientation }, trace);
  close(trace.find("costos.terreno.factorSuperficie")?.value, (140 / 160) ** (1 / 3), "Sup.");
  close(trace.find("costos.terreno.factorResultante")?.value, 0.95 * 0.9 * (140 / 160) ** (1 / 3) * 1.05, "FRe");
  close(trace.find("costos.terreno.valorUnitarioNeto")?.value, 4293.334923334781, "valor unitario neto");
  close(trace.find("costos.terreno.valorParcial")?.value, 686933.5877335649, "valor parcial");
  assert.equal(result.land, 690000, "ROUND(…, −4) as the TCH book");
  assert.equal(computeCostApproach({ land: tchLand }, DEFAULT_ENGINE_CONFIG).land, 686900, "the default rounds the land to hundreds");
  assert.deepEqual(trace.find("costos.terreno.factorSuperficie")?.inputs, { loteTipo: 140, superficieSujeto: 160, n: 3 });

  // Direct homologation: no lote tipo, Sup. = 1 and the table stays as typed.
  const direct = new Trace();
  computeCostApproach({ land: { ...tchLand, referenceArea: 160 } }, DEFAULT_ENGINE_CONFIG, direct);
  assert.equal(direct.find("costos.terreno.factorSuperficie")?.value, 1);
  close(direct.find("costos.terreno.factorResultante")?.value, 0.95 * 0.9 * 1.05, "FRe directa");
});

test("the land takes its lote tipo from the land market unless the appraiser types one; without either, the subject", () => {
  const market = { adoptedUnitValue: 5000, subjectArea: 160, baseArea: 140 };
  assert.deepEqual(landReferenceArea({ land: { ...DEFAULT_LAND, subjectArea: 160 }, market }), { area: 140, source: "market" });
  assert.deepEqual(landReferenceArea({ land: { ...DEFAULT_LAND, subjectArea: 160, referenceArea: 200 }, market }), { area: 200, source: "captured" });
  assert.deepEqual(landReferenceArea({ land: { ...DEFAULT_LAND, subjectArea: 160 }, market: { ...market, baseArea: null } }), { area: 160, source: "subject" });
  assert.deepEqual(landReferenceArea({ land: DEFAULT_LAND, market: { ...market, baseArea: null } }), { area: 160, source: "subject" });

  const calculation = { land: { ...DEFAULT_LAND, factors: { negotiation: 0.95, location: 0.9, services: 1.05, classification: 1, topography: 1 } }, market, constructions: [], installations: [], indirects: [] };
  const fromMarket = toCostEngineInput(calculation);
  assert.ok(fromMarket.ok && fromMarket.input.land?.kind === "urban");
  assert.equal(fromMarket.input.land.referenceArea, 140);
  assert.equal(computeCostApproach(fromMarket.input, { ...EXCEL_PROFILES.TCH, surfaceOrientation: DEFAULT_ENGINE_CONFIG.surfaceOrientation }).land, 690000);
  const direct = toCostEngineInput({ ...calculation, market: { ...market, baseArea: null } });
  assert.ok(direct.ok && direct.input.land?.kind === "urban");
  assert.equal(direct.input.land.referenceArea, 160);
  const trace = new Trace();
  computeCostApproach(direct.input, DEFAULT_ENGINE_CONFIG, trace);
  assert.equal(trace.find("costos.terreno.factorSuperficie")?.value, 1);
});

test("a surface factor typed for a comparable replaces the formula", () => {
  const trace = new Trace();
  const typed = [{ ...comparables[0], surfaceFactor: 0.9 }, ...comparables.slice(1)];
  const result = computeMarketApproach({ subjectArea: 160, surfacePower: 3, comparables: typed }, DEFAULT_ENGINE_CONFIG, trace);
  assert.equal(result.homologation.comparables[0].surfaceFactor, 0.9);
  close(result.homologation.comparables[0].homologatedUnitValue, 9000, "homologado");
  assert.equal(trace.find("mercado.comparables.1.factorSuperficie")?.formula, "captura del perito");
  close(result.homologation.comparables[1].surfaceFactor, (160 / 100) ** (1 / 3), "los demás siguen la fórmula");
});

const settings: MarketSettingsDto = {
  comparableType: "TERRENO_VENTA", subjectArea: 160, baseArea: null, surfacePower: 3, adoptedUnitValue: null,
  justification: null, additionalAmount: 0, factorSlots: [{ type: "SUPERFICIE", label: "Superficie" }, { type: "ZONA", label: "Zona" }],
};
const dto = (reference: number, factors: ComparableDto["factors"]): ComparableDto => ({
  id: String(reference), reference, location: "x", area: 200, price: 2_000_000, landUse: null, shape: null, zone: null, frontage: null,
  depth: null, topography: null, services: null, notes: null, sourceName: null, contactName: null, contactPhone: null, url: null,
  offerDate: null, photos: [], factors,
});

test("the editor passes a typed surface factor to the engine, and only a positive one", () => {
  const factor = (value: number | null) => ({ type: "SUPERFICIE" as const, value, subjectRating: null, comparableRating: null, justification: null });
  const input = toMarketEngineInput({ settings, comparables: [dto(1, [factor(0.85)]), dto(2, [factor(null)]), dto(3, [factor(0)]), dto(4, [])] });
  assert.ok(input.ok);
  assert.deepEqual(input.input.comparables.map((comparable) => comparable.surfaceFactor), [0.85, undefined, undefined, undefined]);
});

test("the adopted value stays within 30 % of the homologated mean and median", () => {
  assert.deepEqual(adoptedValueLimits({ mean: 10000, median: 10000 }), { min: 7000, max: 13000 });
  // Mean and median apart: from 30 % below the lower to 30 % above the higher.
  const limits = adoptedValueLimits({ mean: 10000, median: 9000 });
  close(limits.min, 6300, "mínimo");
  close(limits.max, 13000, "máximo");

  const run = (adoptedUnitValue?: number) => computeMarketApproach({ subjectArea: 160, surfacePower: 3, comparables, adoptedUnitValue }, DEFAULT_ENGINE_CONFIG);
  const reference = run();
  assert.equal(reference.adoptedOutsideLimits, false, "sin captura se toma el promedio");
  assert.equal(reference.adoptedUnitValue, reference.homologation.stats.mean);
  assert.equal(run(reference.adoptedLimits.max).adoptedOutsideLimits, false, "el límite entra");
  assert.equal(run(reference.adoptedLimits.min).adoptedOutsideLimits, false);
  assert.equal(run(reference.adoptedLimits.max + 1).adoptedOutsideLimits, true);
  assert.equal(run(reference.adoptedLimits.min - 1).adoptedOutsideLimits, true);
  assert.equal(run(reference.homologation.stats.mean * 10).adoptedOutsideLimits, true, "130,000 por 13,000");
});

test("the power n is 3, 6, 9 or 12, in the market and in the land", () => {
  const market = { ...settings, rounding: -2 };
  for (const surfacePower of [3, 6, 9, 12]) assert.equal(marketSettingsSchema.safeParse({ ...market, surfacePower }).success, true, String(surfacePower));
  for (const surfacePower of [1, 2, 4, 3.5, 15, 0]) {
    const parsed = marketSettingsSchema.safeParse({ ...market, surfacePower });
    assert.equal(parsed.success, false, String(surfacePower));
    assert.equal(parsed.error?.issues[0].message, "La potencia n debe ser 3, 6, 9 o 12.");
  }
  const land = { subjectArea: 160, referenceArea: null, unitValue: null, factors: { negotiation: 1, location: 1, services: 1, classification: 1, topography: 1 } };
  const cost = (surfacePower: number) => costInputSchema.safeParse({ land: { ...land, surfacePower }, constructions: [], installations: [], indirects: [] });
  assert.equal(cost(9).success, true);
  assert.equal(cost(2).success, false);
});

test("the rounding of the market value is the appraiser's choice", () => {
  const input = { subjectArea: 100, surfacePower: 3, comparables: [{ id: "1", price: 604_567, area: 100, factors: [SURFACE_SLOT] }] };
  const value = (rounding?: number | null) => computeMarketApproach(input, marketEngineConfig({ rounding })).value;
  assert.equal(value(), 604_600, "sin elegir: a centenas, como hasta ahora");
  assert.equal(value(null), 604_567);
  assert.equal(value(-3), 605_000);
  assert.equal(value(-4), 600_000);
  assert.equal(marketSettingsSchema.safeParse({ ...settings, rounding: null }).success, true);
  assert.equal(marketSettingsSchema.safeParse({ ...settings, rounding: 3 }).success, false);
  assert.equal(marketSettingsSchema.safeParse({ ...settings, rounding: -1.5 }).success, false);
});

test("indirects apply on constructions and installations unless a base is typed", () => {
  const trace = new Trace();
  const config = { ...DEFAULT_ENGINE_CONFIG, rounding: { ...DEFAULT_ENGINE_CONFIG.rounding, costs: { ...DEFAULT_ENGINE_CONFIG.rounding.costs, constructions: null, installations: null, physicalValue: null } } };
  const result = computeCostApproach({
    constructions: [{ ref: "T-1", area: 100, age: 0, usefulLife: 70, conservation: 1, unitReplacementCost: 10000 }],
    specialInstallations: [{ ref: "1", share: "P", quantity: 1, age: 0, usefulLife: 20, conservation: 1, unitReplacementCost: 50000 }],
    indirects: [{ concept: "Licencias", percentage: 0.05 }, { concept: "Proyecto", percentage: 0.1, base: 200000 }],
  }, config, trace);
  assert.equal(trace.find("costos.indirectos.1")?.value, 0.05 * 1_050_000);
  assert.equal(trace.find("costos.indirectos.2")?.value, 20000);
  assert.equal(result.indirects, 72500);
  assert.equal(result.physicalValue, 1_122_500);
});

test("free formulas compute like a spreadsheet", () => {
  assert.equal(parseDecimal("=5*10000"), 50000);
  assert.equal(parseDecimal(" = 5 x 10,000 "), 50000);
  assert.equal(parseDecimal("=1/1.15"), 1 / 1.15);
  assert.equal(parseDecimal("=2+3*4"), 14);
  assert.equal(parseDecimal("=(2+3)*4"), 20);
  assert.equal(parseDecimal("=10-4-3"), 3);
  assert.equal(parseDecimal("=2^3^2"), 64, "potencias de izquierda a derecha, como Excel");
  assert.equal(parseDecimal("=-2^2"), 4, "el signo va primero, como Excel");
  assert.equal(parseDecimal("=10%*200"), 20);
  assert.equal(parseDecimal("=RAIZ(81)"), 9);
  close(parseDecimal("=raíz(27; 3)"), 3, "raíz cúbica");
  assert.equal(parseDecimal("=POTENCIA(2; 10)"), 1024);
  assert.equal(parseDecimal("=REDONDEAR(6045.678; 1)"), 6045.7);
  assert.equal(parseDecimal("=$1,345.50*2"), 2691);
  // The appraiser's example: as in Excel, ^1 then /6. The sixth root needs parentheses or RAIZ.
  assert.equal(parseDecimal("=(1345*235)^1/6"), (1345 * 235) / 6);
  close(parseDecimal("=(1345*235)^(1/6)"), (1345 * 235) ** (1 / 6), "raíz sexta");
  close(parseDecimal("=RAIZ(1345*235; 6)"), (1345 * 235) ** (1 / 6), "raíz sexta con RAIZ");
});

test("plain numbers still parse, and anything invalid is no value", () => {
  assert.equal(parseDecimal("1,260,000.50"), 1260000.5);
  assert.equal(parseDecimal("$ 9000"), 9000);
  assert.equal(parseDecimal(""), null);
  assert.equal(parseDecimal("abc"), null);
  for (const bad of ["=", "=5*", "=(2+3", "=2+3)", "=1/0", "=RAIZ(-4)", "=DESCONOCIDA(2)", "=RAIZ(1;2;3)", "=2 3", "=alert(1)", "=A1+2", "=5**2"]) {
    assert.equal(parseDecimal(bad), null, bad);
  }
  assert.equal(evaluateFormula("(".repeat(200) + "1" + ")".repeat(200)), null, "anidación sin límite");
});
