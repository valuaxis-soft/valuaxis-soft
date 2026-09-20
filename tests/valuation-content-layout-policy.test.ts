import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTENT_LAYOUT_COLUMNS,
  CONTENT_LAYOUT_MAX_ITEMS_PER_ROW,
  CONTENT_LAYOUT_SPANS,
  isValidContentLayoutSpan,
  canFitContentLayoutItem,
  defaultConceptSpan,
  defaultImageSpan,
  defaultTableSpan,
  defaultSpan,
} from "../src/features/valuations/services/content-layout-policy";

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

test("CONTENT_LAYOUT_COLUMNS is 12", () => {
  assert.equal(CONTENT_LAYOUT_COLUMNS, 12);
});

test("CONTENT_LAYOUT_MAX_ITEMS_PER_ROW is 3", () => {
  assert.equal(CONTENT_LAYOUT_MAX_ITEMS_PER_ROW, 3);
});

test("CONTENT_LAYOUT_SPANS contains exactly [4, 6, 8, 12]", () => {
  assert.deepEqual(CONTENT_LAYOUT_SPANS, [4, 6, 8, 12]);
});

/* ------------------------------------------------------------------ */
/*  isValidContentLayoutSpan                                           */
/* ------------------------------------------------------------------ */

test("isValidContentLayoutSpan — valid spans", () => {
  assert.equal(isValidContentLayoutSpan(4), true);
  assert.equal(isValidContentLayoutSpan(6), true);
  assert.equal(isValidContentLayoutSpan(8), true);
  assert.equal(isValidContentLayoutSpan(12), true);
});

test("isValidContentLayoutSpan — invalid spans", () => {
  assert.equal(isValidContentLayoutSpan(0), false);
  assert.equal(isValidContentLayoutSpan(3), false);
  assert.equal(isValidContentLayoutSpan(5), false);
  assert.equal(isValidContentLayoutSpan(10), false);
  assert.equal(isValidContentLayoutSpan(16), false);
  assert.equal(isValidContentLayoutSpan(-1), false);
});

test("isValidContentLayoutSpan — non-number inputs", () => {
  assert.equal(isValidContentLayoutSpan(undefined), false);
  assert.equal(isValidContentLayoutSpan(null), false);
  assert.equal(isValidContentLayoutSpan("6"), false);
  assert.equal(isValidContentLayoutSpan(NaN), false);
});

/* ------------------------------------------------------------------ */
/*  canFitContentLayoutItem                                           */
/* ------------------------------------------------------------------ */

test("canFitContentLayoutItem — fits when row is empty", () => {
  assert.equal(canFitContentLayoutItem({ usedSpan: 0, itemCount: 0, nextSpan: 12 }), true);
});

test("canFitContentLayoutItem — fits when span and count allow", () => {
  assert.equal(canFitContentLayoutItem({ usedSpan: 6, itemCount: 1, nextSpan: 6 }), true);
});

test("canFitContentLayoutItem — exceeds span limit", () => {
  assert.equal(canFitContentLayoutItem({ usedSpan: 8, itemCount: 1, nextSpan: 8 }), false);
});

test("canFitContentLayoutItem — exceeds item count limit", () => {
  assert.equal(canFitContentLayoutItem({ usedSpan: 4, itemCount: 3, nextSpan: 4 }), false);
});

test("canFitContentLayoutItem — full row of 3 items", () => {
  assert.equal(canFitContentLayoutItem({ usedSpan: 8, itemCount: 2, nextSpan: 4 }), true);
});

test("canFitContentLayoutItem — 3 items already, even with span room", () => {
  assert.equal(canFitContentLayoutItem({ usedSpan: 4, itemCount: 3, nextSpan: 4 }), false);
});

test("canFitContentLayoutItem — exactly fills grid", () => {
  assert.equal(canFitContentLayoutItem({ usedSpan: 0, itemCount: 0, nextSpan: 12 }), true);
});

/* ------------------------------------------------------------------ */
/*  defaultConceptSpan                                                */
/* ------------------------------------------------------------------ */

test("defaultConceptSpan — half returns 6", () => {
  assert.equal(defaultConceptSpan("half"), 6);
});

test("defaultConceptSpan — full returns 12", () => {
  assert.equal(defaultConceptSpan("full"), 12);
});

test("defaultConceptSpan — undefined returns 6", () => {
  assert.equal(defaultConceptSpan(), 6);
});

/* ------------------------------------------------------------------ */
/*  defaultImageSpan                                                  */
/* ------------------------------------------------------------------ */

test("defaultImageSpan — normal returns 8", () => {
  assert.equal(defaultImageSpan("normal"), 8);
});

test("defaultImageSpan — wide returns 8", () => {
  assert.equal(defaultImageSpan("wide"), 8);
});

test("defaultImageSpan — full returns 12", () => {
  assert.equal(defaultImageSpan("full"), 12);
});

test("defaultImageSpan — undefined returns 8", () => {
  assert.equal(defaultImageSpan(), 8);
});

/* ------------------------------------------------------------------ */
/*  defaultTableSpan                                                  */
/* ------------------------------------------------------------------ */

test("defaultTableSpan — always returns 12", () => {
  assert.equal(defaultTableSpan(), 12);
});

/* ------------------------------------------------------------------ */
/*  defaultSpan (unified)                                             */
/* ------------------------------------------------------------------ */

test("defaultSpan — concept half", () => {
  assert.equal(defaultSpan("concept", { layoutSpan: "half" }), 6);
});

test("defaultSpan — concept full", () => {
  assert.equal(defaultSpan("concept", { layoutSpan: "full" }), 12);
});

test("defaultSpan — concept no metadata", () => {
  assert.equal(defaultSpan("concept"), 6);
});

test("defaultSpan — image normal", () => {
  assert.equal(defaultSpan("image", { layoutWidth: "normal" }), 8);
});

test("defaultSpan — image wide", () => {
  assert.equal(defaultSpan("image", { layoutWidth: "wide" }), 8);
});

test("defaultSpan — image full", () => {
  assert.equal(defaultSpan("image", { layoutWidth: "full" }), 12);
});

test("defaultSpan — image no metadata", () => {
  assert.equal(defaultSpan("image"), 8);
});

test("defaultSpan — table always 12", () => {
  assert.equal(defaultSpan("table"), 12);
  assert.equal(defaultSpan("table", {}), 12);
});
