import assert from "node:assert/strict";
import test from "node:test";
import type { Apartado } from "../src/features/valuations/model";
import { moveApartado } from "../src/features/valuations/services/apartado-order-operations";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function sb(id: string, title = `Title ${id}`): Apartado {
  return { id, title, enabled: true, concepts: [], tables: [], images: [] };
}

function ids(apartados: Apartado[]): string[] {
  return apartados.map((sb) => sb.id);
}

/* ================================================================== */
/*  BASIC REORDER                                                      */
/* ================================================================== */

test("move A B C, move C before A → C A B", () => {
  const input = [sb("a"), sb("b"), sb("c")];
  const result = moveApartado(input, { sourceId: "c", targetId: "a", placement: "before" });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.apartados), ["c", "a", "b"]);
});

test("move A B C, move A after C → B C A", () => {
  const input = [sb("a"), sb("b"), sb("c")];
  const result = moveApartado(input, { sourceId: "a", targetId: "c", placement: "after" });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.apartados), ["b", "c", "a"]);
});

test("move A B C, move B after C → A C B", () => {
  const input = [sb("a"), sb("b"), sb("c")];
  const result = moveApartado(input, { sourceId: "b", targetId: "c", placement: "after" });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.apartados), ["a", "c", "b"]);
});

test("move A B C, move B before A → B A C", () => {
  const input = [sb("a"), sb("b"), sb("c")];
  const result = moveApartado(input, { sourceId: "b", targetId: "a", placement: "before" });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.apartados), ["b", "a", "c"]);
});

/* ================================================================== */
/*  EDGE CASES                                                         */
/* ================================================================== */

test("invalid source → unchanged", () => {
  const input = [sb("a"), sb("b"), sb("c")];
  const result = moveApartado(input, { sourceId: "nonexistent", targetId: "a", placement: "before" });
  assert.equal(result.changed, false);
  assert.deepEqual(ids(result.apartados), ["a", "b", "c"]);
});

test("invalid target → unchanged", () => {
  const input = [sb("a"), sb("b"), sb("c")];
  const result = moveApartado(input, { sourceId: "a", targetId: "nonexistent", placement: "before" });
  assert.equal(result.changed, false);
  assert.deepEqual(ids(result.apartados), ["a", "b", "c"]);
});

test("same source/target → unchanged", () => {
  const input = [sb("a"), sb("b"), sb("c")];
  const result = moveApartado(input, { sourceId: "b", targetId: "b", placement: "before" });
  assert.equal(result.changed, false);
  assert.deepEqual(ids(result.apartados), ["a", "b", "c"]);
});

/* ================================================================== */
/*  IMMUTABILITY / SAFETY                                              */
/* ================================================================== */

test("no mutation of input array", () => {
  const input = [sb("a"), sb("b"), sb("c")];
  const original = [...input];
  moveApartado(input, { sourceId: "c", targetId: "a", placement: "before" });
  assert.deepEqual(ids(input), ids(original));
});

test("no mutation of SubBlock objects", () => {
  const a = sb("a", "Original A");
  const b = sb("b", "Original B");
  const input = [a, b];
  moveApartado(input, { sourceId: "b", targetId: "a", placement: "before" });
  assert.equal(a.title, "Original A");
  assert.equal(b.title, "Original B");
});

test("no duplicate IDs", () => {
  const input = [sb("a"), sb("b"), sb("c")];
  const result = moveApartado(input, { sourceId: "c", targetId: "a", placement: "before" });
  const idSet = new Set(ids(result.apartados));
  assert.equal(idSet.size, result.apartados.length);
});

test("no lost IDs", () => {
  const input = [sb("a"), sb("b"), sb("c")];
  const result = moveApartado(input, { sourceId: "c", targetId: "a", placement: "before" });
  assert.deepEqual(ids(result.apartados).sort(), ["a", "b", "c"]);
});

test("IDs preserved in order", () => {
  const input = [sb("a"), sb("b"), sb("c")];
  const result = moveApartado(input, { sourceId: "a", targetId: "c", placement: "after" });
  assert.deepEqual(ids(result.apartados), ["b", "c", "a"]);
});

/* ================================================================== */
/*  SINGLE ITEM                                                        */
/* ================================================================== */

test("single item — same source/target is no-op", () => {
  const input = [sb("a")];
  const result = moveApartado(input, { sourceId: "a", targetId: "a", placement: "before" });
  assert.equal(result.changed, false);
  assert.deepEqual(ids(result.apartados), ["a"]);
});

/* ================================================================== */
/*  TWO ITEMS                                                          */
/* ================================================================== */

test("two items — move first after second", () => {
  const input = [sb("a"), sb("b")];
  const result = moveApartado(input, { sourceId: "a", targetId: "b", placement: "after" });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.apartados), ["b", "a"]);
});

test("two items — move second before first", () => {
  const input = [sb("a"), sb("b")];
  const result = moveApartado(input, { sourceId: "b", targetId: "a", placement: "before" });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.apartados), ["b", "a"]);
});
