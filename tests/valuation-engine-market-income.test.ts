/**
 * Market and income approaches against the Excel books (Arandas, TU,
 * TU_OFICIAL and TCH), from the inputs the appraiser captured.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { EXCEL_PROFILES } from "../src/features/valuations/engine/config";
import { SURFACE_SLOT, type CapturedFactor, type FactorSlot } from "../src/features/valuations/engine/factors";
import { computeIncomeApproach } from "../src/features/valuations/engine/income";
import { computeMarketApproach, type ComparableInput } from "../src/features/valuations/engine/market";
import { Trace } from "../src/features/valuations/engine/trace";

function close(actual: number | undefined, expected: number, label: string) {
  assert.ok(actual !== undefined, `${label}: sin valor`);
  const tolerance = 1e-12 * Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} ≠ ${expected}`);
}

/** A factor as the books write it: "=0.9/1.05" is subject rating over comparable rating. */
const rated = (key: string, subjectRating: number, comparableRating: number): CapturedFactor =>
  ({ key, label: key, subjectRating, comparableRating });
const fixed = (key: string, value: number): CapturedFactor => ({ key, label: key, value });

/** Six factor columns L..Q with the computed surface factor in N, as in every book. */
function columns(l: CapturedFactor, m: CapturedFactor, o: CapturedFactor, p: CapturedFactor, q: CapturedFactor): FactorSlot[] {
  return [l, m, SURFACE_SLOT, o, p, q];
}

test("Arandas land comparables: homologated values, mean, dispersion and value 1,528,000", () => {
  const comparable = (id: string, price: number, area: number, factors: FactorSlot[]): ComparableInput => ({ id, price, area, factors });
  const neg = fixed("negociacion", 0.95);
  const comparables = [
    comparable("1", 1260000, 140, columns(neg, rated("ubicacion", 1, 1), rated("zona", 0.9, 1), rated("frente", 1, 1), rated("uso", 1.1, 1.05))),
    comparable("2", 1220000, 140, columns(neg, rated("ubicacion", 1, 1), rated("zona", 0.9, 1.05), rated("frente", 1, 1), rated("uso", 1.1, 1.05))),
    comparable("3", 2032590, 192.5, columns(neg, rated("ubicacion", 1, 1), rated("zona", 0.9, 1), rated("frente", 1, 1), rated("uso", 1.1, 1))),
    comparable("4", 2261130, 196.62, columns(neg, rated("ubicacion", 1, 1.15), rated("zona", 0.9, 1), rated("frente", 1, 1.15), rated("uso", 1.1, 1))),
    comparable("5", 1330000, 140, columns(neg, fixed("ubicacion", 1), rated("zona", 0.9, 1), rated("frente", 1, 1), rated("uso", 1.1, 1.05))),
  ];
  const trace = new Trace();
  const result = computeMarketApproach(
    { subjectArea: 169.78, surfacePower: 6, comparables, adoptedUnitValue: 9000 },
    EXCEL_PROFILES.ARANDAS,
    trace,
  );

  const expected = [7806.426253458214, 7198.669712183688, 10140.714396501335, 8380.78089306668, 8240.11660087256];
  result.homologation.comparables.forEach((row, index) => close(row.homologatedUnitValue, expected[index], `T${42 + index}`));
  close(result.homologation.stats.mean, 8353.341571216495, "T48");
  close(result.homologation.stats.dispersion, 1.4086928282510671, "AC41");
  close(trace.find("mercado.subtotal")?.value, 1528020, "T53");
  assert.equal(result.value, 1528000, "T55");
  assert.equal(result.homologation.suggestedPower, 2, "moda de n por pares");
  assert.equal(result.adoptedOutsideRange, false);
});

// TU and TU_OFICIAL share the comparables and differ only in the surface factor.
const tuComparables: ComparableInput[] = [
  { id: "1", price: 1700000, area: 260, factors: columns(fixed("neg", 0.95), rated("ubic", 1, 1.1), rated("serv", 1, 1), rated("clas", 1, 1), rated("top", 1, 1)) },
  { id: "2", price: 1600000, area: 250, factors: columns(fixed("neg", 0.95), rated("ubic", 1, 1), rated("serv", 1, 1), rated("clas", 1, 1), rated("top", 1, 1)) },
  { id: "3", price: 1500000, area: 240, factors: columns(fixed("neg", 0.95), rated("ubic", 1, 1), rated("serv", 1, 1), rated("clas", 1, 1), rated("top", 1, 1)) },
  { id: "4", price: 1400000, area: 230, factors: columns(fixed("neg", 0.95), rated("ubic", 1, 1), rated("serv", 1, 1), rated("clas", 1, 1), rated("top", 1, 0.95)) },
];

test("TU and TU_OFICIAL: the inverted surface factor changes every homologated value", () => {
  const input = { subjectArea: 160, surfacePower: 3, comparables: tuComparables, adoptedUnitValue: 7000 };
  const tu = computeMarketApproach(input, EXCEL_PROFILES.TU);
  const official = computeMarketApproach(input, EXCEL_PROFILES.TU_OFICIAL);

  [6638.82084033046, 7055.215027091424, 6796.740815160409, 6869.674358330001]
    .forEach((expected, index) => close(tu.homologation.comparables[index].homologatedUnitValue, expected, `TU T${42 + index}`));
  [4803.104531517685, 5239.585166157542, 5186.8840093717745, 5393.420090228196]
    .forEach((expected, index) => close(official.homologation.comparables[index].homologatedUnitValue, expected, `TU_OFICIAL T${42 + index}`));
  close(tu.homologation.stats.mean, 6840.112760228073, "TU T48");
  close(official.homologation.stats.mean, 5155.748449318799, "TU_OFICIAL T48");
  assert.equal(tu.value, 1120000);
  // The book adopts 7,000 by hand: outside the range TU_OFICIAL homologates.
  assert.equal(tu.adoptedOutsideRange, false);
  assert.equal(official.adoptedOutsideRange, true);
});

test("without a captured value the market approach adopts the homologated mean", () => {
  const result = computeMarketApproach({ subjectArea: 160, surfacePower: 3, comparables: tuComparables }, EXCEL_PROFILES.TU);
  assert.equal(result.adoptedUnitValue, result.homologation.stats.mean);
  close(result.value, 160 * 6840.112760228073, "valor con el promedio");
});

const rentComparables: ComparableInput[] = [
  { id: "1", price: 9500, area: 410, factors: columns(fixed("neg", 0.95), fixed("zona", 1), fixed("ubic", 1), rated("cal", 1, 1), rated("top", 1, 1)) },
  { id: "2", price: 9000, area: 400, factors: columns(fixed("neg", 0.95), rated("zona", 1, 1), rated("ubic", 1, 1), rated("cal", 1, 1), rated("top", 1, 1)) },
  { id: "3", price: 8300, area: 380, factors: columns(fixed("neg", 0.95), rated("zona", 1, 1), rated("ubic", 1, 0.95), rated("cal", 1, 1), rated("top", 1, 1)) },
  { id: "4", price: 8000, area: 350, factors: columns(fixed("neg", 0.95), rated("zona", 1, 1), rated("ubic", 1, 0.95), rated("cal", 1, 1), rated("top", 1, 0.85)) },
];

// TCH rate table: one column per criterion (edad, vida remanente, conservación,
// proyecto, relación terreno/construcción, uso, zona).
const tchCapitalization = { ratingColumns: [1, 3, 1, 2, 2, 0, 4], appliedRate: 0.0886 };
const tchDeductions = [0.1, 0.04, 0.04, 0.06, 0.03, 0.03, 0.01, 0, 0].map((rate, index) => ({ concept: `deduccion ${index + 1}`, rate }));

test("TCH income approach: rents, deductions, rate table and value 700,902.93", () => {
  const trace = new Trace();
  const result = computeIncomeApproach({
    rentMarket: { subjectArea: 250, surfacePower: 3, comparables: rentComparables },
    adoptedUnitRent: 30,
    rentableUnits: [{ description: "Casa habitación", area: 250 }],
    deductions: tchDeductions,
    capitalization: tchCapitalization,
  }, EXCEL_PROFILES.TCH, trace);

  [25.95840296255247, 25.000351661720003, 25.113603029074785, 30.082391719835876]
    .forEach((expected, index) => close(result.rentMarket?.comparables[index].homologatedUnitValue, expected, `T${38 + index}`));
  close(result.rentMarket?.stats.mean, 26.538687343295784, "T44");
  close(result.rentMarket?.stats.dispersion, 1.20327874291054, "AC37");
  assert.equal(result.grossMonthlyRent, 7500, "T17");
  assert.equal(result.deductionsRate, 0.31000000000000005, "K24");
  close(result.tableRate ?? undefined, 0.08857142857142858, "U50");
  assert.equal(result.netMonthlyRent, 5175, "I62");
  assert.equal(result.netAnnualRent, 62100, "I63");
  close(result.value, 700902.934537246, "I65");
});

test("Arandas rent market uses the building area, 467.27 m², as the subject", () => {
  const result = computeIncomeApproach({
    rentMarket: { subjectArea: 467.27, surfacePower: 3, comparables: rentComparables },
    adoptedUnitRent: 30,
    rentableUnits: [{ description: "Edificio", area: 250 }],
    deductions: tchDeductions,
    capitalization: tchCapitalization,
  }, EXCEL_PROFILES.ARANDAS);
  [21.07343537621336, 20.295674425190473, 20.387613647131886, 24.42135360886479]
    .forEach((expected, index) => close(result.rentMarket?.comparables[index].homologatedUnitValue, expected, `T${38 + index}`));
  close(result.rentMarket?.stats.mean, 21.54451926435013, "T44");
});

test("without a captured rate the income approach applies the rate from the table", () => {
  const result = computeIncomeApproach({
    adoptedUnitRent: 30,
    rentableUnits: [{ description: "Casa habitación", area: 250 }],
    deductions: tchDeductions,
    capitalization: { ratingColumns: tchCapitalization.ratingColumns },
  }, EXCEL_PROFILES.TCH);
  assert.equal(result.appliedRate, result.tableRate);
  close(result.value, 62100 / 0.08857142857142858, "valor con la tasa de la tabla");
});
