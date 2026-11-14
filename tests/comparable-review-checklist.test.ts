/**
 * Despacho → Revisión de comparables: the firm's list of checks (add,
 * remove, rename, reorder, required) and the thresholds the warnings use;
 * reviews saved before the list was the firm's keep reading.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { comparableWarnings, REVIEW_CHECKS } from "../src/features/valuations/calculation/comparable-review";
import {
  DEFAULT_REVIEW_CHECKLIST,
  builtAreaToleranceOf,
  checklistFor,
  comparableReviewChecklistSchema,
  labelsForReview,
  missingRequiredChecks,
  moveCheck,
  newCheckKey,
  resolveReviewChecklist,
  reviewCheckLabel,
} from "../src/features/valuations/calculation/comparable-review-checklist";
import { comparableReviewSchema } from "../src/features/valuations/calculation/market-schemas";

const firm = {
  checks: [
    { key: "price", label: "El precio coincide con el anuncio", required: true, hint: null },
    { key: "custom-uso", label: "El uso de suelo coincide", required: true, hint: null },
    { key: "builtArea", label: "Superficie construida", required: false, hint: null },
    { key: "link", label: "El enlace sigue vigente", required: false, hint: "desmárcalo si el anuncio ya caducó" },
  ],
  builtAreaTolerancePercent: 35,
};

test("a firm that never changed it reviews with the built-in list and ±20 %", () => {
  assert.deepEqual(DEFAULT_REVIEW_CHECKLIST.checks.map((check) => check.key), [...REVIEW_CHECKS]);
  assert.equal(DEFAULT_REVIEW_CHECKLIST.checks.find((check) => check.key === "link")?.hint, "desmárcalo si el anuncio ya caducó");
  assert.equal(DEFAULT_REVIEW_CHECKLIST.builtAreaTolerancePercent, 20);
  assert.deepEqual(resolveReviewChecklist(null), DEFAULT_REVIEW_CHECKLIST);
  assert.deepEqual(resolveReviewChecklist({ checks: "roto" }), DEFAULT_REVIEW_CHECKLIST, "an unreadable list falls back");
  assert.deepEqual(resolveReviewChecklist(firm), firm);
});

test("the list needs names, no repeats and a percentage from 1 to 100", () => {
  const issue = (value: unknown) => comparableReviewChecklistSchema.safeParse(value).error?.issues[0]?.message;
  assert.equal(issue({ ...firm, checks: [] }), "La lista necesita al menos un punto de verificación.");
  assert.equal(issue({ ...firm, checks: [{ key: "a", label: " ", required: false }] }), "Cada punto de verificación necesita un nombre.");
  assert.equal(issue({ ...firm, checks: [{ key: "a", label: "Foto" }, { key: "b", label: "foto " }] }), "Hay dos puntos de verificación con el mismo nombre.");
  assert.equal(issue({ ...firm, checks: [{ key: "a", label: "Foto" }, { key: "a", label: "Precio" }] }), "Hay puntos de verificación repetidos.");
  assert.equal(issue({ ...firm, builtAreaTolerancePercent: 0 }), "El porcentaje de superficie va de 1 a 100.");
  assert.equal(issue({ ...firm, builtAreaTolerancePercent: 12.5 }), "El porcentaje va sin decimales.");
  assert.equal(issue(firm), undefined);
});

test("the built area is not a point of a land comparable; required points missing only warn when verified", () => {
  assert.deepEqual(checklistFor(firm, "TERRENO_VENTA").map((check) => check.key), ["price", "custom-uso", "link"]);
  assert.deepEqual(checklistFor(firm, "INMUEBLE_VENTA").map((check) => check.key), ["price", "custom-uso", "builtArea", "link"]);
  assert.deepEqual(missingRequiredChecks(firm.checks, { price: true }).map((check) => check.key), ["custom-uso"]);
  assert.deepEqual(missingRequiredChecks(firm.checks, { price: true, "custom-uso": true }), []);
});

test("a review keeps the names its checks had; one saved before reads with the built-in names", () => {
  assert.deepEqual(labelsForReview({ price: true, "custom-uso": false }, firm), { price: "El precio coincide con el anuncio", "custom-uso": "El uso de suelo coincide" });
  assert.equal(reviewCheckLabel("contact", undefined, firm), "Contacto del anunciante", "a built-in check the firm removed");
  assert.equal(reviewCheckLabel("custom-uso", { "custom-uso": "Uso de suelo (antes)" }, firm), "Uso de suelo (antes)");
  assert.equal(reviewCheckLabel("custom-borrado"), "custom-borrado");
  // The review accepts the firm's keys, and a review of before still parses.
  assert.deepEqual(comparableReviewSchema.parse({ status: "VERIFICADO", checks: { "custom-uso": true } }).checks, { "custom-uso": true });
  assert.deepEqual(comparableReviewSchema.parse({ status: "VERIFICADO", checks: { photo: true, link: false } }).checks, { photo: true, link: false });
  assert.equal(comparableReviewSchema.safeParse({ status: "VERIFICADO", checks: { "<script>": true } }).success, false);
});

test("points are reordered one place at a time and new ones get a key of their own", () => {
  assert.deepEqual(moveCheck(["a", "b", "c"], 2, -1), ["a", "c", "b"]);
  assert.deepEqual(moveCheck(["a", "b", "c"], 0, -1), ["a", "b", "c"]);
  assert.deepEqual(moveCheck(["a", "b", "c"], 0, 1), ["b", "a", "c"]);
  const keys = ["random-1", "random-2"];
  let call = 0;
  assert.equal(newCheckKey(["custom-random-1"], () => keys[call++]), "custom-random-2");
});

test("the built area warns past the firm's percentage, not the built-in 20 %", () => {
  const input = {
    location: "Juárez 12", area: 130, sourceName: "Inmobiliaria", contactName: "Ana", contactPhone: "3300000000",
    offerDate: null, hasScreenshot: true,
  };
  const context = { type: "INMUEBLE_VENTA" as const, subjectArea: 100, today: "2026-11-13" };
  assert.deepEqual(comparableWarnings(input, context).map((warning) => warning.key), ["BUILT_AREA"]);
  assert.deepEqual(comparableWarnings(input, { ...context, builtAreaTolerance: builtAreaToleranceOf(firm) }), []);
  const [warning] = comparableWarnings({ ...input, area: 140 }, { ...context, builtAreaTolerance: 0.35 });
  assert.match(warning.message, /40 % mayor que la del sujeto \(más de ±35 %\)/);
});
