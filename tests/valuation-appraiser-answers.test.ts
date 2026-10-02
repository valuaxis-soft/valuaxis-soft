/**
 * The rules the appraiser gave in his answers (docs/fase0/RESPUESTAS-PERITO.md):
 * surface factor by direct or indirect homologation or typed, the ±30 % guard
 * on the adopted value, indirects on the constructions, and free formulas.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { costInputSchema } from "../src/features/valuations/calculation/cost-schemas";
import { evaluateFormula, parseDecimal } from "../src/features/valuations/calculation/free-formula";
import { marketSettingsSchema } from "../src/features/valuations/calculation/market-schemas";
import { marketEngineConfig, toMarketEngineInput, type ComparableDto, type MarketSettingsDto } from "../src/features/valuations/calculation/market-types";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
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
  assert.equal(result.subjectSurfaceFactor, 1);
});

test("indirect homologation: comparables against the lote tipo, then the lote tipo against the subject", () => {
  const trace = new Trace();
  const config = { ...DEFAULT_ENGINE_CONFIG, rounding: { ...DEFAULT_ENGINE_CONFIG.rounding, market: { comparativeValue: null } } };
  const result = computeMarketApproach({ subjectArea: 160, baseArea: 250, surfacePower: 6, comparables, adoptedUnitValue: 9500 }, config, trace);
  close(result.homologation.comparables[0].surfaceFactor, (250 / 200) ** (1 / 6), "lote tipo / comparable 1");
  close(result.homologation.comparables[2].surfaceFactor, (250 / 400) ** (1 / 6), "lote tipo / comparable 3");
  close(result.subjectSurfaceFactor, (250 / 160) ** (1 / 6), "lote tipo / sujeto");
  close(result.value, 160 * 9500 * (250 / 160) ** (1 / 6), "valor");
  assert.equal(trace.find("mercado.factorSuperficieSujeto")?.formula, "(lote tipo / superficie del sujeto)^(1/n)");
  // A lote tipo equal to the subject is the direct case.
  assert.equal(computeMarketApproach({ subjectArea: 160, baseArea: 160, surfacePower: 6, comparables }, config).subjectSurfaceFactor, 1);
});

test("the cost approach brings the lote tipo to the subject, and takes the adopted value as typed", () => {
  const trace = new Trace();
  computeCostApproach({
    land: { kind: "urban", subjectArea: 160, referenceArea: 250, marketUnitValue: 9533.37, surfacePower: 3, factors: [SURFACE_SLOT] },
  }, DEFAULT_ENGINE_CONFIG, trace);
  close(trace.find("costos.terreno.factorSuperficie")?.value, (250 / 160) ** (1 / 3), "factor");
  assert.equal(trace.find("costos.terreno.valorUnitario")?.value, 9533.37);
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
