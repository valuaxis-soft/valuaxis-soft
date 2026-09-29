/**
 * Income methods B (TU) and C (TR) against the firm's templates, from the
 * inputs in the books (docs/fase0/metodologia/03-rentas-ingresos.md §3, §4).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ENGINE_CONFIG, EXCEL_PROFILES } from "../src/features/valuations/engine/config";
import { SURFACE_SLOT, type CapturedFactor, type FactorSlot } from "../src/features/valuations/engine/factors";
import { computeIncomeApproach } from "../src/features/valuations/engine/income";
import type { ComparableInput } from "../src/features/valuations/engine/market";
import { Trace } from "../src/features/valuations/engine/trace";

function close(actual: number | undefined | null, expected: number, label: string) {
  assert.ok(actual !== undefined && actual !== null, `${label}: sin valor`);
  const tolerance = 1e-9 * Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} ≠ ${expected}`);
}

const fixed = (key: string, value: number): CapturedFactor => ({ key, label: key, value });
const rated = (key: string, subjectRating: number, comparableRating: number): CapturedFactor =>
  ({ key, label: key, subjectRating, comparableRating });
/** L (negotiation), M, surface in N, O, P, Q, as in rows 38..42 of the books. */
const columns = (o: CapturedFactor): FactorSlot[] =>
  [fixed("negociacion", 0.95), fixed("zona", 1), SURFACE_SLOT, o, fixed("calidad", 1), fixed("topografia", 1)];
const plain = fixed("ubicacion", 1);
const better = rated("ubicacion", 1, 0.95);
const comparable = (id: string, price: number, area: number, o: CapturedFactor): ComparableInput => ({ id, price, area, factors: columns(o) });

// TU, VII. ENF. INGRESOS: four rents, subject 160 m², n = 6, T48 = 14.
const tuRents = [
  comparable("1", 3500, 260, plain),
  comparable("2", 3200, 250, plain),
  comparable("3", 3400, 240, better),
  comparable("4", 3100, 230, better),
];
// F66 agua, F67 predial, F68 ISR, N66 mantenimiento, N67 administración, N68 seguros, V66 energía, V67, V68.
const tuDeductions = [0.1, 0.04, 0.04, 0.05, 0.03, 0.03, 0.01, 0, 0].map((rate, index) => ({ concept: `deduccion ${index + 1}`, rate }));
const tuInput = (option: 1 | 2) => ({
  method: "anualidad" as const,
  rentMarket: { subjectArea: 160, surfacePower: 6, comparables: tuRents },
  adoptedUnitRent: 14,
  rentableUnits: [{ description: "Terreno", area: 160 }],
  deductions: tuDeductions,
  capitalization: {},
  annuity: { vacancyDays: 60, contractYears: 2, otherMonthlyIncome: 0, tiie: 0.0792, inflation: 0.045, remainingLifeYears: 12, option },
});

test("TU income: vacancy by days, deductions, option 1 = 230,800.37 and option 2 = 110,689.59", () => {
  const trace = new Trace();
  const result = computeIncomeApproach(tuInput(2), EXCEL_PROFILES.TU, trace);
  [13.866297995343126, 13.098962915393853, 15.157103580726892, 14.318642083977144]
    .forEach((expected, index) => close(result.rentMarket?.comparables[index].homologatedUnitValue, expected, `T${38 + index}`));
  close(result.rentMarket?.stats.mean, 14.110251643860254, "T44");
  assert.equal(result.grossMonthlyRent, 2240, "J56");
  close(result.annuity?.vacancyFactor, 60 / 720, "O60");
  close(result.annuity?.effectiveGrossRent, 2053.3333333333335, "J63");
  close(result.deductionsRate, 0.3, "K70");
  close(result.netMonthlyRent, 1437.3333333333335, "J72");
  close(result.netAnnualRent, 17248, "U72");
  close(result.annuity?.option1.rate, 0.07473125, "I80");
  close(result.annuity?.option1.value, 230800.36798528058, "K82");
  close(result.annuity?.option2.rate, 0.0792 - 0.045 + 1 / 12, "I90");
  assert.equal(result.annuity?.option2.months, 144, "Q89");
  close(result.annuity?.option2.value, 110689.58611683683, "K92");
  close(result.value, 110689.58611683683, "value (option 2, what the books conclude)");
  assert.ok(trace.steps.some((step) => step.key === "ingresos.valorOpcion2"));
});

test("TU with option 1 concludes the printed value", () => {
  const result = computeIncomeApproach(tuInput(1), EXCEL_PROFILES.TU);
  close(result.value, 230800.36798528058, "K82");
  close(result.appliedRate, 0.07473125, "I80");
});

// TR: rural land in m² shown per hectare; four rent comparables that were also sold.
const trRents = [
  comparable("1", 7500, 4780, plain),
  comparable("2", 7500, 4700, plain),
  comparable("3", 6000, 3200, better),
  comparable("4", 5000, 2800, better),
];

test("TR income: market rate from sale and rent pairs, value 5,090,678.68", () => {
  const result = computeIncomeApproach({
    method: "mercado",
    rentMarket: { subjectArea: 7295.15, surfacePower: 6, comparables: trRents, unitScale: 10000 },
    rentableUnits: [],
    deductions: [],
    capitalization: {},
    marketRate: {
      salePrices: [3120000, 2900000, 2500000, 2100000],
      negotiation: 0,
      vacancy: 0.03,
      expenses: [0.05, 0.03, 0.03, 0.01, 0].map((rate, index) => ({ concept: `gasto ${index + 1}`, rate })),
      subjectArea: 7295.15,
    },
  }, EXCEL_PROFILES.TR);
  [13891.716673911447, 14088.48463637377, 16343.832298944819, 15222.96587618236]
    .forEach((expected, index) => close(result.rentMarket?.comparables[index].homologatedUnitValue, expected, `T${38 + index} ($/Ha)`));
  close(result.rentMarket?.stats.mean, 14886.749871353099, "T44");
  close(result.marketRate?.expensesRate, 0.12, "W71");
  close((result.marketRate?.meanUnitIncome ?? 0) * 10000, 12707.329690187004, "K88 ($/Ha)");
  close(result.marketRate?.meanRate, 0.001821012127444323, "O88");
  close(result.value, 5090678.683149081, "R91");
});

test("method A is still the default and unchanged", () => {
  const result = computeIncomeApproach({
    adoptedUnitRent: 30,
    rentableUnits: [{ description: "Casa", area: 250 }],
    deductions: [{ concept: "total", rate: 0.31 }],
    capitalization: { appliedRate: 0.0886 },
  }, DEFAULT_ENGINE_CONFIG);
  assert.equal(result.method, "tabla");
  close(result.value, 700902.934537246, "I65");
});

test("missing data for a method is reported", () => {
  assert.throws(() => computeIncomeApproach({ ...tuInput(2), annuity: undefined }, DEFAULT_ENGINE_CONFIG), /vacíos, TIIE/);
  assert.throws(() => computeIncomeApproach({
    method: "mercado", rentableUnits: [], deductions: [], capitalization: {},
    marketRate: { salePrices: [], negotiation: 0, vacancy: 0, expenses: [], subjectArea: 1 },
  }, DEFAULT_ENGINE_CONFIG), /mercado de rentas/);
});

import { incomeDocumentBlocks } from "../src/features/valuations/calculation/income-document";
import { DEFAULT_INCOME, toIncomeEngineInput, type IncomeCalculationDto } from "../src/features/valuations/calculation/income-types";

const dto = (patch: Partial<IncomeCalculationDto>): IncomeCalculationDto => ({
  ...DEFAULT_INCOME,
  rentMarket: { adoptedUnitRent: 14, subjectArea: 160, comparables: [], homologation: null },
  configured: true,
  locked: false,
  ...patch,
});

test("each method says what is missing before calculating", () => {
  const annuity = toIncomeEngineInput(dto({ method: "anualidad" }));
  assert.equal(annuity.ok, false);
  assert.match(annuity.ok ? "" : annuity.reason, /TIIE/);
  const market = toIncomeEngineInput(dto({ method: "mercado" }));
  assert.match(market.ok ? "" : market.reason, /mercado de rentas/);
  const noPrices = toIncomeEngineInput(dto({
    method: "mercado",
    rentMarket: { adoptedUnitRent: null, subjectArea: 7295.15, comparables: [], homologation: { subjectArea: 7295.15, surfacePower: 6, comparables: trRents } },
  }));
  assert.match(noPrices.ok ? "" : noPrices.reason, /precio de venta/);
});

test("the dictamen shows the annuity and market-rate detail", () => {
  const tu = dto({
    method: "anualidad",
    annuity: { vacancyDays: 60, contractYears: 2, otherMonthlyIncome: 0, tiie: 0.0792, inflation: 0.045, remainingLifeYears: 12, option: 2 },
    rentableUnits: [{ description: "Terreno", area: 160, unitRent: null }],
    deductions: tuDeductions,
  });
  const tuInputOk = toIncomeEngineInput(tu);
  assert.ok(tuInputOk.ok);
  const tuBlocks = incomeDocumentBlocks(tu, computeIncomeApproach(tuInputOk.input, EXCEL_PROFILES.TU));
  const tuRate = tuBlocks.find((block) => block.id === "motor-ingresos-tasa")!;
  assert.ok(tuRate.concepts.some((concept) => concept.label === "Valor que se concluye" && concept.value === "Valor presente (anualidad)"));
  assert.equal(tuBlocks.at(-1)!.concepts[0].value, "$110,689.59");

  const tr = dto({
    method: "mercado",
    deductions: [0.05, 0.03, 0.03, 0.01, 0].map((rate, index) => ({ concept: `gasto ${index + 1}`, rate })),
    marketRate: { negotiation: 0, vacancy: 0.03, salePrices: { 1: 3120000, 2: 2900000, 3: 2500000, 4: 2100000 } },
    rentMarket: {
      adoptedUnitRent: null, subjectArea: 7295.15,
      comparables: trRents.map((row) => ({ reference: Number(row.id), location: `Parcela ${row.id}`, area: row.area, price: row.price })),
      homologation: { subjectArea: 7295.15, surfacePower: 6, comparables: trRents },
    },
  });
  const trInputOk = toIncomeEngineInput(tr);
  assert.ok(trInputOk.ok);
  const trBlocks = incomeDocumentBlocks(tr, computeIncomeApproach(trInputOk.input, EXCEL_PROFILES.TR));
  assert.deepEqual(trBlocks.map((block) => block.id), ["motor-ingresos-tasa-mercado", "motor-ingresos-resultado"]);
  const rows = (trBlocks[0].tables[0] as unknown as { rows: string[][] }).rows;
  assert.equal(rows.length, 4);
  assert.equal(rows[0][0], "1. Parcela 1");
  assert.equal(trBlocks[1].concepts[1].value, "$5,090,678.68");
});

test("sin mercado de rentas, cada tipo con su renta: la adoptada es el promedio ponderado", () => {
  const trace = new Trace();
  const result = computeIncomeApproach({
    rentableUnits: [
      { description: "Local", area: 100, unitRent: 200 },
      { description: "Bodega", area: 300, unitRent: 100 },
    ],
    deductions: [{ concept: "predial", rate: 0.1 }],
    capitalization: { appliedRate: 0.08 },
  }, DEFAULT_ENGINE_CONFIG, trace);
  close(result.unitRent, 125, "renta unitaria ponderada");
  close(result.grossMonthlyRent, 50000, "renta bruta");
  close(result.value, 50000 * 0.9 * 12 / 0.08, "valor");
  assert.equal(trace.find("ingresos.rentaUnitaria")?.formula, "promedio ponderado de las rentas por tipo");
  assert.throws(
    () => computeIncomeApproach({ rentableUnits: [{ description: "Local", area: 100 }], deductions: [], capitalization: { appliedRate: 0.08 } }, DEFAULT_ENGINE_CONFIG),
    /Falta la renta unitaria/,
  );
});
