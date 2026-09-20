import assert from "node:assert/strict";
import test from "node:test";
import type { AppSection } from "../src/features/valuations/model";
import { moveSection } from "../src/features/valuations/services/section-order-operations";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function section(id: string, title = `Title ${id}`): AppSection {
  return {
    id,
    label: id.toUpperCase(),
    title,
    sourceFile: `${id}.ts`,
    enabled: true,
    required: false,
    blocks: [],
  };
}

function ids(sections: AppSection[]): string[] {
  return sections.map((s) => s.id);
}

/* ================================================================== */
/*  BASIC REORDER                                                      */
/* ================================================================== */

test("move A B C, move C before A → C A B", () => {
  const input = [section("a"), section("b"), section("c")];
  const result = moveSection(input, { sourceId: "c", targetId: "a", placement: "before" });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.sections), ["c", "a", "b"]);
});

test("move A B C, move A after C → B C A", () => {
  const input = [section("a"), section("b"), section("c")];
  const result = moveSection(input, { sourceId: "a", targetId: "c", placement: "after" });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.sections), ["b", "c", "a"]);
});

test("move A B C, move B after C → A C B", () => {
  const input = [section("a"), section("b"), section("c")];
  const result = moveSection(input, { sourceId: "b", targetId: "c", placement: "after" });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.sections), ["a", "c", "b"]);
});

test("move A B C, move B before A → B A C", () => {
  const input = [section("a"), section("b"), section("c")];
  const result = moveSection(input, { sourceId: "b", targetId: "a", placement: "before" });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.sections), ["b", "a", "c"]);
});

/* ================================================================== */
/*  EDGE CASES                                                         */
/* ================================================================== */

test("invalid source → unchanged", () => {
  const input = [section("a"), section("b"), section("c")];
  const result = moveSection(input, { sourceId: "nonexistent", targetId: "a", placement: "before" });
  assert.equal(result.changed, false);
  assert.deepEqual(ids(result.sections), ["a", "b", "c"]);
});

test("invalid target → unchanged", () => {
  const input = [section("a"), section("b"), section("c")];
  const result = moveSection(input, { sourceId: "a", targetId: "nonexistent", placement: "before" });
  assert.equal(result.changed, false);
  assert.deepEqual(ids(result.sections), ["a", "b", "c"]);
});

test("same source/target → unchanged", () => {
  const input = [section("a"), section("b"), section("c")];
  const result = moveSection(input, { sourceId: "b", targetId: "b", placement: "before" });
  assert.equal(result.changed, false);
  assert.deepEqual(ids(result.sections), ["a", "b", "c"]);
});

/* ================================================================== */
/*  IMMUTABILITY / SAFETY                                              */
/* ================================================================== */

test("no mutation of input array", () => {
  const input = [section("a"), section("b"), section("c")];
  const original = [...input];
  moveSection(input, { sourceId: "c", targetId: "a", placement: "before" });
  assert.deepEqual(ids(input), ids(original));
});

test("no mutation of Section objects", () => {
  const a = section("a", "Original A");
  const b = section("b", "Original B");
  const input = [a, b];
  moveSection(input, { sourceId: "b", targetId: "a", placement: "before" });
  assert.equal(a.title, "Original A");
  assert.equal(b.title, "Original B");
});

test("no duplicate IDs", () => {
  const input = [section("a"), section("b"), section("c")];
  const result = moveSection(input, { sourceId: "c", targetId: "a", placement: "before" });
  const idSet = new Set(ids(result.sections));
  assert.equal(idSet.size, result.sections.length);
});

test("no lost IDs", () => {
  const input = [section("a"), section("b"), section("c")];
  const result = moveSection(input, { sourceId: "c", targetId: "a", placement: "before" });
  assert.deepEqual(ids(result.sections).sort(), ["a", "b", "c"]);
});

test("IDs preserved in order", () => {
  const input = [section("a"), section("b"), section("c")];
  const result = moveSection(input, { sourceId: "a", targetId: "c", placement: "after" });
  assert.deepEqual(ids(result.sections), ["b", "c", "a"]);
});

/* ================================================================== */
/*  SINGLE ITEM                                                        */
/* ================================================================== */

test("single item — same source/target is no-op", () => {
  const input = [section("a")];
  const result = moveSection(input, { sourceId: "a", targetId: "a", placement: "before" });
  assert.equal(result.changed, false);
  assert.deepEqual(ids(result.sections), ["a"]);
});

/* ================================================================== */
/*  TWO ITEMS                                                          */
/* ================================================================== */

test("two items — move first after second", () => {
  const input = [section("a"), section("b")];
  const result = moveSection(input, { sourceId: "a", targetId: "b", placement: "after" });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.sections), ["b", "a"]);
});

test("two items — move second before first", () => {
  const input = [section("a"), section("b")];
  const result = moveSection(input, { sourceId: "b", targetId: "a", placement: "before" });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.sections), ["b", "a"]);
});
