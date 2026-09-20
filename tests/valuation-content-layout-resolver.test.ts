import assert from "node:assert/strict";
import test from "node:test";
import type {
  ContentLayoutColumnV2,
  ContentLayoutItem,
  ContentLayoutItemRef,
  ContentLayoutPersisted,
  ContentLayoutRowV2,
  ContentLayoutV2,
} from "../src/features/valuations/model";
import {
  resolveContentLayoutV2,
  reconcileContentLayoutV2,
  appendMissingContentToV2,
} from "../src/features/valuations/services/content-layout-v2";

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

function makeContainer(opts: {
  concepts?: Array<{ id: string }>;
  tables?: Array<{ id: string }>;
  images?: Array<{ id: string }>;
  contentLayout?: ContentLayoutPersisted;
}) {
  return {
    concepts: (opts.concepts ?? []).map((c) => ({ id: c.id, label: c.id, value: "" })),
    tables: (opts.tables ?? []).map((t) => ({ id: t.id, title: t.id, columns: [], rows: [] })),
    images: (opts.images ?? []).map((i) => ({ id: i.id, title: i.id, src: "" })),
    contentLayout: opts.contentLayout,
  };
}

function v1(type: "concept" | "image" | "table", id: string, span: 4 | 6 | 8 | 12 = 6): ContentLayoutItem {
  return { type, id, span };
}

function flatRefs(layout: ContentLayoutV2): ContentLayoutItemRef[] {
  const refs: ContentLayoutItemRef[] = [];
  for (const row of layout.rows) {
    for (const col of row.columns) {
      refs.push(...col.items);
    }
  }
  return refs;
}

function rowColCounts(layout: ContentLayoutV2): number[] {
  return layout.rows.map((r) => r.columns.length);
}

/* ================================================================== */
/*  MISSING LAYOUT — no contentLayout on container                     */
/* ================================================================== */

test("missing layout — empty container", () => {
  const container = makeContainer({});
  const result = resolveContentLayoutV2(container);

  assert.equal(result.version, 2);
  assert.equal(result.rows.length, 0);
});

test("missing layout — concepts only", () => {
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
  });
  const result = resolveContentLayoutV2(container);

  assert.equal(result.version, 2);
  const refs = flatRefs(result);
  assert.equal(refs.length, 3);
  assert.deepEqual(refs[0], ref("concept", "c1"));
  assert.deepEqual(refs[1], ref("concept", "c2"));
  assert.deepEqual(refs[2], ref("concept", "c3"));
});

test("missing layout — mixed concepts/tables/images", () => {
  const container = makeContainer({
    concepts: [{ id: "c1" }],
    tables: [{ id: "t1" }],
    images: [{ id: "i1" }],
  });
  const result = resolveContentLayoutV2(container);

  assert.equal(result.version, 2);
  const refs = flatRefs(result);
  // Legacy order: concepts → tables → images
  assert.equal(refs.length, 3);
  assert.deepEqual(refs[0], ref("concept", "c1"));
  assert.deepEqual(refs[1], ref("table", "t1"));
  assert.deepEqual(refs[2], ref("image", "i1"));
});

test("missing layout — legacy visible row behavior preserved", () => {
  // 5 concepts with default span=6: V1 derives rows [c1,c2] [c3,c4] [c5]
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }, { id: "c5" }],
  });
  const result = resolveContentLayoutV2(container);

  // V2 should derive 3 rows (from V1 balanced row sizes)
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].columns.length, 2);
  assert.equal(result.rows[1].columns.length, 2);
  assert.equal(result.rows[2].columns.length, 1);
});

/* ================================================================== */
/*  V1 — contentLayout is V1 array                                    */
/* ================================================================== */

test("V1 — resolves to V2", () => {
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }],
    contentLayout: [v1("concept", "c1"), v1("concept", "c2")],
  });
  const result = resolveContentLayoutV2(container);

  assert.equal(result.version, 2);
  const refs = flatRefs(result);
  assert.equal(refs.length, 2);
  assert.deepEqual(refs[0], ref("concept", "c1"));
  assert.deepEqual(refs[1], ref("concept", "c2"));
});

test("V1 — explicit row breaks preserved", () => {
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }],
    contentLayout: [
      v1("concept", "c1"),
      { ...v1("concept", "c2"), rowBreakBefore: true },
      v1("concept", "c3"),
      { ...v1("concept", "c4"), rowBreakBefore: true },
    ],
  });
  const result = resolveContentLayoutV2(container);

  // V1 explicit: [c1] [c2,c3] [c4] → V2: 3 rows
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].columns.length, 1);
  assert.equal(result.rows[1].columns.length, 2);
  assert.equal(result.rows[2].columns.length, 1);
});

test("V1 — stale/duplicate handled", () => {
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }],
    contentLayout: [
      v1("concept", "c1"),
      v1("concept", "c999"), // stale
      v1("concept", "c1"),   // duplicate
    ],
  });
  const result = resolveContentLayoutV2(container);

  const refs = flatRefs(result);
  // c999 removed (stale), duplicate c1 removed (dedup)
  assert.equal(refs.length, 2);
  assert.deepEqual(refs[0], ref("concept", "c1"));
  assert.deepEqual(refs[1], ref("concept", "c2"));
});

test("V1 — empty V1 array falls back to legacy generation", () => {
  const container = makeContainer({
    concepts: [{ id: "c1" }],
    contentLayout: [],
  });
  const result = resolveContentLayoutV2(container);

  assert.equal(result.version, 2);
  const refs = flatRefs(result);
  assert.equal(refs.length, 1);
  assert.deepEqual(refs[0], ref("concept", "c1"));
});

/* ================================================================== */
/*  V2 — contentLayout is already V2                                  */
/* ================================================================== */

test("V2 — valid V2 preserved", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")]), col("c-0-1", [ref("concept", "c2")])]),
    row("r-1", [col("c-1-0", [ref("concept", "c3")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  assert.equal(result.version, 2);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows[0].id, "r-0");
  assert.deepEqual(result.rows[1].id, "r-1");
  assert.deepEqual(result.rows[0].columns[0].items[0], ref("concept", "c1"));
  assert.deepEqual(result.rows[0].columns[1].items[0], ref("concept", "c2"));
  assert.deepEqual(result.rows[1].columns[0].items[0], ref("concept", "c3"));
});

test("V2 — stale ref removed without rebalancing", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")]), col("c-0-1", [ref("concept", "c999")])]),
    row("r-1", [col("c-1-0", [ref("concept", "c3")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c3" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  // c999 removed from row 0, but row structure preserved
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].columns.length, 1); // was 2, now 1
  assert.equal(result.rows[1].columns.length, 1);
  assert.deepEqual(result.rows[0].columns[0].items[0], ref("concept", "c1"));
  assert.deepEqual(result.rows[1].columns[0].items[0], ref("concept", "c3"));
});

test("V2 — duplicate ref removed (keeps first)", () => {
  const layout = v2([
    row("r-0", [
      col("c-0-0", [ref("concept", "c1")]),
      col("c-0-1", [ref("concept", "c1")]), // duplicate
    ]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  // Duplicate removed, only first column survives
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].columns.length, 1);
  assert.deepEqual(result.rows[0].columns[0].items[0], ref("concept", "c1"));
});

test("V2 — empty row/column cleaned", () => {
  const layout = v2([
    row("r-0", []), // empty row → removed
    row("r-1", [col("c-1-0", [ref("concept", "c1")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].id, "r-1");
});

test("V2 — existing IDs preserved", () => {
  const layout = v2([
    row("my-row-0", [col("my-col-0", [ref("concept", "c1")])]),
    row("my-row-1", [col("my-col-1", [ref("concept", "c2")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  assert.deepEqual(result.rows[0].id, "my-row-0");
  assert.deepEqual(result.rows[1].id, "my-row-1");
  assert.deepEqual(result.rows[0].columns[0].id, "my-col-0");
  assert.deepEqual(result.rows[1].columns[0].id, "my-col-1");
});

test("V2 — malformed V2 falls back to legacy", () => {
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }],
    contentLayout: { version: 2, rows: "not-an-array" } as unknown as ContentLayoutV2,
  });
  const result = resolveContentLayoutV2(container);

  // Falls back to legacy V1 → V2 conversion
  assert.equal(result.version, 2);
  const refs = flatRefs(result);
  assert.equal(refs.length, 2);
});

/* ================================================================== */
/*  MISSING CONTENT — append new items to existing V2                 */
/* ================================================================== */

test("missing content — append new concept", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  // c2 appended to last row (has capacity)
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].columns.length, 2);
  assert.deepEqual(result.rows[0].columns[0].items[0], ref("concept", "c1"));
  assert.deepEqual(result.rows[0].columns[1].items[0], ref("concept", "c2"));
});

test("missing content — append new table", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }],
    tables: [{ id: "t1" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].columns.length, 2);
  assert.deepEqual(result.rows[0].columns[1].items[0], ref("table", "t1"));
});

test("missing content — append new image", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }],
    images: [{ id: "i1" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].columns.length, 2);
  assert.deepEqual(result.rows[0].columns[1].items[0], ref("image", "i1"));
});

test("missing content — fill last row when capacity <3", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")]), col("c-0-1", [ref("concept", "c2")])]),
    row("r-1", [col("c-1-0", [ref("concept", "c3")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  // c4 appended to r-1 (has 1 col, capacity for 2 more)
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].columns.length, 2);
  assert.equal(result.rows[1].columns.length, 2);
  assert.deepEqual(result.rows[1].columns[1].items[0], ref("concept", "c4"));
});

test("missing content — create new row when last row full", () => {
  const layout = v2([
    row("r-0", [
      col("c-0-0", [ref("concept", "c1")]),
      col("c-0-1", [ref("concept", "c2")]),
      col("c-0-2", [ref("concept", "c3")]),
    ]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  // r-0 is full (3 cols), c4 goes to new row
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].columns.length, 3);
  assert.equal(result.rows[1].columns.length, 1);
  assert.deepEqual(result.rows[1].columns[0].items[0], ref("concept", "c4"));
});

test("missing content — preserve existing order", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c2")]), col("c-0-1", [ref("concept", "c1")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  // c2, c1 preserved in original order; c3 appended
  assert.equal(result.rows[0].columns.length, 3);
  assert.deepEqual(result.rows[0].columns[0].items[0], ref("concept", "c2"));
  assert.deepEqual(result.rows[0].columns[1].items[0], ref("concept", "c1"));
  assert.deepEqual(result.rows[0].columns[2].items[0], ref("concept", "c3"));
});

test("missing content — deterministic IDs", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }],
    contentLayout: layout,
  });

  const result1 = resolveContentLayoutV2(container);
  const result2 = resolveContentLayoutV2(container);

  assert.deepEqual(result1, result2);
});

test("missing content — new row ID avoids collision with existing", () => {
  const layout = v2([
    row("r-5", [col("c-5-0", [ref("concept", "c1")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  // r-5 is full (1 col), c2 fills to 2, c3 fills to 3, c4 needs new row
  // New row should use r-6 (offset from max existing r-5)
  assert.ok(result.rows.length >= 2);
  const lastRow = result.rows[result.rows.length - 1];
  assert.ok(lastRow.id.startsWith("r-6"));
});

test("missing content — multiple missing items appended in legacy type order", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }],
    tables: [{ id: "t1" }],
    images: [{ id: "i1" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  // c1 present, c2/t1/i1 missing → appended in order
  // r-0: [c1, c2, t1] (fills to 3)
  // r-1: [i1] (new row)
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].columns.length, 3);
  assert.deepEqual(result.rows[0].columns[0].items[0], ref("concept", "c1"));
  assert.deepEqual(result.rows[0].columns[1].items[0], ref("concept", "c2"));
  assert.deepEqual(result.rows[0].columns[2].items[0], ref("table", "t1"));
  assert.equal(result.rows[1].columns.length, 1);
  assert.deepEqual(result.rows[1].columns[0].items[0], ref("image", "i1"));
});

/* ================================================================== */
/*  SAFETY                                                            */
/* ================================================================== */

test("safety — no mutation", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }],
    contentLayout: JSON.parse(JSON.stringify(layout)),
  });
  const frozenLayout = JSON.parse(JSON.stringify(layout));

  resolveContentLayoutV2(container);

  // Original layout unchanged
  assert.deepEqual(layout, frozenLayout);
});

test("safety — max 3 columns", () => {
  const layout = v2([
    row("r-0", [
      col("c-0-0", [ref("concept", "c1")]),
      col("c-0-1", [ref("concept", "c2")]),
      col("c-0-2", [ref("concept", "c3")]),
      col("c-0-3", [ref("concept", "c4")]),
    ]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  for (const row of result.rows) {
    assert.ok(row.columns.length <= 3, `Row ${row.id} has ${row.columns.length} columns`);
  }
});

test("safety — one item per column", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  for (const row of result.rows) {
    for (const col of row.columns) {
      assert.equal(col.items.length, 1, `Column ${col.id} has ${col.items.length} items`);
    }
  }
});

test("safety — mixed types", () => {
  const layout = v2([
    row("r-0", [
      col("c-0-0", [ref("concept", "c1")]),
      col("c-0-1", [ref("table", "t1")]),
      col("c-0-2", [ref("image", "i1")]),
    ]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }],
    tables: [{ id: "t1" }],
    images: [{ id: "i1" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  assert.equal(result.version, 2);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].columns.length, 3);
  assert.deepEqual(result.rows[0].columns[0].items[0], ref("concept", "c1"));
  assert.deepEqual(result.rows[0].columns[1].items[0], ref("table", "t1"));
  assert.deepEqual(result.rows[0].columns[2].items[0], ref("image", "i1"));
});

test("safety — stale refs removed, no rebalance", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")]), col("c-0-1", [ref("concept", "c999")])]),
    row("r-1", [col("c-1-0", [ref("concept", "c2")]), col("c-1-1", [ref("concept", "c3")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  // c999 removed from row 0, but row 1 untouched
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].columns.length, 1);
  assert.equal(result.rows[1].columns.length, 2);
});

test("safety — missing content does not destroy existing structure", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")]), col("c-0-1", [ref("concept", "c2")])]),
    row("r-1", [col("c-1-0", [ref("concept", "c3")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }],
    contentLayout: layout,
  });
  const result = resolveContentLayoutV2(container);

  // Existing rows preserved, c4 appended to r-1
  assert.equal(result.rows[0].id, "r-0");
  assert.equal(result.rows[1].id, "r-1");
  assert.equal(result.rows[0].columns.length, 2);
  assert.equal(result.rows[1].columns.length, 2);
  assert.deepEqual(result.rows[1].columns[0].items[0], ref("concept", "c3"));
  assert.deepEqual(result.rows[1].columns[1].items[0], ref("concept", "c4"));
});

/* ================================================================== */
/*  reconcileContentLayoutV2 — focused tests                          */
/* ================================================================== */

test("reconcile — removes stale refs", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")]), col("c-0-1", [ref("concept", "c999")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }],
    contentLayout: layout,
  });
  const result = reconcileContentLayoutV2(container, layout);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].columns.length, 1);
  assert.deepEqual(result.rows[0].columns[0].items[0], ref("concept", "c1"));
});

test("reconcile — removes duplicates", () => {
  const layout = v2([
    row("r-0", [
      col("c-0-0", [ref("concept", "c1")]),
      col("c-0-1", [ref("concept", "c1")]),
    ]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }],
    contentLayout: layout,
  });
  const result = reconcileContentLayoutV2(container, layout);

  assert.equal(result.rows[0].columns.length, 1);
});

test("reconcile — preserves row/column structure", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")])]),
    row("r-1", [col("c-1-0", [ref("concept", "c2")])]),
    row("r-2", [col("c-2-0", [ref("concept", "c3")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
    contentLayout: layout,
  });
  const result = reconcileContentLayoutV2(container, layout);

  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows[0].id, "r-0");
  assert.deepEqual(result.rows[1].id, "r-1");
  assert.deepEqual(result.rows[2].id, "r-2");
});

/* ================================================================== */
/*  appendMissingContentToV2 — focused tests                          */
/* ================================================================== */

test("append — fills last row when space available", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }],
    contentLayout: layout,
  });
  const result = appendMissingContentToV2(container, layout);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].columns.length, 2);
});

test("append — creates new row when last row full", () => {
  const layout = v2([
    row("r-0", [
      col("c-0-0", [ref("concept", "c1")]),
      col("c-0-1", [ref("concept", "c2")]),
      col("c-0-2", [ref("concept", "c3")]),
    ]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }],
    contentLayout: layout,
  });
  const result = appendMissingContentToV2(container, layout);

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].columns.length, 3);
  assert.equal(result.rows[1].columns.length, 1);
});

test("append — no-op when no missing content", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }],
    contentLayout: layout,
  });
  const result = appendMissingContentToV2(container, layout);

  assert.deepEqual(result, layout);
});

test("append — empty layout gets all items", () => {
  const layout = v2([]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }],
    contentLayout: layout,
  });
  const result = appendMissingContentToV2(container, layout);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].columns.length, 2);
});

test("append — no mutation", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")])]),
  ]);
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }],
    contentLayout: JSON.parse(JSON.stringify(layout)),
  });
  const frozenLayout = JSON.parse(JSON.stringify(layout));

  appendMissingContentToV2(container, layout);

  assert.deepEqual(layout, frozenLayout);
});
