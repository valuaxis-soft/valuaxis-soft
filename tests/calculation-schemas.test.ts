import assert from "node:assert/strict";
import { test } from "node:test";
import type { z } from "zod";
import { conclusionSettingsSchema } from "../src/features/valuations/calculation/conclusion-schemas";
import { costInputSchema } from "../src/features/valuations/calculation/cost-schemas";
import { DEFAULT_LAND, emptyConstruction, emptyInstallation } from "../src/features/valuations/calculation/cost-types";
import { incomeInputSchema } from "../src/features/valuations/calculation/income-schemas";
import { DEFAULT_ANNUITY, DEFAULT_DEDUCTIONS, DEFAULT_MARKET_RATE } from "../src/features/valuations/calculation/income-types";
import { RATE_TABLE_CRITERIA, RATE_TABLE_RATES } from "../src/features/valuations/engine/income";
import { comparableInputSchema, marketSettingsSchema } from "../src/features/valuations/calculation/market-schemas";
import { defaultMarketSettings, OFFER_LEVELS } from "../src/features/valuations/calculation/market-types";

/** The issues of a rejected payload as "path: message". */
function issues(schema: z.ZodType, payload: unknown) {
  const result = schema.safeParse(payload);
  assert.equal(result.success, false, "the payload is rejected");
  return result.error!.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

function accepts(schema: z.ZodType, payload: unknown) {
  const result = schema.safeParse(payload);
  assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
  return result.data;
}

/* ------------------------------------------------------------------ */
/*  Cost approach                                                      */
/* ------------------------------------------------------------------ */

const construction = { ...emptyConstruction(0), description: "Casa", area: 120, age: 10, usefulLife: 60, conservation: 0.9, unitReplacementCost: 12000 };
const installation = { ...emptyInstallation(0), description: "Cisterna", quantity: 1, age: 5, usefulLife: 30, conservation: 1, unitReplacementCost: 35000 };
const cost = {
  land: { ...DEFAULT_LAND, subjectArea: 169.78, unitValue: 9000 },
  constructions: [construction],
  installations: [installation],
  indirects: [{ concept: "Honorarios", percentage: 0.08, base: 100000 }],
};

test("a complete cost payload passes and text is trimmed", () => {
  const parsed = accepts(costInputSchema, {
    ...cost,
    constructions: [{ ...construction, ref: "  T-1  ", description: "  Casa  " }],
  }) as typeof cost;
  assert.equal(parsed.constructions[0].ref, "T-1");
  assert.equal(parsed.constructions[0].description, "Casa");
});

test("an empty cost capture (nulls and empty lists) passes", () => {
  accepts(costInputSchema, { land: DEFAULT_LAND, constructions: [], installations: [], indirects: [] });
});

test("cost boundaries: zero, 1e12 amounts and factor 10 pass; above them fail", () => {
  accepts(costInputSchema, {
    ...cost,
    land: { ...cost.land, unitValue: 1e12, subjectArea: 0, surfacePower: 12, factors: { ...cost.land.factors, negotiation: 10, location: 0 } },
    constructions: [{ ...construction, completion: 0, undivided: 1, otherFactor: 10 }],
  });
  assert.ok(issues(costInputSchema, { ...cost, land: { ...cost.land, unitValue: 1e12 + 1 } }).some((issue) => issue.startsWith("land.unitValue")));
  assert.ok(issues(costInputSchema, { ...cost, land: { ...cost.land, unitValue: -1 } }).some((issue) => issue.startsWith("land.unitValue")));
  assert.ok(issues(costInputSchema, { ...cost, land: { ...cost.land, factors: { ...cost.land.factors, topography: 10.01 } } })
    .some((issue) => issue.startsWith("land.factors.topography")));
  assert.ok(issues(costInputSchema, { ...cost, constructions: [{ ...construction, completion: 1.01 }] })
    .some((issue) => issue.startsWith("constructions.0.completion")));
  assert.ok(issues(costInputSchema, { ...cost, installations: [{ ...installation, undivided: -0.01 }] })
    .some((issue) => issue.startsWith("installations.0.undivided")));
});

test("the surface power must be positive and at most 20", () => {
  for (const surfacePower of [0, -3, 2, 4, 20.5]) {
    assert.ok(issues(costInputSchema, { ...cost, land: { ...cost.land, surfacePower } }).some((issue) => issue.startsWith("land.surfacePower")));
  }
});

test("non-finite numbers and strings are rejected in cost amounts", () => {
  for (const area of [Number.POSITIVE_INFINITY, Number.NaN, "120"]) {
    assert.ok(issues(costInputSchema, { ...cost, constructions: [{ ...construction, area }] }).some((issue) => issue.startsWith("constructions.0.area")));
  }
});

test("constructions and installations need a reference, installations a description, in Spanish", () => {
  assert.deepEqual(
    issues(costInputSchema, { ...cost, constructions: [{ ...construction, ref: "   " }] }),
    ["constructions.0.ref: Cada construcción necesita su referencia."],
  );
  assert.deepEqual(
    issues(costInputSchema, { ...cost, installations: [{ ...installation, ref: "" }] }),
    ["installations.0.ref: Cada instalación necesita su referencia."],
  );
  assert.deepEqual(
    issues(costInputSchema, { ...cost, installations: [{ ...installation, description: " " }] }),
    ["installations.0.description: Describe cada instalación especial."],
  );
});

test("references cannot repeat, ignoring case", () => {
  assert.deepEqual(
    issues(costInputSchema, { ...cost, constructions: [construction, { ...construction, ref: construction.ref.toLowerCase() }] }),
    ["constructions: Las referencias de las construcciones no se pueden repetir."],
  );
  assert.deepEqual(
    issues(costInputSchema, { ...cost, installations: [installation, { ...installation }] }),
    ["installations: Las referencias de las instalaciones no se pueden repetir."],
  );
  // The same reference in a construction and an installation is fine.
  accepts(costInputSchema, { ...cost, installations: [{ ...installation, ref: construction.ref }] });
});

test("cost list sizes and text lengths are bounded", () => {
  const constructions = (count: number) => Array.from({ length: count }, (_, index) => ({ ...construction, ref: `T-${index + 1}` }));
  accepts(costInputSchema, { ...cost, constructions: constructions(30) });
  assert.ok(issues(costInputSchema, { ...cost, constructions: constructions(31) }).some((issue) => issue.startsWith("constructions")));
  const installations = (count: number) => Array.from({ length: count }, (_, index) => ({ ...installation, ref: String(index + 1) }));
  accepts(costInputSchema, { ...cost, installations: installations(60) });
  assert.ok(issues(costInputSchema, { ...cost, installations: installations(61) }).some((issue) => issue.startsWith("installations")));
  assert.ok(issues(costInputSchema, { ...cost, indirects: Array.from({ length: 21 }, () => cost.indirects[0]) }).some((issue) => issue.startsWith("indirects")));
  assert.ok(issues(costInputSchema, { ...cost, constructions: [{ ...construction, ref: "X".repeat(21) }] }).some((issue) => issue.startsWith("constructions.0.ref")));
  assert.ok(issues(costInputSchema, { ...cost, constructions: [{ ...construction, description: "x".repeat(501) }] })
    .some((issue) => issue.startsWith("constructions.0.description")));
});

test("installation share is P or C and indirect percentages are fractions", () => {
  accepts(costInputSchema, { ...cost, installations: [{ ...installation, share: "C" }] });
  assert.ok(issues(costInputSchema, { ...cost, installations: [{ ...installation, share: "X" }] }).some((issue) => issue.startsWith("installations.0.share")));
  accepts(costInputSchema, { ...cost, indirects: [{ concept: "Sin porcentaje", percentage: null, base: null }] });
  assert.ok(issues(costInputSchema, { ...cost, indirects: [{ concept: "Honorarios", percentage: 8, base: 1 }] })
    .some((issue) => issue.startsWith("indirects.0.percentage")));
});

/* ------------------------------------------------------------------ */
/*  Income approach                                                    */
/* ------------------------------------------------------------------ */

const income = {
  method: "tabla",
  annuity: DEFAULT_ANNUITY,
  marketRate: DEFAULT_MARKET_RATE,
  rentableUnits: [{ description: "Casa habitación", area: 250, unitRent: 30 }],
  deductions: DEFAULT_DEDUCTIONS,
  ratingColumns: [1, 3, 1, 2, 2, 0, 4],
  appliedRate: 0.0886,
};

test("the TCH income payload passes for each method", () => {
  assert.equal(RATE_TABLE_CRITERIA.length, income.ratingColumns.length);
  for (const method of ["tabla", "anualidad", "mercado"]) accepts(incomeInputSchema, { ...income, method });
  assert.ok(issues(incomeInputSchema, { ...income, method: "directo" }).some((issue) => issue.startsWith("method")));
});

test("rating columns: one per criterion, each a valid rate index or empty", () => {
  accepts(incomeInputSchema, { ...income, ratingColumns: RATE_TABLE_CRITERIA.map(() => null) });
  accepts(incomeInputSchema, { ...income, ratingColumns: RATE_TABLE_CRITERIA.map(() => RATE_TABLE_RATES.length - 1) });
  assert.ok(issues(incomeInputSchema, { ...income, ratingColumns: income.ratingColumns.slice(1) }).some((issue) => issue.startsWith("ratingColumns")));
  assert.ok(issues(incomeInputSchema, { ...income, ratingColumns: [...income.ratingColumns.slice(1), RATE_TABLE_RATES.length] })
    .some((issue) => issue.startsWith(`ratingColumns.${RATE_TABLE_CRITERIA.length - 1}`)));
  assert.ok(issues(incomeInputSchema, { ...income, ratingColumns: [1.5, ...income.ratingColumns.slice(1)] }).some((issue) => issue.startsWith("ratingColumns.0")));
});

test("the applied rate is a positive fraction or empty", () => {
  accepts(incomeInputSchema, { ...income, appliedRate: null });
  accepts(incomeInputSchema, { ...income, appliedRate: 1 });
  for (const appliedRate of [0, -0.05, 1.01, 8.86]) {
    assert.ok(issues(incomeInputSchema, { ...income, appliedRate }).some((issue) => issue.startsWith("appliedRate")));
  }
});

test("at least one and at most 20 rentable units", () => {
  assert.ok(issues(incomeInputSchema, { ...income, rentableUnits: [] }).some((issue) => issue.startsWith("rentableUnits")));
  accepts(incomeInputSchema, { ...income, rentableUnits: Array.from({ length: 20 }, () => income.rentableUnits[0]) });
  assert.ok(issues(incomeInputSchema, { ...income, rentableUnits: Array.from({ length: 21 }, () => income.rentableUnits[0]) })
    .some((issue) => issue.startsWith("rentableUnits")));
  assert.ok(issues(incomeInputSchema, { ...income, rentableUnits: [{ ...income.rentableUnits[0], unitRent: -1 }] })
    .some((issue) => issue.startsWith("rentableUnits.0.unitRent")));
});

test("each deduction needs its concept, in Spanish, and a rate between 0 and 1", () => {
  assert.deepEqual(
    issues(incomeInputSchema, { ...income, deductions: [{ concept: "   ", rate: 0.1 }] }),
    ["deductions.0.concept: Cada deducción necesita su concepto."],
  );
  assert.ok(issues(incomeInputSchema, { ...income, deductions: [{ concept: "ISR", rate: 1.2 }] }).some((issue) => issue.startsWith("deductions.0.rate")));
  accepts(incomeInputSchema, { ...income, deductions: [{ concept: "ISR", rate: null }] });
  assert.ok(issues(incomeInputSchema, { ...income, deductions: Array.from({ length: 21 }, () => DEFAULT_DEDUCTIONS[0]) })
    .some((issue) => issue.startsWith("deductions")));
});

test("annuity inputs: option 1 or 2, fractions for rates, inflation may be negative", () => {
  accepts(incomeInputSchema, { ...income, annuity: { ...DEFAULT_ANNUITY, option: 1, tiie: 0.11, inflation: -0.02 } });
  assert.ok(issues(incomeInputSchema, { ...income, annuity: { ...DEFAULT_ANNUITY, option: 3 } }).some((issue) => issue.startsWith("annuity.option")));
  assert.ok(issues(incomeInputSchema, { ...income, annuity: { ...DEFAULT_ANNUITY, tiie: 11 } }).some((issue) => issue.startsWith("annuity.tiie")));
  assert.ok(issues(incomeInputSchema, { ...income, annuity: { ...DEFAULT_ANNUITY, inflation: -1.5 } }).some((issue) => issue.startsWith("annuity.inflation")));
  assert.ok(issues(incomeInputSchema, { ...income, annuity: { ...DEFAULT_ANNUITY, vacancyDays: 3651 } }).some((issue) => issue.startsWith("annuity.vacancyDays")));
});

test("market-rate sale prices: at most 50, in Spanish, with short keys", () => {
  const prices = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, index) => [String(index + 1), 1_000_000]));
  accepts(incomeInputSchema, { ...income, marketRate: { ...DEFAULT_MARKET_RATE, salePrices: prices(50) } });
  assert.deepEqual(
    issues(incomeInputSchema, { ...income, marketRate: { ...DEFAULT_MARKET_RATE, salePrices: prices(51) } }),
    ["marketRate.salePrices: Demasiados comparables."],
  );
  assert.ok(issues(incomeInputSchema, { ...income, marketRate: { ...DEFAULT_MARKET_RATE, salePrices: { "1": -5 } } })
    .some((issue) => issue.startsWith("marketRate.salePrices")));
  assert.ok(issues(incomeInputSchema, { ...income, marketRate: { ...DEFAULT_MARKET_RATE, salePrices: { ["x".repeat(13)]: 5 } } })
    .some((issue) => issue.startsWith("marketRate.salePrices")));
  assert.ok(issues(incomeInputSchema, { ...income, marketRate: { ...DEFAULT_MARKET_RATE, vacancy: 1.5 } }).some((issue) => issue.startsWith("marketRate.vacancy")));
});

/* ------------------------------------------------------------------ */
/*  Conclusion                                                         */
/* ------------------------------------------------------------------ */

test("the conclusion takes one approach or weights, and an empty justification becomes null", () => {
  assert.deepEqual(accepts(conclusionSettingsSchema, { method: { kind: "single", approach: "costos" }, justification: "   " }), {
    method: { kind: "single", approach: "costos" },
    justification: null,
  });
  assert.deepEqual(
    accepts(conclusionSettingsSchema, { method: { kind: "weighted", weights: { costos: 0.5, mercado: 0.5 } }, justification: "  Ponderación.  " }),
    { method: { kind: "weighted", weights: { costos: 0.5, mercado: 0.5 } }, justification: "Ponderación." },
  );
  accepts(conclusionSettingsSchema, { method: { kind: "weighted", weights: {} }, justification: null });
});

test("the conclusion rejects unknown approaches, weights outside 0..1 and long justifications", () => {
  assert.ok(issues(conclusionSettingsSchema, { method: { kind: "single", approach: "renta" }, justification: null }).some((issue) => issue.startsWith("method")));
  assert.ok(issues(conclusionSettingsSchema, { method: { kind: "promedio" }, justification: null }).some((issue) => issue.startsWith("method")));
  assert.ok(issues(conclusionSettingsSchema, { method: { kind: "weighted", weights: { costos: 1.2 } }, justification: null })
    .some((issue) => issue.startsWith("method.weights.costos")));
  assert.ok(issues(conclusionSettingsSchema, { method: { kind: "weighted", weights: { costos: -0.1 } }, justification: null })
    .some((issue) => issue.startsWith("method.weights.costos")));
  assert.ok(issues(conclusionSettingsSchema, { method: { kind: "weighted", weights: { terreno: 1 } }, justification: null }).length > 0);
  assert.ok(issues(conclusionSettingsSchema, { method: { kind: "single", approach: "costos" }, justification: "x".repeat(4001) })
    .some((issue) => issue.startsWith("justification")));
  accepts(conclusionSettingsSchema, { method: { kind: "single", approach: "costos" }, justification: "x".repeat(4000) });
});

/* ------------------------------------------------------------------ */
/*  Market approach                                                    */
/* ------------------------------------------------------------------ */

const marketSettings = { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 169.78 };
const comparablePayload = {
  location: "Calle Villa Toledo", area: 140, price: 1260000, landUse: null, shape: null, zone: null, frontage: null, depth: null,
  topography: null, services: null, notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, factors: [],
};

test("market settings: the offer level is one of the six of the format, or empty; a client that omits the new captures still passes", () => {
  for (const offerLevel of [...OFFER_LEVELS, null]) accepts(marketSettingsSchema, { ...marketSettings, offerLevel });
  assert.match(issues(marketSettingsSchema, { ...marketSettings, offerLevel: "REGULAR" }).join(), /^offerLevel/);
  const { offerLevel: _level, typicalFrontage: _frontage, typicalDepth: _depth, ...former } = marketSettings;
  const parsed = accepts(marketSettingsSchema, former) as Record<string, unknown>;
  assert.equal("offerLevel" in parsed || "typicalFrontage" in parsed || "typicalDepth" in parsed, false);
});

test("market settings: the typical frontage and depth are positive metres or empty", () => {
  const parsed = accepts(marketSettingsSchema, { ...marketSettings, typicalFrontage: 8, typicalDepth: 17.5 }) as typeof marketSettings;
  assert.deepEqual([parsed.typicalFrontage, parsed.typicalDepth], [8, 17.5]);
  accepts(marketSettingsSchema, { ...marketSettings, typicalFrontage: null, typicalDepth: null });
  assert.match(issues(marketSettingsSchema, { ...marketSettings, typicalFrontage: 0 }).join(), /^typicalFrontage/);
  assert.match(issues(marketSettingsSchema, { ...marketSettings, typicalDepth: -3 }).join(), /^typicalDepth/);
});

test("a comparable: fronts are a whole number from 1; key, conservation and quality are free text; all optional", () => {
  const former = accepts(comparableInputSchema, comparablePayload) as Record<string, unknown>;
  assert.equal(["frontCount", "landUseKey", "conservation", "quality"].some((key) => key in former), false, "a client of before sends none");

  const parsed = accepts(comparableInputSchema, {
    ...comparablePayload, frontCount: 2, landUseKey: "  AU-I/CS-D ", conservation: "Buena", quality: "  ",
  }) as Record<string, unknown>;
  assert.deepEqual([parsed.frontCount, parsed.landUseKey, parsed.conservation, parsed.quality], [2, "AU-I/CS-D", "Buena", null]);
  accepts(comparableInputSchema, { ...comparablePayload, frontCount: null, landUseKey: null, conservation: null, quality: null });

  assert.deepEqual(issues(comparableInputSchema, { ...comparablePayload, frontCount: 1.5 }), ["frontCount: El número de frentes debe ser un entero."]);
  assert.deepEqual(issues(comparableInputSchema, { ...comparablePayload, frontCount: 0 }), ["frontCount: El número de frentes debe ser 1 o más."]);
  assert.match(issues(comparableInputSchema, { ...comparablePayload, landUseKey: "x".repeat(61) }).join(), /^landUseKey/);
});
