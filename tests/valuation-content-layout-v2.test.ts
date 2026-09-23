import assert from "node:assert/strict";
import test from "node:test";
import type {
  ContentLayoutColumnV2,
  ContentLayoutItemRef,
  ContentLayoutRowV2,
  ContentLayout as ContentLayoutV2,
} from "../src/features/valuations/model";
import {
  isContentLayout as isContentLayoutV2,
  normalizeContentLayout as normalizeContentLayoutV2,
  bootstrapContentLayout,
  CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW,
} from "../src/features/valuations/services/content-layout";

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
}) {
  return {
    concepts: (opts.concepts ?? []).map((c) => ({ id: c.id, label: c.id, value: "" })),
    tables: (opts.tables ?? []).map((t) => ({ id: t.id, title: t.id, columns: [], rows: [] })),
    images: (opts.images ?? []).map((i) => ({ id: i.id, title: i.id, src: "" })),
  };
}

/* ================================================================== */
/*  isContentLayoutV2                                                  */
/* ================================================================== */

test("type guard — valid empty V2", () => {
  assert.equal(isContentLayoutV2({ version: 2, rows: [] }), true);
});

test("type guard — valid populated V2", () => {
  const layout = v2([
    row("r-0", [col("c-0-0", [ref("concept", "a")])]),
  ]);
  assert.equal(isContentLayoutV2(layout), true);
});

test("type guard — wrong version", () => {
  assert.equal(isContentLayoutV2({ version: 1, rows: [] }), false);
});

test("type guard — null", () => {
  assert.equal(isContentLayoutV2(null), false);
});

test("type guard — undefined", () => {
  assert.equal(isContentLayoutV2(undefined), false);
});

test("type guard — string", () => {
  assert.equal(isContentLayoutV2("hello"), false);
});

test("type guard — missing rows", () => {
  assert.equal(isContentLayoutV2({ version: 2 }), false);
});

test("type guard — malformed row (missing id) accepted as plausible V2", () => {
  // Relaxed guard: accepts structurally plausible V2; normalization handles cleanup
  assert.equal(isContentLayoutV2({
    version: 2,
    rows: [{ columns: [] }],
  }), true);
});

test("type guard — malformed row (missing columns)", () => {
  assert.equal(isContentLayoutV2({ version: 2, rows: [{ id: "r-0" }] }), false);
});

test("type guard — malformed column (missing id) accepted as plausible V2", () => {
  assert.equal(isContentLayoutV2({
    version: 2,
    rows: [{ id: "r-0", columns: [{ items: [] }] }],
  }), true);
});

test("type guard — malformed column (missing items)", () => {
  assert.equal(isContentLayoutV2({
    version: 2,
    rows: [{ id: "r-0", columns: [{ id: "c-0-0" }] }],
  }), false);
});

test("type guard — malformed ref (missing type) accepted as plausible V2", () => {
  assert.equal(isContentLayoutV2({
    version: 2,
    rows: [{ id: "r-0", columns: [{ id: "c-0-0", items: [{ id: "a" }] }] }],
  }), true);
});

test("type guard — malformed ref (missing id) accepted as plausible V2", () => {
  assert.equal(isContentLayoutV2({
    version: 2,
    rows: [{ id: "r-0", columns: [{ id: "c-0-0", items: [{ type: "concept" }] }] }],
  }), true);
});

test("type guard — malformed ref (invalid type) accepted as plausible V2", () => {
  assert.equal(isContentLayoutV2({
    version: 2,
    rows: [{ id: "r-0", columns: [{ id: "c-0-0", items: [{ type: "video", id: "a" }] }] }],
  }), true);
});

test("type guard — row is null", () => {
  assert.equal(isContentLayoutV2({ version: 2, rows: [null] }), false);
});

test("type guard — column is null", () => {
  assert.equal(isContentLayoutV2({
    version: 2,
    rows: [{ id: "r-0", columns: [null] }],
  }), false);
});

test("type guard — ref is null accepted as plausible V2", () => {
  assert.equal(isContentLayoutV2({
    version: 2,
    rows: [{ id: "r-0", columns: [{ id: "c-0-0", items: [null] }] }],
  }), true);
});

/* ================================================================== */
/*  bootstrapContentLayout                                             */
/* ================================================================== */

test("bootstrap — empty container", () => {
  const container = makeContainer({});
  const result = bootstrapContentLayout(container);

  assert.equal(result.version, 2);
  assert.equal(result.rows.length, 0);
});

test("bootstrap — 1 concept", () => {
  const container = makeContainer({
    concepts: [{ id: "c1" }],
  });
  const result = bootstrapContentLayout(container);

  assert.equal(result.version, 2);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].columns.length, 1);
  assert.deepEqual(result.rows[0].columns[0].items, [ref("concept", "c1")]);
});

test("bootstrap — 2 concepts", () => {
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }],
  });
  const result = bootstrapContentLayout(container);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].columns.length, 2);
  assert.deepEqual(result.rows[0].columns[0].items, [ref("concept", "c1")]);
  assert.deepEqual(result.rows[0].columns[1].items, [ref("concept", "c2")]);
});

test("bootstrap — 3 concepts (default span=6 each, splits into 2 rows)", () => {
  // Default span for concepts is 6 (half-width).
  // 3 × 6 = 18 > 12 grid units → [c1,c2] [c3]
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
  });
  const result = bootstrapContentLayout(container);

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].columns.length, 2);
  assert.equal(result.rows[1].columns.length, 1);
  assert.deepEqual(result.rows[0].columns[0].items, [ref("concept", "c1")]);
  assert.deepEqual(result.rows[0].columns[1].items, [ref("concept", "c2")]);
  assert.deepEqual(result.rows[1].columns[0].items, [ref("concept", "c3")]);
});

test("bootstrap — 5 half-width concepts pack two per row", () => {
  // Default span for concepts is 6 (half-width).
  // Each row fills up to 12 grid units.
  // [c1(6),c2(6)] = 12 → row 0. [c3(6),c4(6)] = 12 → row 1. [c5(6)] = 6 → row 2.
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }, { id: "c5" }],
  });
  const result = bootstrapContentLayout(container);

  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].columns.length, 2);
  assert.equal(result.rows[1].columns.length, 2);
  assert.equal(result.rows[2].columns.length, 1);

  // Row 0 items
  assert.deepEqual(result.rows[0].columns[0].items, [ref("concept", "c1")]);
  assert.deepEqual(result.rows[0].columns[1].items, [ref("concept", "c2")]);

  // Row 1 items
  assert.deepEqual(result.rows[1].columns[0].items, [ref("concept", "c3")]);
  assert.deepEqual(result.rows[1].columns[1].items, [ref("concept", "c4")]);

  // Row 2 items
  assert.deepEqual(result.rows[2].columns[0].items, [ref("concept", "c5")]);
});

test("bootstrap — mixed Concept/Image/Table", () => {
  // Default spans: concept=6, table=12, image=8
  // Order: concepts→tables→images → c1(6), c2(6), t1(12), i1(8)
  // Row derivation: [c1(6),c2(6)] span=12 ✓. t1(12) → new row. i1(8) → doesn't fit after t1(12) → new row.
  // Result: [c1,c2] [t1] [i1]
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }],
    images: [{ id: "i1" }],
    tables: [{ id: "t1" }],
  });
  const result = bootstrapContentLayout(container);

  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].columns.length, 2);
  assert.deepEqual(result.rows[0].columns[0].items, [ref("concept", "c1")]);
  assert.deepEqual(result.rows[0].columns[1].items, [ref("concept", "c2")]);
  assert.equal(result.rows[1].columns.length, 1);
  assert.deepEqual(result.rows[1].columns[0].items, [ref("table", "t1")]);
  assert.equal(result.rows[2].columns.length, 1);
  assert.deepEqual(result.rows[2].columns[0].items, [ref("image", "i1")]);
});

test("bootstrap — no mutation of input", () => {
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }],
  });
  const originalConcepts = [...container.concepts];

  const result = bootstrapContentLayout(container);

  // Input arrays should be unchanged
  assert.deepEqual(container.concepts, originalConcepts);
  assert.equal(result.rows.length, 1);
});

test("bootstrap — deterministic repeated row/column IDs", () => {
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }, { id: "c3" }, { id: "c4" }],
  });

  const result1 = bootstrapContentLayout(container);
  const result2 = bootstrapContentLayout(container);

  assert.deepEqual(result1, result2);
  assert.equal(result1.rows[0].id, result2.rows[0].id);
  assert.equal(result1.rows[1].id, result2.rows[1].id);
  assert.equal(result1.rows[0].columns[0].id, result2.rows[0].columns[0].id);
});

test("bootstrap — disabled items included; normal/wide images pack as 8 units", () => {
  const container = {
    concepts: [{ id: "c1", label: "c1", value: "", enabled: false }],
    tables: [],
    images: [
      { id: "i1", title: "i1", src: "", layoutWidth: "wide" as const },
      { id: "i2", title: "i2", src: "", layoutWidth: "normal" as const },
    ],
  };
  const result = bootstrapContentLayout(container);

  // c1(6) alone (i1(8) does not fit next to it), then i1(8) and i2(8) in separate rows
  assert.deepEqual(result, v2([
    row("r-0", [col("c-0-0", [ref("concept", "c1")])]),
    row("r-1", [col("c-1-0", [ref("image", "i1")])]),
    row("r-2", [col("c-2-0", [ref("image", "i2")])]),
  ]));
});

test("bootstrap — no contentLayout in container (generates from arrays)", () => {
  const container = makeContainer({
    concepts: [{ id: "c1" }, { id: "c2" }],
  });
  const result = bootstrapContentLayout(container);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].columns.length, 2);
  assert.deepEqual(result.rows[0].columns[0].items, [ref("concept", "c1")]);
  assert.deepEqual(result.rows[0].columns[1].items, [ref("concept", "c2")]);
});

test("bootstrap — IDs are generic (no section/block info)", () => {
  const container = makeContainer({
    concepts: [{ id: "c1" }],
  });
  const result = bootstrapContentLayout(container);

  // IDs should be pattern-based, not contain section/block names
  assert.match(result.rows[0].id, /^r-/);
  assert.match(result.rows[0].columns[0].id, /^c-/);
});

/* ================================================================== */
/*  normalizeContentLayoutV2                                          */
/* ================================================================== */

test("normalize — empty rows", () => {
  const input = v2([]);
  const result = normalizeContentLayoutV2(input);

  assert.equal(result.version, 2);
  assert.equal(result.rows.length, 0);
});

test("normalize — valid layout passes through", () => {
  const input = v2([
    row("r-0", [col("c-0-0", [ref("concept", "a")]), col("c-0-1", [ref("concept", "b")])]),
  ]);
  const result = normalizeContentLayoutV2(input);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].columns.length, 2);
});

test("normalize — malformed row (missing id) removed", () => {
  const input = v2([
    { id: "", columns: [col("c-0-0", [ref("concept", "a")])] } as ContentLayoutRowV2,
    row("r-1", [col("c-1-0", [ref("concept", "b")])]),
  ]);
  const result = normalizeContentLayoutV2(input);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, "r-1");
});

test("normalize — malformed column (missing id) removed", () => {
  const input = v2([
    row("r-0", [
      { id: "", items: [ref("concept", "a")] } as ContentLayoutColumnV2,
      col("c-0-1", [ref("concept", "b")]),
    ]),
  ]);
  const result = normalizeContentLayoutV2(input);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].columns.length, 1);
  assert.equal(result.rows[0].columns[0].id, "c-0-1");
});

test("normalize — malformed ref removed", () => {
  const input = v2([
    row("r-0", [
      col("c-0-0", [{ type: "concept", id: "a" } as ContentLayoutItemRef, { type: "video", id: "x" } as unknown as ContentLayoutItemRef]),
    ]),
  ]);
  const result = normalizeContentLayoutV2(input);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].columns[0].items.length, 1);
  assert.deepEqual(result.rows[0].columns[0].items[0], ref("concept", "a"));
});

test("normalize — duplicate refs globally removed (keeps first)", () => {
  const input = v2([
    row("r-0", [
      col("c-0-0", [ref("concept", "a")]),
      col("c-0-1", [ref("concept", "a")]), // duplicate
    ]),
    row("r-1", [
      col("c-1-0", [ref("concept", "a")]), // duplicate
      col("c-1-1", [ref("concept", "b")]),
    ]),
  ]);
  const result = normalizeContentLayoutV2(input);

  // First occurrence kept, duplicates removed
  assert.equal(result.rows[0].columns.length, 1); // only a
  assert.equal(result.rows[1].columns.length, 1); // only b
  assert.deepEqual(result.rows[0].columns[0].items, [ref("concept", "a")]);
  assert.deepEqual(result.rows[1].columns[0].items, [ref("concept", "b")]);
});

test("normalize — empty column removed after ref cleanup", () => {
  const input = v2([
    row("r-0", [
      col("c-0-0", []), // empty
      col("c-0-1", [ref("concept", "a")]),
    ]),
  ]);
  const result = normalizeContentLayoutV2(input);

  assert.equal(result.rows[0].columns.length, 1);
  assert.equal(result.rows[0].columns[0].id, "c-0-1");
});

test("normalize — empty row removed after column cleanup", () => {
  const input = v2([
    row("r-0", []), // empty
    row("r-1", [col("c-1-0", [ref("concept", "a")])]),
  ]);
  const result = normalizeContentLayoutV2(input);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, "r-1");
});

test("normalize — >3 columns split preserving order", () => {
  const input = v2([
    row("r-0", [
      col("c-0-0", [ref("concept", "a")]),
      col("c-0-1", [ref("concept", "b")]),
      col("c-0-2", [ref("concept", "c")]),
      col("c-0-3", [ref("concept", "d")]),
    ]),
  ]);
  const result = normalizeContentLayoutV2(input);

  // Should split into 2 rows: [a,b,c] and [d]
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].columns.length, 3);
  assert.equal(result.rows[1].columns.length, 1);
  assert.deepEqual(result.rows[0].columns[0].items, [ref("concept", "a")]);
  assert.deepEqual(result.rows[0].columns[1].items, [ref("concept", "b")]);
  assert.deepEqual(result.rows[0].columns[2].items, [ref("concept", "c")]);
  assert.deepEqual(result.rows[1].columns[0].items, [ref("concept", "d")]);
});

test("normalize — multiple refs in a column reduced to first", () => {
  const input = v2([
    row("r-0", [
      col("c-0-0", [ref("concept", "a"), ref("concept", "b")]),
    ]),
  ]);
  const result = normalizeContentLayoutV2(input);

  assert.equal(result.rows[0].columns[0].items.length, 1);
  assert.deepEqual(result.rows[0].columns[0].items[0], ref("concept", "a"));
});

test("normalize — no mutation", () => {
  const input = v2([
    row("r-0", [col("c-0-0", [ref("concept", "a")])]),
  ]);
  const frozen = JSON.parse(JSON.stringify(input));
  normalizeContentLayoutV2(input);

  assert.deepEqual(input, frozen);
});

test("normalize — deterministic output", () => {
  const input = v2([
    row("r-0", [col("c-0-0", [ref("concept", "a")]), col("c-0-1", [ref("concept", "b")])]),
  ]);

  const result1 = normalizeContentLayoutV2(input);
  const result2 = normalizeContentLayoutV2(input);

  assert.deepEqual(result1, result2);
});

test("normalize — split row gets deterministic secondary ID", () => {
  const input = v2([
    row("r-0", [
      col("c-0-0", [ref("concept", "a")]),
      col("c-0-1", [ref("concept", "b")]),
      col("c-0-2", [ref("concept", "c")]),
      col("c-0-3", [ref("concept", "d")]),
      col("c-0-4", [ref("concept", "e")]),
    ]),
  ]);
  const result = normalizeContentLayoutV2(input);

  // [a,b,c] and [d,e]
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].columns.length, 3);
  assert.equal(result.rows[1].columns.length, 2);
  // Secondary row ID derived from primary
  assert.ok(result.rows[1].id.startsWith("r-0"));
});

test("normalize — valid max columns constant", () => {
  assert.equal(CONTENT_LAYOUT_V2_MAX_COLUMNS_PER_ROW, 3);
});

test("normalize — malformed row is null", () => {
  const input = { version: 2 as const, rows: [null] as unknown as ContentLayoutRowV2[] };
  const result = normalizeContentLayoutV2(input);
  assert.equal(result.rows.length, 0);
});

test("normalize — malformed column is null", () => {
  const input = v2([
    { id: "r-0", columns: [null] as unknown as ContentLayoutColumnV2[] },
  ]);
  const result = normalizeContentLayoutV2(input);
  assert.equal(result.rows.length, 0);
});

test("normalize — malformed ref is null", () => {
  const input = v2([
    row("r-0", [col("c-0-0", [null as unknown as ContentLayoutItemRef])]),
  ]);
  const result = normalizeContentLayoutV2(input);
  assert.equal(result.rows.length, 0);
});

test("normalize — mixed valid and invalid refs", () => {
  const input = v2([
    row("r-0", [
      col("c-0-0", [
        ref("concept", "a"),
        { type: "video", id: "x" } as unknown as ContentLayoutItemRef,
        null as unknown as ContentLayoutItemRef,
        ref("concept", "b"),
      ]),
    ]),
  ]);
  const result = normalizeContentLayoutV2(input);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].columns.length, 1);
  // Only first valid ref kept (multi-item not implemented)
  assert.deepEqual(result.rows[0].columns[0].items, [ref("concept", "a")]);
});

/* ================================================================== */
/*  Column ID repair — duplicate structural IDs preserve content       */
/* ================================================================== */

test("normalize — duplicate column IDs with different concepts preserve both", () => {
  // Row with two columns sharing id "c-0-2" but different business items
  const input = v2([
    row("r-0", [
      col("c-0-0", [ref("concept", "A")]),
      col("c-0-2", [ref("concept", "B")]),
      col("c-0-2", [ref("concept", "C")]),
    ]),
  ]);
  const result = normalizeContentLayoutV2(input);

  assert.equal(result.rows.length, 1, "should remain 1 row");
  assert.equal(result.rows[0].columns.length, 3, "all 3 columns must survive");

  // Verify all business items preserved
  const itemIds = result.rows[0].columns.flatMap((c) => c.items.map((i) => i.id));
  assert.deepEqual(itemIds, ["A", "B", "C"], "all business item IDs preserved");

  // Verify column IDs are now unique
  const colIds = result.rows[0].columns.map((c) => c.id);
  assert.equal(new Set(colIds).size, colIds.length, "column IDs must be unique");
  // First keeps original
  assert.equal(colIds[0], "c-0-0");
  assert.equal(colIds[1], "c-0-2", "first duplicate keeps original");
  assert.notEqual(colIds[2], "c-0-2", "second duplicate gets new ID");
});

test("normalize — three columns with duplicate structural IDs", () => {
  const input = v2([
    row("r-0", [
      col("c-0-2", [ref("concept", "X")]),
      col("c-0-2", [ref("concept", "Y")]),
      col("c-0-2", [ref("concept", "Z")]),
    ]),
  ]);
  const result = normalizeContentLayoutV2(input);

  assert.equal(result.rows[0].columns.length, 3, "all 3 columns survive");
  const itemIds = result.rows[0].columns.flatMap((c) => c.items.map((i) => i.id));
  assert.deepEqual(itemIds, ["X", "Y", "Z"]);
  const colIds = result.rows[0].columns.map((c) => c.id);
  assert.equal(new Set(colIds).size, 3, "all IDs unique");
});

test("normalize — mixed content types in duplicate-ID columns", () => {
  const input = v2([
    row("r-0", [
      col("c-0-2", [ref("concept", "A")]),
      col("c-0-2", [ref("image", "IMG1")]),
      col("c-0-2", [ref("table", "TBL1")]),
    ]),
  ]);
  const result = normalizeContentLayoutV2(input);

  assert.equal(result.rows[0].columns.length, 3);
  const refs = result.rows[0].columns.flatMap((c) => c.items);
  assert.deepEqual(refs, [
    ref("concept", "A"),
    ref("image", "IMG1"),
    ref("table", "TBL1"),
  ]);
});

test("normalize — determinism: same malformed input produces same output", () => {
  const input = v2([
    row("r-0", [
      col("c-0-0", [ref("concept", "A")]),
      col("c-0-0", [ref("concept", "B")]),
    ]),
  ]);
  const r1 = normalizeContentLayoutV2(input);
  const r2 = normalizeContentLayoutV2(input);

  assert.deepEqual(r1, r2, "normalization must be deterministic");
});

test("normalize — already valid unique IDs experience no churn", () => {
  const input = v2([
    row("r-0", [
      col("c-0-0", [ref("concept", "A")]),
      col("c-0-1", [ref("concept", "B")]),
      col("c-0-2", [ref("concept", "C")]),
    ]),
  ]);
  const result = normalizeContentLayoutV2(input);

  assert.equal(result.rows[0].columns.length, 3);
  assert.equal(result.rows[0].columns[0].id, "c-0-0");
  assert.equal(result.rows[0].columns[1].id, "c-0-1");
  assert.equal(result.rows[0].columns[2].id, "c-0-2");
});

test("normalize — global item ref deduplication still works", () => {
  // Same business item in two columns — item ref dedup keeps first
  const input = v2([
    row("r-0", [
      col("c-0-0", [ref("concept", "A")]),
      col("c-0-1", [ref("concept", "A")]),
    ]),
  ]);
  const result = normalizeContentLayoutV2(input);

  // Second column's item ref is deduplicated (same business item)
  // but column structure is preserved (column may be empty after ref removal → removed)
  const totalItems = result.rows[0].columns.flatMap((c) => c.items);
  assert.equal(totalItems.length, 1, "duplicate business ref kept once");
  assert.equal(totalItems[0].id, "A");
});
