import assert from "node:assert/strict";
import test from "node:test";
import type {
  BlockFlowStructuralRow,
  BlockFlowV2,
  BlockFlowApartadoRef,
  BlockFlowContentRowRef,
} from "../src/features/valuations/model";
import {
  moveBlockFlowV2ApartadoOneStep,
  canMoveBlockFlowV2ApartadoOneStep,
  apartadoStructuralId,
  contentRowStructuralId,
} from "../src/features/valuations/services/block-flow";

/* ------------------------------------------------------------------ */
/*  Fixture helpers                                                    */
/* ------------------------------------------------------------------ */

function afRef(id: string): BlockFlowApartadoRef {
  return { type: "apartado", apartadoId: id };
}

function crRef(id: string): BlockFlowContentRowRef {
  return { type: "content-row", rowId: id };
}

function row(id: string, items: (BlockFlowApartadoRef | BlockFlowContentRowRef)[]): BlockFlowStructuralRow {
  return { id, items };
}

function pairedRow(aId: string, bId: string): BlockFlowStructuralRow {
  return row(apartadoStructuralId(aId), [afRef(aId), afRef(bId)]);
}

function singleRow(aId: string): BlockFlowStructuralRow {
  return row(apartadoStructuralId(aId), [afRef(aId)]);
}

function contentRow(rowId: string): BlockFlowStructuralRow {
  return row(contentRowStructuralId(rowId), [crRef(rowId)]);
}

function flow(...rows: BlockFlowStructuralRow[]): BlockFlowV2 {
  return { version: 2, rows };
}

function apartadoIdsInRow(f: BlockFlowV2, rowId: string): string[] {
  const r = f.rows.find((row) => row.id === rowId);
  if (!r) return [];
  return r.items
    .filter((i): i is BlockFlowApartadoRef => i.type === "apartado")
    .map((i) => i.apartadoId);
}

/* ================================================================== */
/*  CASE A — PAIRED SOURCE: [A | B] — all 4 moves                     */
/* ================================================================== */

test("paired A|B — A UP → [A] [B]", () => {
  const f = flow(pairedRow("a", "b"));
  const result = moveBlockFlowV2ApartadoOneStep(f, "a", "up");
  assert.equal(result.changed, true);
  assert.equal(result.flow.rows.length, 2);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[0].id), ["a"]);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[1].id), ["b"]);
});

test("paired A|B — A DOWN → [B] [A]", () => {
  const f = flow(pairedRow("a", "b"));
  const result = moveBlockFlowV2ApartadoOneStep(f, "a", "down");
  assert.equal(result.changed, true);
  assert.equal(result.flow.rows.length, 2);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[0].id), ["b"]);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[1].id), ["a"]);
});

test("paired A|B — B UP → [B] [A]", () => {
  const f = flow(pairedRow("a", "b"));
  const result = moveBlockFlowV2ApartadoOneStep(f, "b", "up");
  assert.equal(result.changed, true);
  assert.equal(result.flow.rows.length, 2);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[0].id), ["b"]);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[1].id), ["a"]);
});

test("paired A|B — B DOWN → [A] [B]", () => {
  const f = flow(pairedRow("a", "b"));
  const result = moveBlockFlowV2ApartadoOneStep(f, "b", "down");
  assert.equal(result.changed, true);
  assert.equal(result.flow.rows.length, 2);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[0].id), ["a"]);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[1].id), ["b"]);
});

/* ================================================================== */
/*  CASE A+NEXT — PAIRED + NEXT ROW: [A | B] [C]                      */
/* ================================================================== */

test("paired A|B + C — B DOWN → [A] [B] [C]", () => {
  const f = flow(pairedRow("a", "b"), singleRow("c"));
  const result = moveBlockFlowV2ApartadoOneStep(f, "b", "down");
  assert.equal(result.changed, true);
  assert.equal(result.flow.rows.length, 3);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[0].id), ["a"]);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[1].id), ["b"]);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[2].id), ["c"]);
});

test("paired A|B + C — B DOWN twice → [A] [C] [B]", () => {
  const f1 = flow(pairedRow("a", "b"), singleRow("c"));
  const r1 = moveBlockFlowV2ApartadoOneStep(f1, "b", "down");
  assert.equal(r1.changed, true);
  // After first DOWN: [A] [B] [C], B is singleton at index 1
  const r2 = moveBlockFlowV2ApartadoOneStep(r1.flow, "b", "down");
  assert.equal(r2.changed, true);
  // B moves after C: [A] [C] [B]
  assert.deepEqual(apartadoIdsInRow(r2.flow, r2.flow.rows[0].id), ["a"]);
  assert.deepEqual(apartadoIdsInRow(r2.flow, r2.flow.rows[1].id), ["c"]);
  assert.deepEqual(apartadoIdsInRow(r2.flow, r2.flow.rows[2].id), ["b"]);
});

test("paired A|B + C — A DOWN → [B] [A] [C]", () => {
  const f = flow(pairedRow("a", "b"), singleRow("c"));
  const result = moveBlockFlowV2ApartadoOneStep(f, "a", "down");
  assert.equal(result.changed, true);
  assert.equal(result.flow.rows.length, 3);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[0].id), ["b"]);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[1].id), ["a"]);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[2].id), ["c"]);
});

/* ================================================================== */
/*  CASE B+PREV — PREVIOUS ROW + PAIR: [A] [B | C]                    */
/* ================================================================== */

test("A + B|C — B UP → [A] [B] [C]", () => {
  const f = flow(singleRow("a"), pairedRow("b", "c"));
  const result = moveBlockFlowV2ApartadoOneStep(f, "b", "up");
  assert.equal(result.changed, true);
  assert.equal(result.flow.rows.length, 3);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[0].id), ["a"]);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[1].id), ["b"]);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[2].id), ["c"]);
});

test("A + B|C — B UP twice → [B] [A] [C]", () => {
  const f1 = flow(singleRow("a"), pairedRow("b", "c"));
  const r1 = moveBlockFlowV2ApartadoOneStep(f1, "b", "up");
  assert.equal(r1.changed, true);
  // After split: [A] [B] [C], B is singleton at index 1
  const r2 = moveBlockFlowV2ApartadoOneStep(r1.flow, "b", "up");
  assert.equal(r2.changed, true);
  // B moves before A: [B] [A] [C]
  assert.deepEqual(apartadoIdsInRow(r2.flow, r2.flow.rows[0].id), ["b"]);
  assert.deepEqual(apartadoIdsInRow(r2.flow, r2.flow.rows[1].id), ["a"]);
  assert.deepEqual(apartadoIdsInRow(r2.flow, r2.flow.rows[2].id), ["c"]);
});

test("A + B|C — C UP → [A] [C] [B]", () => {
  const f = flow(singleRow("a"), pairedRow("b", "c"));
  const result = moveBlockFlowV2ApartadoOneStep(f, "c", "up");
  assert.equal(result.changed, true);
  assert.equal(result.flow.rows.length, 3);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[0].id), ["a"]);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[1].id), ["c"]);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[2].id), ["b"]);
});

/* ================================================================== */
/*  CONTENT ROWS                                                       */
/* ================================================================== */

test("B [Content] A — B UP (singleton, prev is content) → [B] [Content] [A]", () => {
  const f = flow(singleRow("b"), contentRow("x"), singleRow("a"));
  const result = moveBlockFlowV2ApartadoOneStep(f, "b", "up");
  // B is singleton at index 0, canMoveUp = false
  assert.equal(result.changed, false);
});

test("A [Content] B — B UP (singleton, prev is content row) → [A] [B] [Content]", () => {
  const f = flow(singleRow("a"), contentRow("x"), singleRow("b"));
  const result = moveBlockFlowV2ApartadoOneStep(f, "b", "up");
  assert.equal(result.changed, true);
  assert.equal(result.flow.rows.length, 3);
  // B moved before Content
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[0].id), ["a"]);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[1].id), ["b"]);
  assert.deepEqual(result.flow.rows[2].items[0], crRef("x"));
});

test("A [Content] B — A DOWN (singleton, next is content row) → [Content] [A] [B]", () => {
  const f = flow(singleRow("a"), contentRow("x"), singleRow("b"));
  const result = moveBlockFlowV2ApartadoOneStep(f, "a", "down");
  assert.equal(result.changed, true);
  assert.equal(result.flow.rows.length, 3);
  assert.deepEqual(result.flow.rows[0].items[0], crRef("x"));
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[1].id), ["a"]);
  assert.deepEqual(apartadoIdsInRow(result.flow, result.flow.rows[2].id), ["b"]);
});

/* ================================================================== */
/*  BOUNDARIES — singleton first/last row                              */
/* ================================================================== */

test("singleton at first row — canMoveUp = false", () => {
  const f = flow(singleRow("a"), singleRow("b"));
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f, "a", "up"), false);
});

test("singleton at first row — MOVE UP → no change", () => {
  const f = flow(singleRow("a"), singleRow("b"));
  const result = moveBlockFlowV2ApartadoOneStep(f, "a", "up");
  assert.equal(result.changed, false);
});

test("singleton at last row — canMoveDown = false", () => {
  const f = flow(singleRow("a"), singleRow("b"));
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f, "b", "down"), false);
});

test("singleton at last row — MOVE DOWN → no change", () => {
  const f = flow(singleRow("a"), singleRow("b"));
  const result = moveBlockFlowV2ApartadoOneStep(f, "b", "down");
  assert.equal(result.changed, false);
});

test("paired row — canMoveUp = true", () => {
  const f = flow(pairedRow("a", "b"));
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f, "a", "up"), true);
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f, "b", "up"), true);
});

test("paired row — canMoveDown = true", () => {
  const f = flow(pairedRow("a", "b"));
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f, "a", "down"), true);
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f, "b", "down"), true);
});

/* ================================================================== */
/*  INVARIANTS — after every movement                                  */
/* ================================================================== */

test("invariant: all apartado IDs preserved", () => {
  const f = flow(pairedRow("a", "b"), singleRow("c"), contentRow("x"));
  const moves: Array<{ id: string; dir: "up" | "down" }> = [
    { id: "a", dir: "up" },
    { id: "b", dir: "down" },
    { id: "c", dir: "up" },
    { id: "a", dir: "down" },
  ];

  let current = f;
  for (const m of moves) {
    const result = moveBlockFlowV2ApartadoOneStep(current, m.id, m.dir);
    if (result.changed) {
      current = result.flow;
      // Collect all apartado IDs across all rows
      const allIds = current.rows
        .flatMap((r) => r.items)
        .filter((i): i is BlockFlowApartadoRef => i.type === "apartado")
        .map((i) => i.apartadoId)
        .sort();
      assert.deepEqual(allIds, ["a", "b", "c"]);
    }
  }
});

test("invariant: no duplicate structural row IDs", () => {
  const f = flow(pairedRow("a", "b"), singleRow("c"));
  const moves: Array<{ id: string; dir: "up" | "down" }> = [
    { id: "a", dir: "up" },
    { id: "b", dir: "down" },
    { id: "c", dir: "up" },
  ];

  let current = f;
  for (const m of moves) {
    const result = moveBlockFlowV2ApartadoOneStep(current, m.id, m.dir);
    if (result.changed) {
      current = result.flow;
      const ids = current.rows.map((r) => r.id);
      assert.equal(new Set(ids).size, ids.length, "duplicate structural row IDs found");
    }
  }
});

test("invariant: version stays 2", () => {
  const f = flow(pairedRow("a", "b"), singleRow("c"));
  const result = moveBlockFlowV2ApartadoOneStep(f, "a", "up");
  if (result.changed) {
    assert.equal(result.flow.version, 2);
  }
});

test("invariant: never mutates input", () => {
  const f = flow(pairedRow("a", "b"), singleRow("c"));
  const originalRows = f.rows.map((r) => ({ ...r, items: [...r.items] }));
  moveBlockFlowV2ApartadoOneStep(f, "a", "up");
  assert.deepEqual(f.rows, originalRows);
});

/* ================================================================== */
/*  canMoveUp / canMoveDown correctness                                */
/* ================================================================== */

test("canMove: nonexistent apartado → false", () => {
  const f = flow(pairedRow("a", "b"));
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f, "nonexistent", "up"), false);
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f, "nonexistent", "down"), false);
});

test("canMove: middle singleton → both directions", () => {
  const f = flow(singleRow("a"), singleRow("b"), singleRow("c"));
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f, "b", "up"), true);
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f, "b", "down"), true);
});

test("canMove: content rows do not affect singleton boundary", () => {
  const f = flow(contentRow("x"), singleRow("a"), contentRow("y"));
  // A at index 1, prev is content at 0, next is content at 2
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f, "a", "up"), true);
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f, "a", "down"), true);
});

test("canMove: paired always true regardless of position", () => {
  // Paired at start
  const f1 = flow(pairedRow("a", "b"), singleRow("c"));
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f1, "a", "up"), true);
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f1, "a", "down"), true);

  // Paired at end
  const f2 = flow(singleRow("c"), pairedRow("a", "b"));
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f2, "a", "up"), true);
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f2, "a", "down"), true);

  // Paired in middle
  const f3 = flow(singleRow("x"), pairedRow("a", "b"), singleRow("y"));
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f3, "a", "up"), true);
  assert.equal(canMoveBlockFlowV2ApartadoOneStep(f3, "a", "down"), true);
});
