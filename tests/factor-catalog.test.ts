import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_FACTOR_CATALOG,
  factorCatalogSchema,
  factorFromOptions,
  factorWarnings,
  matchOption,
  optionJustification,
  optionsFor,
  resolveFactorCatalog,
} from "../src/features/valuations/calculation/factor-catalog";
import { marketSettingsSchema } from "../src/features/valuations/calculation/market-schemas";

test("the proposed catalog is valid and uses the values of the firm's books", () => {
  assert.ok(factorCatalogSchema.safeParse(DEFAULT_FACTOR_CATALOG).success);
  assert.deepEqual(optionsFor(DEFAULT_FACTOR_CATALOG, "NEGOCIACION").map((o) => o.value), [1, 0.95, 0.9]);
  assert.ok(optionsFor(DEFAULT_FACTOR_CATALOG, "UBICACION").some((o) => o.value === 1.15), "esquina o dos frentes, 1/1.15 in the books");
  assert.deepEqual(optionsFor(DEFAULT_FACTOR_CATALOG, "SUPERFICIE"), [], "surface is computed, never rated");
});

test("a factor is subject rating over comparable rating; negotiation is direct", () => {
  const zona = optionsFor(DEFAULT_FACTOR_CATALOG, "ZONA");
  const similar = zona.find((o) => o.label === "Similar")!;
  const superior = zona.find((o) => o.label === "Superior")!;
  assert.deepEqual(factorFromOptions("ZONA", similar, superior), { value: 1 / 1.05, subjectRating: 1, comparableRating: 1.05 });
  assert.equal(factorFromOptions("ZONA", null, superior), null);
  const tipica = optionsFor(DEFAULT_FACTOR_CATALOG, "NEGOCIACION").find((o) => o.value === 0.95)!;
  assert.deepEqual(factorFromOptions("NEGOCIACION", null, tipica), { value: 0.95, subjectRating: null, comparableRating: null });
  assert.equal(optionJustification("ZONA", "Zona", similar, superior), "Zona: sujeto Similar (1) / comparable Superior (1.05)");
  assert.equal(matchOption(zona, 1.05)?.label, "Superior");
  assert.equal(matchOption(zona, 1.07), null);
});

test("factors and the resultant outside the firm's limits are flagged", () => {
  const limits = DEFAULT_FACTOR_CATALOG.limits;
  assert.deepEqual(factorWarnings([{ label: "Zona", value: 0.95 }], 0.9, limits), []);
  const warnings = factorWarnings([{ label: "Topografía", value: 1 / 0.75 }, { label: "Zona", value: 1 }], 1.4, limits);
  assert.deepEqual(warnings.map((w) => w.kind), ["factor", "resultante"]);
  assert.equal(warnings[0].label, "Topografía");
});

test("a firm catalog is validated; an unreadable one falls back to the proposal", () => {
  assert.equal(factorCatalogSchema.safeParse({ ...DEFAULT_FACTOR_CATALOG, limits: { ...DEFAULT_FACTOR_CATALOG.limits, factorMin: 1.3 } }).success, false);
  assert.equal(factorCatalogSchema.safeParse({ ...DEFAULT_FACTOR_CATALOG, factors: { ZONA: [{ label: "A", value: 1 }, { label: "a", value: 2 }] } }).success, false);
  assert.equal(factorCatalogSchema.safeParse({ ...DEFAULT_FACTOR_CATALOG, factors: { ZONA: [{ label: "A", value: 0 }] } }).success, false);
  const stripped = factorCatalogSchema.parse({ ...DEFAULT_FACTOR_CATALOG, factors: { SUPERFICIE: [{ label: "X", value: 1 }], ZONA: [{ label: "Igual", value: 1 }] } });
  assert.deepEqual(Object.keys(stripped.factors), ["ZONA"]);
  assert.equal(resolveFactorCatalog(null), DEFAULT_FACTOR_CATALOG);
  assert.equal(resolveFactorCatalog({ basura: true }), DEFAULT_FACTOR_CATALOG);
});

test("the market keeps the subject's rating of each factor", () => {
  const parsed = marketSettingsSchema.parse({
    comparableType: "TERRENO_VENTA",
    subjectArea: 160,
    baseArea: null,
    surfacePower: 3,
    adoptedUnitValue: null,
    justification: null,
    additionalAmount: 0,
    factorSlots: [{ type: "ZONA", label: "Zona", subjectOption: "Similar" }, { type: "SUPERFICIE", label: "Superficie" }],
  });
  assert.equal(parsed.factorSlots[0].subjectOption, "Similar");
});
