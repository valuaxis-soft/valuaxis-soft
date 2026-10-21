import assert from "node:assert/strict";
import { test } from "node:test";
import type { z } from "zod";
import { conclusionSettingsSchema } from "../src/features/valuations/calculation/conclusion-schemas";
import { constructionTypesSchema, costInputSchema } from "../src/features/valuations/calculation/cost-schemas";
import {
  DEFAULT_LAND,
  constructionCostOf,
  emptyConstruction,
  emptyConstructionCost,
  emptyInstallation,
  findConstructionType,
  remainingUsefulLife,
  withConstructionType,
} from "../src/features/valuations/calculation/cost-types";
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

test("a cost construction row only needs its reference and cost columns: the type's data lives in the construction section", () => {
  const picked = { ...emptyConstructionCost("T-1"), conservation: 0.98, unitReplacementCost: 14361.99 };
  const parsed = accepts(costInputSchema, { ...cost, constructions: [picked] }) as typeof cost;
  assert.deepEqual(parsed.constructions[0], picked);
  // A capture saved before the types had their panel still passes with the type's data.
  accepts(costInputSchema, { ...cost, constructions: [{ ...picked, description: "Casa", area: 120, age: 10, usefulLife: 60 }] });
  assert.ok(issues(costInputSchema, { ...cost, constructions: [{ ...picked, ref: "" }] }).some((issue) => issue.startsWith("constructions.0.ref")));
});

test("the construction types: reference, texts, surface, age and useful life; unique references, at most 30", () => {
  const type = { ref: "T-1", description: " Casa ", classification: "Moderna", quality: "Media", area: 120, age: 10, usefulLife: 60 };
  const parsed = accepts(constructionTypesSchema, { types: [type] }) as { types: (typeof type)[] };
  assert.equal(parsed.types[0].description, "Casa");
  accepts(constructionTypesSchema, { types: [] });
  accepts(constructionTypesSchema, { types: [{ ...type, area: null, age: null, usefulLife: null }] });
  assert.ok(issues(constructionTypesSchema, { types: [type, { ...type, ref: "t-1" }] }).some((issue) => issue.startsWith("types")));
  assert.ok(issues(constructionTypesSchema, { types: [{ ...type, ref: "" }] }).some((issue) => issue.startsWith("types.0.ref")));
  assert.ok(issues(constructionTypesSchema, { types: [{ ...type, age: -1 }] }).some((issue) => issue.startsWith("types.0.age")));
  assert.ok(issues(constructionTypesSchema, { types: Array.from({ length: 31 }, (_, index) => ({ ...type, ref: `T-${index}` })) }).some((issue) => issue.startsWith("types")));

  // The cost row takes the data of the type it names, ignoring case; a type that is gone leaves the row with its reference only.
  const types = [type, { ...type, ref: "T-2", area: 80 }];
  const merged = withConstructionType({ ...emptyConstructionCost("t-2"), conservation: 0.9, unitReplacementCost: 1000 }, types);
  assert.equal(merged.area, 80);
  assert.equal(merged.ref, "t-2");
  assert.equal(merged.conservation, 0.9);
  assert.deepEqual(constructionCostOf(merged), {
    ref: "t-2", conservation: 0.9, conservationRating: null, ageFactor: null, otherFactor: 1, resultantFactor: null, completion: 1, undivided: 1, unitReplacementCost: 1000,
  });
  assert.equal(withConstructionType(emptyConstructionCost("T-9"), types).area, null);
  assert.equal(findConstructionType(types, " t-1 ")?.ref, "T-1");
  assert.equal(remainingUsefulLife(type), 50);
  assert.equal(remainingUsefulLife({ age: 80, usefulLife: 60 }), 0);
  assert.equal(remainingUsefulLife({ age: null, usefulLife: 60 }), null);
});

test("the factors with an Excel formula: empty takes the formula, a number overrides it, and an older client that omits them passes", () => {
  const construction = { ref: "T-1", conservation: 0.98, otherFactor: 1, completion: 1, undivided: 1, unitReplacementCost: 1000 };
  const installation = { ...emptyInstallation(0), description: "Cisterna", quantity: 1, age: 2, usefulLife: 70, conservation: 0.975, unitReplacementCost: 90000 };
  const { ageFactor: _age, resultantFactor: _resultant, ...olderInstallation } = installation;
  const { surfaceFactor: _surface, resultantFactor: _landResultant, ...olderLand } = DEFAULT_LAND;
  const older = accepts(costInputSchema, { land: olderLand, constructions: [construction], installations: [olderInstallation], indirects: [] }) as {
    land: { surfaceFactor: number | null; resultantFactor: number | null };
    constructions: { ageFactor: number | null; resultantFactor: number | null }[];
    installations: { ageFactor: number | null }[];
  };
  assert.equal(older.land.surfaceFactor, null);
  assert.equal(older.land.resultantFactor, null);
  assert.deepEqual([older.constructions[0].ageFactor, older.constructions[0].resultantFactor], [null, null]);
  assert.equal(older.installations[0].ageFactor, null);
  accepts(costInputSchema, {
    land: { ...DEFAULT_LAND, surfaceFactor: 1.05, resultantFactor: 0.9 },
    constructions: [{ ...construction, ageFactor: 0.95, resultantFactor: 0.9 }],
    installations: [{ ...installation, ageFactor: 0.8, resultantFactor: null }],
    indirects: [],
  });
  assert.ok(issues(costInputSchema, {
    land: DEFAULT_LAND, constructions: [{ ...construction, ageFactor: -0.1 }], installations: [], indirects: [],
  }).some((issue) => issue.startsWith("constructions.0.ageFactor")));
  // Completion and undivided share stay fractions: 1 is 100 %, and 100 (a percentage typed as a fraction) is refused.
  assert.ok(issues(costInputSchema, {
    land: DEFAULT_LAND, constructions: [{ ...construction, completion: 100 }], installations: [], indirects: [],
  }).some((issue) => issue.startsWith("constructions.0.completion")));
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
