import assert from "node:assert/strict";
import test from "node:test";
import type {
  ContentLayoutColumnV2,
  ContentLayoutItemRef,
  ContentLayoutRowV2,
  ContentLayout as ContentLayoutV2,
} from "../src/features/valuations/model";
import {
  moveContentLayout as moveContentLayoutV2,
  moveContentLayoutRow as moveContentLayoutRowV2,
  cleanContentLayout as cleanContentLayoutV2,
  setItemFullRowPreservingOrder,
  mergeItemToAdjacentRow,
} from "../src/features/valuations/services/content-layout-v2-operations";
import { normalizeContentLayout as normalizeContentLayoutV2 } from "../src/features/valuations/services/content-layout";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function ref(type: "concept" | "image" | "table", id: string): ContentLayoutItemRef {
  return { type, id };
}

function col(id: string, items: ContentLayoutItemRef[]): ContentLayoutColumnV2 {
  return { id, items };
}

function row(id: string, columns: ContentLayoutColumnV2[]): ContentLayoutRowV2 {
  return { id, columns };
}

function v2(rows: ContentLayoutRowV2[]): ContentLayoutV2 {
  return { version: 2, rows };
}

function ids(layout: ContentLayoutV2): string[][] {
  return layout.rows.map((r) => r.columns.map((c) => c.items[0]?.id ?? ""));
}

function rowIds(layout: ContentLayoutV2): string[] {
  return layout.rows.map((r) => r.id);
}

function colIds(layout: ContentLayoutV2): string[][] {
  return layout.rows.map((r) => r.columns.map((c) => c.id));
}

/* ================================================================== */
/*  SAME ROW — before-column / after-column                           */
/* ================================================================== */

test("same row — A B C → C left of A = C A B", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c2",
    targetRowId: "r-0",
    targetColumnId: "c0",
    placement: "before-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["C", "A", "B"]]);
});

test("same row — A B C → A right of C = B C A", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c0",
    targetRowId: "r-0",
    targetColumnId: "c2",
    placement: "after-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["B", "C", "A"]]);
});

test("same row — move in full 3-column row is allowed (reorder)", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c2",
    targetRowId: "r-0",
    targetColumnId: "c0",
    placement: "before-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["C", "A", "B"]]);
});

/* ================================================================== */
/*  BETWEEN ROWS — before-column / after-column                       */
/* ================================================================== */

test("between rows — A B C / D → B right of D = A C / D B", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
    row("r-1", [col("c3", [ref("concept", "D")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c1",
    targetRowId: "r-1",
    targetColumnId: "c3",
    placement: "after-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A", "C"], ["D", "B"]]);
});

test("between rows — source row removed when empty after move", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c1",
    targetRowId: "r-0",
    targetColumnId: "c0",
    placement: "after-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A", "B"]]);
  assert.equal(result.layout.rows.length, 1);
});

test("between rows — source row with remaining items preserved", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
    row("r-1", [col("c3", [ref("concept", "D")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c1",
    targetRowId: "r-1",
    targetColumnId: "c3",
    placement: "after-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A", "C"], ["D", "B"]]);
  assert.equal(result.layout.rows.length, 2);
});

test("between rows — A / B → B right of A = A B", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c1",
    targetRowId: "r-0",
    targetColumnId: "c0",
    placement: "after-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A", "B"]]);
});

test("between rows — A / B → B left of A = B A", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c1",
    targetRowId: "r-0",
    targetColumnId: "c0",
    placement: "before-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["B", "A"]]);
});

/* ================================================================== */
/*  MAX 3 ENFORCEMENT                                                 */
/* ================================================================== */

test("max 3 — 2-column destination accepts third", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
    row("r-1", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c2",
    targetRowId: "r-0",
    targetColumnId: "c1",
    placement: "after-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A", "B", "C"]]);
});

test("max 3 — 3-column destination rejects fourth", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
    row("r-1", [col("c3", [ref("concept", "D")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c3",
    targetRowId: "r-0",
    targetColumnId: "c1",
    placement: "after-column",
  });
  assert.equal(result.changed, false);
  assert.deepEqual(ids(result.layout), [["A", "B", "C"], ["D"]]);
});

test("max 3 — rejected operation returns stable unchanged semantic layout", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
    row("r-1", [col("c3", [ref("concept", "D")])]),
  ]);
  const originalRowIds = rowIds(layout);
  const originalColIds = colIds(layout);

  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c3",
    targetRowId: "r-0",
    targetColumnId: "c1",
    placement: "after-column",
  });

  assert.equal(result.changed, false);
  assert.deepEqual(rowIds(result.layout), originalRowIds);
  assert.deepEqual(colIds(result.layout), originalColIds);
});

test("max 3 — same-row reorder in full 3-column row IS allowed", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c2",
    targetRowId: "r-0",
    targetColumnId: "c0",
    placement: "before-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["C", "A", "B"]]);
});

/* ================================================================== */
/*  NEW ROW BELOW                                                     */
/* ================================================================== */

test("new row — move E to new row after Row 1", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
    row("r-1", [col("c3", [ref("concept", "D")]), col("c4", [ref("concept", "E")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c4",
    targetRowId: "r-0",
    placement: "new-row-after",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A", "B", "C"], ["E"], ["D"]]);
  assert.equal(result.layout.rows.length, 3);
});

test("new row — move C to new row after Row 1 (single-item source row)", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
    row("r-1", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c2",
    targetRowId: "r-0",
    placement: "new-row-after",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A", "B"], ["C"]]);
  assert.equal(result.layout.rows.length, 2);
});

test("new row — source row removed when empty", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c1",
    targetRowId: "r-0",
    placement: "new-row-after",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A"], ["B"]]);
  assert.equal(result.layout.rows.length, 2);
});

/* ================================================================== */
/*  NEW ROW ABOVE                                                     */
/* ================================================================== */

test("new row — move C to new row before Row 1", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
    row("r-1", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c2",
    targetRowId: "r-0",
    placement: "new-row-before",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["C"], ["A", "B"]]);
  assert.equal(result.layout.rows.length, 2);
});

test("new row — move B to new row before Row 2 (multi-item source row)", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
    row("r-1", [col("c3", [ref("concept", "D")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c1",
    targetRowId: "r-1",
    placement: "new-row-before",
  });
  assert.equal(result.changed, true);
  // New row [B] inserted immediately BEFORE target row [D]
  // Source row [A,C] preserved above
  assert.deepEqual(ids(result.layout), [["A", "C"], ["B"], ["D"]]);
});

test("new row — source row preserved when not empty", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
    row("r-1", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c1",
    targetRowId: "r-0",
    placement: "new-row-before",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A"], ["B"], ["C"]]);
  assert.equal(result.layout.rows.length, 3);
});

test("new row — unrelated rows preserve order", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
    row("r-2", [col("c2", [ref("concept", "C")])]),
    row("r-3", [col("c3", [ref("concept", "D")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c1",
    targetRowId: "r-2",
    placement: "new-row-after",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A"], ["C"], ["B"], ["D"]]);
});

/* ================================================================== */
/*  ROW MOVEMENT                                                      */
/* ================================================================== */

test("row move — move row before", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
    row("r-2", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutRowV2(layout, {
    sourceRowId: "r-2",
    targetRowId: "r-0",
    placement: "before",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["C"], ["A"], ["B"]]);
});

test("row move — move row after", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
    row("r-2", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutRowV2(layout, {
    sourceRowId: "r-0",
    targetRowId: "r-2",
    placement: "after",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["B"], ["C"], ["A"]]);
});

test("row move — first to last (before)", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
    row("r-2", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutRowV2(layout, {
    sourceRowId: "r-0",
    targetRowId: "r-2",
    placement: "before",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["B"], ["A"], ["C"]]);
});

test("row move — last to first (after)", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
    row("r-2", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutRowV2(layout, {
    sourceRowId: "r-2",
    targetRowId: "r-0",
    placement: "after",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A"], ["C"], ["B"]]);
});

test("row move — IDs preserved", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
  ]);
  const result = moveContentLayoutRowV2(layout, {
    sourceRowId: "r-1",
    targetRowId: "r-0",
    placement: "before",
  });
  assert.deepEqual(rowIds(result.layout), ["r-1", "r-0"]);
});

test("row move — single row no-op", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
  ]);
  const result = moveContentLayoutRowV2(layout, {
    sourceRowId: "r-0",
    targetRowId: "r-0",
    placement: "before",
  });
  assert.equal(result.changed, false);
});

/* ================================================================== */
/*  MIXED TYPES                                                       */
/* ================================================================== */

test("mixed types — concept, image, table columns move identically", () => {
  const layout = v2([
    row("r-0", [
      col("c0", [ref("concept", "A")]),
      col("c1", [ref("image", "I")]),
      col("c2", [ref("table", "T")]),
    ]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c2",
    targetRowId: "r-0",
    targetColumnId: "c0",
    placement: "before-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["T", "A", "I"]]);
});

test("mixed types — move image between rows", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("image", "I")])]),
    row("r-1", [col("c2", [ref("table", "T")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c1",
    targetRowId: "r-1",
    targetColumnId: "c2",
    placement: "after-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A"], ["T", "I"]]);
});

/* ================================================================== */
/*  SAFETY                                                            */
/* ================================================================== */

test("safety — invalid source ID returns unchanged", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "nonexistent",
    targetRowId: "r-0",
    targetColumnId: "c0",
    placement: "before-column",
  });
  assert.equal(result.changed, false);
});

test("safety — invalid target row ID returns unchanged", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c0",
    targetRowId: "nonexistent",
    targetColumnId: "c0",
    placement: "before-column",
  });
  assert.equal(result.changed, false);
});

test("safety — invalid target column ID returns unchanged", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c0",
    targetRowId: "r-0",
    targetColumnId: "nonexistent",
    placement: "before-column",
  });
  assert.equal(result.changed, false);
});

test("safety — source == target returns unchanged", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c0",
    targetRowId: "r-0",
    targetColumnId: "c0",
    placement: "before-column",
  });
  assert.equal(result.changed, false);
});

test("safety — no mutation", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
    row("r-1", [col("c2", [ref("concept", "C")])]),
  ]);
  const original = JSON.parse(JSON.stringify(layout));

  moveContentLayoutV2(layout, {
    sourceColumnId: "c2",
    targetRowId: "r-0",
    targetColumnId: "c1",
    placement: "after-column",
  });

  assert.deepEqual(layout, original);
});

test("safety — no duplicated refs", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
    row("r-1", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c2",
    targetRowId: "r-0",
    targetColumnId: "c1",
    placement: "after-column",
  });
  const allRefs = result.layout.rows.flatMap((r) => r.columns.map((c) => c.items[0]?.id));
  assert.equal(new Set(allRefs).size, allRefs.length);
});

test("safety — no lost refs", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
    row("r-1", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c2",
    targetRowId: "r-0",
    targetColumnId: "c1",
    placement: "after-column",
  });
  const allRefs = result.layout.rows.flatMap((r) => r.columns.map((c) => c.items[0]?.id));
  assert.deepEqual(allRefs.sort(), ["A", "B", "C"]);
});

test("safety — max 3 invariant", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
    row("r-1", [col("c3", [ref("concept", "D")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c3",
    targetRowId: "r-0",
    targetColumnId: "c1",
    placement: "after-column",
  });
  // Should be rejected
  assert.equal(result.changed, false);
  for (const r of result.layout.rows) {
    assert.ok(r.columns.length <= 3);
  }
});

test("safety — existing IDs preserved after move", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
    row("r-1", [col("c2", [ref("concept", "C")]), col("c3", [ref("concept", "D")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c2",
    targetRowId: "r-0",
    targetColumnId: "c1",
    placement: "after-column",
  });
  // Row IDs preserved (source row still has D, so not removed)
  assert.deepEqual(rowIds(result.layout), ["r-0", "r-1"]);
  // Column IDs preserved
  assert.deepEqual(colIds(result.layout), [["c0", "c1", "c2"], ["c3"]]);
});

/* ================================================================== */
/*  CLEAN                                                             */
/* ================================================================== */

test("clean — removes empty rows", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", []),
    row("r-2", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = cleanContentLayoutV2(layout);
  assert.equal(result.changed, true);
  assert.equal(result.layout.rows.length, 2);
  assert.deepEqual(ids(result.layout), [["A"], ["C"]]);
});

test("clean — removes empty columns", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [])]),
  ]);
  const result = cleanContentLayoutV2(layout);
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A"]]);
});

test("clean — no-op when already clean", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
  ]);
  const result = cleanContentLayoutV2(layout);
  assert.equal(result.changed, false);
});

/* ================================================================== */
/*  EDGE CASES                                                        */
/* ================================================================== */

test("edge — empty layout returns unchanged", () => {
  const layout = v2([]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c0",
    targetRowId: "r-0",
    placement: "new-row-after",
  });
  assert.equal(result.changed, false);
});

test("edge — move to same position in same row returns unchanged", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
  ]);
  // Move A before A (same column) → no-op
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c0",
    targetRowId: "r-0",
    targetColumnId: "c0",
    placement: "before-column",
  });
  assert.equal(result.changed, false);
});

test("edge — move A after B in 2-col row swaps them", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c0",
    targetRowId: "r-0",
    targetColumnId: "c1",
    placement: "after-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["B", "A"]]);
});

test("edge — move B before A in 2-col row swaps them", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c1",
    targetRowId: "r-0",
    targetColumnId: "c0",
    placement: "before-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["B", "A"]]);
});

test("edge — move last column after first in 3-col row", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c2",
    targetRowId: "r-0",
    targetColumnId: "c0",
    placement: "after-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A", "C", "B"]]);
});

test("edge — move first column before last in 3-col row", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c0",
    targetRowId: "r-0",
    targetColumnId: "c2",
    placement: "before-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["B", "A", "C"]]);
});

/* ================================================================== */
/*  FULL ROW — setItemFullRowPreservingOrder                          */
/* ================================================================== */

test("full row — [A,B,C] B full → [A] [B] [C]", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const result = setItemFullRowPreservingOrder(layout, "B");
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A"], ["B"], ["C"]]);
  assert.equal(result.layout.rows.length, 3);
});

test("full row — [A,B,C] A full → [A] [B,C]", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const result = setItemFullRowPreservingOrder(layout, "A");
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A"], ["B", "C"]]);
  assert.equal(result.layout.rows.length, 2);
});

test("full row — [A,B,C] C full → [A,B] [C]", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const result = setItemFullRowPreservingOrder(layout, "C");
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A", "B"], ["C"]]);
  assert.equal(result.layout.rows.length, 2);
});

test("full row — [A,B,Image] B full → [A] [B] [Image]", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("image", "Image")])]),
  ]);
  const result = setItemFullRowPreservingOrder(layout, "B");
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A"], ["B"], ["Image"]]);
  assert.equal(result.layout.rows.length, 3);
});

test("full row — [Image,B,Table] B full → [Image] [B] [Table]", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("image", "Image")]), col("c1", [ref("concept", "B")]), col("c2", [ref("table", "Table")])]),
  ]);
  const result = setItemFullRowPreservingOrder(layout, "B");
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["Image"], ["B"], ["Table"]]);
  assert.equal(result.layout.rows.length, 3);
});

test("full row — already alone in row → no-op", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
    row("r-1", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = setItemFullRowPreservingOrder(layout, "C");
  assert.equal(result.changed, false);
  assert.deepEqual(ids(result.layout), [["A", "B"], ["C"]]);
});

test("full row — item not found → no-op", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
  ]);
  const result = setItemFullRowPreservingOrder(layout, "nonexistent");
  assert.equal(result.changed, false);
});

test("full row — flat order preserved [A,B,C] B full", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const before = layout.rows.flatMap((r) => r.columns.flatMap((c) => c.items.map((i) => i.id)));
  const result = setItemFullRowPreservingOrder(layout, "B");
  const after = result.layout.rows.flatMap((r) => r.columns.flatMap((c) => c.items.map((i) => i.id)));
  assert.deepEqual(after, before);
});

test("full row — multi-row layout [A,B] [C,D] B full → [A] [B] [C,D]", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
    row("r-1", [col("c2", [ref("concept", "C")]), col("c3", [ref("concept", "D")])]),
  ]);
  const result = setItemFullRowPreservingOrder(layout, "B");
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A"], ["B"], ["C", "D"]]);
  assert.equal(result.layout.rows.length, 3);
});

test("full row — no duplicate row IDs", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const result = setItemFullRowPreservingOrder(layout, "B");
  const ids = result.layout.rows.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("full row — no duplicate column IDs", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const result = setItemFullRowPreservingOrder(layout, "B");
  const colIds = result.layout.rows.flatMap((r) => r.columns.map((c) => c.id));
  assert.equal(new Set(colIds).size, colIds.length);
});

test("full row — no mutation of input", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const original = JSON.parse(JSON.stringify(layout));
  setItemFullRowPreservingOrder(layout, "B");
  assert.deepEqual(layout, original);
});

/* ================================================================== */
/*  FULL ROW — mergeItemToAdjacentRow (deactivate) — TARGET-ANCHORED   */
/* ================================================================== */

test("merge — [A] [B] [C] B shared → [A] [B,C] (NEXT supplies C)", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
    row("r-2", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = mergeItemToAdjacentRow(layout, "B");
  assert.equal(result.changed, true);
  // B stays in its row, C moves INTO B's row
  assert.deepEqual(ids(result.layout), [["A"], ["B", "C"]]);
  assert.equal(result.layout.rows.length, 2);
  // B's row ID preserved
  assert.equal(result.layout.rows[0].id, "r-0");
  assert.equal(result.layout.rows[1].id, "r-1");
});

test("merge — [A,X,Y] [B] [C] B shared → [A,X,Y] [B,C] (NEXT supplies C)", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "X")]), col("c2", [ref("concept", "Y")])]),
    row("r-1", [col("c3", [ref("concept", "B")])]),
    row("r-2", [col("c4", [ref("concept", "C")])]),
  ]);
  const result = mergeItemToAdjacentRow(layout, "B");
  assert.equal(result.changed, true);
  // B stays in r-1, C moves INTO B's row
  assert.deepEqual(ids(result.layout), [["A", "X", "Y"], ["B", "C"]]);
  assert.equal(result.layout.rows.length, 2);
  // B's row ID preserved
  assert.equal(result.layout.rows[1].id, "r-1");
});

test("merge — [A] [B] B shared → [A,B] (no NEXT, PREVIOUS supplies A)", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
  ]);
  const result = mergeItemToAdjacentRow(layout, "B");
  assert.equal(result.changed, true);
  // No NEXT row, so A moves INTO B's row (before B)
  assert.deepEqual(ids(result.layout), [["A", "B"]]);
  assert.equal(result.layout.rows.length, 1);
  // B's row ID preserved
  assert.equal(result.layout.rows[0].id, "r-1");
});

test("merge — [A] [B] A shared → [A,B] (NEXT supplies B into A's row)", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
  ]);
  const result = mergeItemToAdjacentRow(layout, "A");
  assert.equal(result.changed, true);
  // B moves INTO A's row (after A)
  assert.deepEqual(ids(result.layout), [["A", "B"]]);
  assert.equal(result.layout.rows.length, 1);
  // A's row ID preserved
  assert.equal(result.layout.rows[0].id, "r-0");
});

test("merge — [A] [B,C] A shared → [A,B] [C] (NEXT supplies B into A's row)", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const result = mergeItemToAdjacentRow(layout, "A");
  assert.equal(result.changed, true);
  // B moves INTO A's row, C stays in remaining row
  assert.deepEqual(ids(result.layout), [["A", "B"], ["C"]]);
  assert.equal(result.layout.rows.length, 2);
  // A's row ID preserved
  assert.equal(result.layout.rows[0].id, "r-0");
});

test("merge — [A,B] [C] C shared → [A] [B,C] (no NEXT, PREVIOUS supplies B)", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
    row("r-1", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = mergeItemToAdjacentRow(layout, "C");
  assert.equal(result.changed, true);
  // B moves INTO C's row (before C), PREVIOUS becomes [A]
  assert.deepEqual(ids(result.layout), [["A"], ["B", "C"]]);
  assert.equal(result.layout.rows.length, 2);
  // C's row ID preserved
  assert.equal(result.layout.rows[1].id, "r-1");
});

test("merge — not alone in row → no-op", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
  ]);
  const result = mergeItemToAdjacentRow(layout, "A");
  assert.equal(result.changed, false);
});

test("merge — both neighbors empty/absent → no-op", () => {
  const layout = v2([
    row("r-0", [col("c3", [ref("concept", "B")])]),
  ]);
  const result = mergeItemToAdjacentRow(layout, "B");
  assert.equal(result.changed, false);
});

test("merge — item not found → no-op", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
  ]);
  const result = mergeItemToAdjacentRow(layout, "nonexistent");
  assert.equal(result.changed, false);
});

test("merge — flat order preserved [A] [B] [C] B shared", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
    row("r-2", [col("c2", [ref("concept", "C")])]),
  ]);
  const before = layout.rows.flatMap((r) => r.columns.flatMap((c) => c.items.map((i) => i.id)));
  const result = mergeItemToAdjacentRow(layout, "B");
  const after = result.layout.rows.flatMap((r) => r.columns.flatMap((c) => c.items.map((i) => i.id)));
  assert.deepEqual(after, before);
});

test("merge — no mutation of input", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
  ]);
  const original = JSON.parse(JSON.stringify(layout));
  mergeItemToAdjacentRow(layout, "B");
  assert.deepEqual(layout, original);
});

/* ================================================================== */
/*  TARGET STABILITY — flat index must not change                      */
/* ================================================================== */

test("target stability — [A] [B] [C] B shared, B flat index stays 1", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
    row("r-2", [col("c2", [ref("concept", "C")])]),
  ]);
  const beforeFlat = layout.rows.flatMap((r) => r.columns.flatMap((c) => c.items.map((i) => i.id)));
  const targetIndexBefore = beforeFlat.indexOf("B");

  const result = mergeItemToAdjacentRow(layout, "B");
  const afterFlat = result.layout.rows.flatMap((r) => r.columns.flatMap((c) => c.items.map((i) => i.id)));
  const targetIndexAfter = afterFlat.indexOf("B");

  assert.equal(targetIndexAfter, targetIndexBefore);
});

test("target stability — [A,X,Y] [B] [C] B shared, B flat index stays 3", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "X")]), col("c2", [ref("concept", "Y")])]),
    row("r-1", [col("c3", [ref("concept", "B")])]),
    row("r-2", [col("c4", [ref("concept", "C")])]),
  ]);
  const beforeFlat = layout.rows.flatMap((r) => r.columns.flatMap((c) => c.items.map((i) => i.id)));
  const targetIndexBefore = beforeFlat.indexOf("B");

  const result = mergeItemToAdjacentRow(layout, "B");
  const afterFlat = result.layout.rows.flatMap((r) => r.columns.flatMap((c) => c.items.map((i) => i.id)));
  const targetIndexAfter = afterFlat.indexOf("B");

  assert.equal(targetIndexAfter, targetIndexBefore);
});

test("target stability — target row ID preserved during share", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
    row("r-2", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = mergeItemToAdjacentRow(layout, "B");
  // B was in r-1, should still be in r-1
  const bRow = result.layout.rows.find((r) => r.columns.some((c) => c.items.some((i) => i.id === "B")));
  assert.ok(bRow);
  assert.equal(bRow.id, "r-1");
});

test("target stability — no duplicate row IDs after share", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
    row("r-2", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = mergeItemToAdjacentRow(layout, "B");
  const rowIdList = result.layout.rows.map((r) => r.id);
  assert.equal(new Set(rowIdList).size, rowIdList.length);
});

test("target stability — no duplicate column IDs after share", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
    row("r-2", [col("c2", [ref("concept", "C")])]),
  ]);
  const result = mergeItemToAdjacentRow(layout, "B");
  const colIdList = result.layout.rows.flatMap((r) => r.columns.map((c) => c.id));
  assert.equal(new Set(colIdList).size, colIdList.length);
});

/* ================================================================== */
/*  CYCLE TESTS — full → share → full → share 5+ cycles               */
/* ================================================================== */

test("cycle — full→share→full→share B, 5 cycles, flat order never drifts", () => {
  let layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const originalFlat = ["A", "B", "C"];

  for (let i = 0; i < 5; i++) {
    // Full row
    const fullResult = setItemFullRowPreservingOrder(layout, "B");
    assert.equal(fullResult.changed, true);
    const fullFlat = fullResult.layout.rows.flatMap((r) => r.columns.flatMap((c) => c.items.map((idx) => idx.id)));
    assert.deepEqual(fullFlat, originalFlat, `cycle ${i} full — flat order drift`);

    // Share row
    const shareResult = mergeItemToAdjacentRow(fullResult.layout, "B");
    assert.equal(shareResult.changed, true);
    const shareFlat = shareResult.layout.rows.flatMap((r) => r.columns.flatMap((c) => c.items.map((idx) => idx.id)));
    assert.deepEqual(shareFlat, originalFlat, `cycle ${i} share — flat order drift`);

    layout = shareResult.layout;
  }
});

test("cycle — full→share on B in [A,B,C,D], 5 cycles", () => {
  let layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")]), col("c3", [ref("concept", "D")])]),
  ]);
  // normalize splits 4-col into [A,B] [C,D]
  layout = normalizeContentLayoutV2(layout);
  const originalFlat = ["A", "B", "C", "D"];

  for (let i = 0; i < 5; i++) {
    const fullResult = setItemFullRowPreservingOrder(layout, "B");
    const fullFlat = fullResult.layout.rows.flatMap((r) => r.columns.flatMap((c) => c.items.map((idx) => idx.id)));
    assert.deepEqual(fullFlat, originalFlat, `cycle ${i} full — flat order drift`);

    const shareResult = mergeItemToAdjacentRow(fullResult.layout, "B");
    const shareFlat = shareResult.layout.rows.flatMap((r) => r.columns.flatMap((c) => c.items.map((idx) => idx.id)));
    assert.deepEqual(shareFlat, originalFlat, `cycle ${i} share — flat order drift`);

    layout = shareResult.layout;
  }
});

/* ================================================================== */
/*  FULL ROW — round-trip                                              */
/* ================================================================== */

test("round-trip — activate then deactivate restores structure", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const activated = setItemFullRowPreservingOrder(layout, "B");
  assert.deepEqual(ids(activated.layout), [["A"], ["B"], ["C"]]);

  const deactivated = mergeItemToAdjacentRow(activated.layout, "B");
  assert.equal(deactivated.changed, true);
  // B stays in its row, C moves INTO B's row
  assert.deepEqual(ids(deactivated.layout), [["A"], ["B", "C"]]);
  // Flat order preserved
  const flatOrder = deactivated.layout.rows.flatMap((r) => r.columns.flatMap((c) => c.items.map((i) => i.id)));
  assert.deepEqual(flatOrder, ["A", "B", "C"]);
});

test("round-trip — activate middle, deactivate brings NEXT into target row", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
  ]);
  const activated = setItemFullRowPreservingOrder(layout, "B");
  assert.deepEqual(ids(activated.layout), [["A"], ["B"], ["C"]]);

  const deactivated = mergeItemToAdjacentRow(activated.layout, "B");
  // C moves INTO B's row
  assert.deepEqual(ids(deactivated.layout), [["A"], ["B", "C"]]);
});
