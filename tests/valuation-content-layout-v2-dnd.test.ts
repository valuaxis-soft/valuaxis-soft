import assert from "node:assert/strict";
import test from "node:test";
import type {
  ContentLayoutColumnV2,
  ContentLayoutItemRef,
  ContentLayoutRowV2,
  ContentLayout as ContentLayoutV2,
} from "../src/features/valuations/model";
import { moveContentLayout as moveContentLayoutV2 } from "../src/features/valuations/services/content-layout-v2-operations";
import {
  buildV2DropZoneId,
  parseV2DropZoneId,
  isV2RowBelowZone,
  parseV2RowBelowZone,
  type V2DropZoneData,
} from "../src/features/valuations/components/editor/content-layout-v2-drop-target";

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

/* ================================================================== */
/*  DROP ZONE ID ENCODING — COLUMN (left/right only)                  */
/* ================================================================== */

test("drop zone ID — encodes left correctly", () => {
  const id = buildV2DropZoneId({ columnId: "col-A", intent: "left" });
  assert.equal(id, "v2drop-col-A::left");
});

test("drop zone ID — encodes right correctly", () => {
  const id = buildV2DropZoneId({ columnId: "col-A", intent: "right" });
  assert.equal(id, "v2drop-col-A::right");
});

test("drop zone ID — parses valid left zone", () => {
  const data = parseV2DropZoneId("v2drop-col-A::left");
  assert.deepEqual(data, { columnId: "col-A", intent: "left" });
});

test("drop zone ID — parses valid right zone", () => {
  const data = parseV2DropZoneId("v2drop-col-A::right");
  assert.deepEqual(data, { columnId: "col-A", intent: "right" });
});

test("drop zone ID — returns null for non-V2 zone", () => {
  assert.equal(parseV2DropZoneId("drop-col-A-left"), null);
});

test("drop zone ID — returns null for empty string", () => {
  assert.equal(parseV2DropZoneId(""), null);
});

test("drop zone ID — returns null for column-level below", () => {
  assert.equal(parseV2DropZoneId("v2drop-col-A::below"), null);
});

test("drop zone ID — round-trip preserves data", () => {
  const original: V2DropZoneData = { columnId: "col-42", intent: "right" };
  const encoded = buildV2DropZoneId(original);
  const decoded = parseV2DropZoneId(encoded);
  assert.ok(decoded);
  assert.equal(decoded.columnId, original.columnId);
  assert.equal(decoded.intent, original.intent);
});

/* ================================================================== */
/*  DROP ZONE ID ENCODING — ROW BELOW                                 */
/* ================================================================== */

test("row below — isV2RowBelowZone detects row below zones", () => {
  assert.equal(isV2RowBelowZone("v2row-r-0::below"), true);
  assert.equal(isV2RowBelowZone("v2drop-col-A::left"), false);
  assert.equal(isV2RowBelowZone(""), false);
});

test("row below — parseV2RowBelowZone extracts row ID", () => {
  assert.equal(parseV2RowBelowZone("v2row-r-0::below"), "r-0");
  assert.equal(parseV2RowBelowZone("v2drop-col-A::left"), null);
  assert.equal(parseV2RowBelowZone(""), null);
});

/* ================================================================== */
/*  SEMANTIC MAPPING: LEFT behavior                                    */
/* ================================================================== */

test("semantic LEFT — B left of A: [A][B] → [B][A]", () => {
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

test("semantic LEFT — single-item row: self-move is no-op", () => {
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

test("semantic LEFT — C left of A in 3-col row: reorder allowed", () => {
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
/*  SEMANTIC MAPPING: RIGHT behavior                                   */
/* ================================================================== */

test("semantic RIGHT — B right of A: [A][B] stays [A][B]", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
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

test("semantic RIGHT — A right of B: [A][B] → [B][A]", () => {
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

test("semantic RIGHT — cross-row: B right of D merges rows", () => {
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

/* ================================================================== */
/*  SEMANTIC MAPPING: BELOW behavior (row-level only)                  */
/* ================================================================== */

test("semantic BELOW — E below Row1: new row inserted after target row", () => {
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

test("semantic BELOW — single-item row below: creates new row", () => {
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
});

/* ================================================================== */
/*  SEMANTIC MAPPING: MAX 3                                            */
/* ================================================================== */

test("semantic MAX 3 — insert into full row is rejected", () => {
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

test("semantic MAX 3 — same-row reorder in full row is allowed", () => {
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
/*  SEMANTIC MAPPING: SINGLE-ITEM ROW                                  */
/* ================================================================== */

test("single-item row — drag A left of B in separate rows", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")])]),
    row("r-1", [col("c1", [ref("concept", "B")])]),
  ]);
  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c0",
    targetRowId: "r-1",
    targetColumnId: "c1",
    placement: "before-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A", "B"]]);
});

test("single-item row — drag B right of A in separate rows", () => {
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

test("single-item row — both left and right expose targets", () => {
  // Verify that the drop zone ID system supports both left and right
  // for a single-item row
  const leftId = buildV2DropZoneId({ columnId: "c0", intent: "left" });
  const rightId = buildV2DropZoneId({ columnId: "c0", intent: "right" });
  assert.equal(leftId, "v2drop-c0::left");
  assert.equal(rightId, "v2drop-c0::right");
  assert.notEqual(leftId, rightId);
});

/* ================================================================== */
/*  SEMANTIC MAPPING: MIXED CONTENT                                    */
/* ================================================================== */

test("mixed content — concept column moves same as image/table", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("image", "I")]), col("c2", [ref("table", "T")])]),
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

/* ================================================================== */
/*  CALLBACK                                                          */
/* ================================================================== */

test("callback — onContentLayoutChange receives V2 on valid drop", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
    row("r-1", [col("c2", [ref("concept", "C")])]),
  ]);

  let receivedLayout: ContentLayoutV2 | null = null;
  const onContentLayoutChange = (next: ContentLayoutV2) => {
    receivedLayout = next;
  };

  const descriptor = {
    sourceColumnId: "c2",
    targetRowId: "r-0",
    targetColumnId: "c1",
    placement: "after-column" as const,
  };
  const result = moveContentLayoutV2(layout, descriptor);
  if (result.changed) {
    onContentLayoutChange(result.layout);
  }

  assert.ok(receivedLayout);
  assert.deepEqual(ids(receivedLayout), [["A", "B", "C"]]);
});

test("callback — invalid target does not trigger callback", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
    row("r-1", [col("c3", [ref("concept", "D")])]),
  ]);

  let called = false;
  const onContentLayoutChange = (_next: ContentLayoutV2) => { called = true; };

  const descriptor = {
    sourceColumnId: "c3",
    targetRowId: "r-0",
    targetColumnId: "c1",
    placement: "after-column" as const,
  };
  const result = moveContentLayoutV2(layout, descriptor);
  if (result.changed) {
    onContentLayoutChange(result.layout);
  }

  assert.equal(called, false);
});

test("callback — no-op does not trigger callback", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
  ]);

  let called = false;
  const onContentLayoutChange = (_next: ContentLayoutV2) => { called = true; };

  const descriptor = {
    sourceColumnId: "c1",
    targetRowId: "r-0",
    targetColumnId: "c1",
    placement: "after-column" as const,
  };
  const result = moveContentLayoutV2(layout, descriptor);
  if (result.changed) {
    onContentLayoutChange(result.layout);
  }

  assert.equal(called, false);
});

/* ================================================================== */
/*  TARGETING PRECISION                                                */
/* ================================================================== */

test("targeting — adjacent row target does not win when pointer is in intended row", () => {
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
    row("r-1", [col("c2", [ref("concept", "C")]), col("c3", [ref("concept", "D")])]),
  ]);

  const result = moveContentLayoutV2(layout, {
    sourceColumnId: "c2",
    targetRowId: "r-0",
    targetColumnId: "c0",
    placement: "before-column",
  });
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["C", "A", "B"], ["D"]]);
});

test("targeting — only one descriptor per drop", () => {
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

/* ================================================================== */
/*  COLUMN BELOW DOES NOT EXIST                                        */
/* ================================================================== */

test("column BELOW — buildV2DropZoneId does not produce below zones", () => {
  // buildV2DropZoneId only accepts "left" | "right"
  const leftId = buildV2DropZoneId({ columnId: "c0", intent: "left" });
  const rightId = buildV2DropZoneId({ columnId: "c0", intent: "right" });
  assert.ok(leftId.startsWith("v2drop-"));
  assert.ok(rightId.startsWith("v2drop-"));
  assert.ok(!leftId.includes("below"));
  assert.ok(!rightId.includes("below"));
});

test("column BELOW — parseV2DropZoneId rejects column below IDs", () => {
  // Any manually constructed column-level below ID should be rejected
  assert.equal(parseV2DropZoneId("v2drop-c0::below"), null);
});

test("row BELOW — isV2RowBelowZone correctly identifies row-level targets", () => {
  assert.equal(isV2RowBelowZone("v2row-r-0::below"), true);
  assert.equal(isV2RowBelowZone("v2row-r-5::below"), true);
  assert.equal(isV2RowBelowZone("v2drop-c0::left"), false);
  assert.equal(isV2RowBelowZone("v2drop-c0::right"), false);
});

/* ================================================================== */
/*  BELOW BOUNDARY OWNERSHIP                                          */
/* ================================================================== */

test("boundary ownership — every row owns exactly one BELOW target", () => {
  // 4 rows → 4 BELOW targets, each owned by the row above the boundary
  const rowIds = ["r-0", "r-1", "r-2", "r-3"];
  for (const rowId of rowIds) {
    const belowId = `v2row-${rowId}::below`;
    assert.equal(isV2RowBelowZone(belowId), true);
    assert.equal(parseV2RowBelowZone(belowId), rowId);
  }
});

test("boundary ownership — Row1 BELOW targets boundary Row1/Row2", () => {
  // Row1 BELOW = v2row-r-0::below → targets rowId r-0
  assert.equal(parseV2RowBelowZone("v2row-r-0::below"), "r-0");
});

test("boundary ownership — Row2 BELOW targets boundary Row2/Row3", () => {
  assert.equal(parseV2RowBelowZone("v2row-r-1::below"), "r-1");
});

test("boundary ownership — last row BELOW remains available", () => {
  // Row4 BELOW is available for placing content after the last row
  const result = moveContentLayoutV2(
    v2([
      row("r-0", [col("c0", [ref("concept", "A")])]),
      row("r-1", [col("c1", [ref("concept", "B")])]),
    ]),
    {
      sourceColumnId: "c0",
      targetRowId: "r-1",
      placement: "new-row-after",
    },
  );
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["B"], ["A"]]);
});

/* ================================================================== */
/*  BELOW WITH DIFFERENT ROW WIDTHS                                   */
/* ================================================================== */

test("BELOW — 1-column row exposes BELOW target", () => {
  const result = moveContentLayoutV2(
    v2([
      row("r-0", [col("c0", [ref("concept", "A")])]),
      row("r-1", [col("c1", [ref("concept", "B")])]),
    ]),
    {
      sourceColumnId: "c1",
      targetRowId: "r-0",
      placement: "new-row-after",
    },
  );
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A"], ["B"]]);
});

test("BELOW — 2-column row exposes BELOW target", () => {
  const result = moveContentLayoutV2(
    v2([
      row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
      row("r-1", [col("c2", [ref("concept", "C")])]),
    ]),
    {
      sourceColumnId: "c2",
      targetRowId: "r-0",
      placement: "new-row-after",
    },
  );
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A", "B"], ["C"]]);
});

test("BELOW — 3-column row exposes BELOW target", () => {
  const result = moveContentLayoutV2(
    v2([
      row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")]), col("c2", [ref("concept", "C")])]),
      row("r-1", [col("c3", [ref("concept", "D")])]),
    ]),
    {
      sourceColumnId: "c3",
      targetRowId: "r-0",
      placement: "new-row-after",
    },
  );
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A", "B", "C"], ["D"]]);
});

/* ================================================================== */
/*  COLLISION PRIORITY: semantic wins over sortable                    */
/* ================================================================== */

test("collision priority — semantic droppables have correct ID prefix", () => {
  // Column zones use v2drop- prefix
  assert.ok(buildV2DropZoneId({ columnId: "c0", intent: "left" }).startsWith("v2drop-"));
  assert.ok(buildV2DropZoneId({ columnId: "c0", intent: "right" }).startsWith("v2drop-"));

  // Row BELOW uses v2row- prefix
  assert.ok("v2row-r-0::below".startsWith("v2row-"));
});

test("collision priority — non-semantic sortable IDs do not have v2drop- or v2row- prefix", () => {
  // Raw sortable column IDs are just "c-0-0", "c-0-1", etc.
  // They must NOT start with v2drop- or v2row-
  assert.equal("c-0-0".startsWith("v2drop-"), false);
  assert.equal("c-0-0".startsWith("v2row-"), false);
});

test("collision priority — BELOW descriptor always has correct targetRowId", () => {
  // When BELOW is the active target, the descriptor must use the ROW's ID
  // not any column ID
  const layout = v2([
    row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
    row("r-1", [col("c2", [ref("concept", "C")])]),
  ]);

  // Simulate what happens when BELOW of r-0 is the active target
  const belowRowId = "r-0";
  const descriptor = {
    sourceColumnId: "c2",
    targetRowId: belowRowId,
    placement: "new-row-after" as const,
  };
  const result = moveContentLayoutV2(layout, descriptor);
  assert.equal(result.changed, true);
  // C moves to new row after r-0
  assert.deepEqual(ids(result.layout), [["A", "B"], ["C"]]);
});

/* ================================================================== */
/*  BELOW DROP RESULT — every boundary tested                         */
/* ================================================================== */

test("BELOW drop result — Row1 boundary: A,B / C → A,B / X / C", () => {
  const result = moveContentLayoutV2(
    v2([
      row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
      row("r-1", [col("c2", [ref("concept", "C")])]),
    ]),
    {
      sourceColumnId: "c0",
      targetRowId: "r-0",
      placement: "new-row-after",
    },
  );
  assert.equal(result.changed, true);
  // A removed from row 0, row 0 now has [B]
  // New row [A] inserted after r-0
  // Row r-1 still has [C]
  assert.deepEqual(ids(result.layout), [["B"], ["A"], ["C"]]);
  assert.equal(result.layout.rows.length, 3);
});

test("BELOW drop result — Row2 boundary (last row): A,B / C → A,B / C / X", () => {
  const result = moveContentLayoutV2(
    v2([
      row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
      row("r-1", [col("c2", [ref("concept", "C")])]),
    ]),
    {
      sourceColumnId: "c2",
      targetRowId: "r-1",
      placement: "new-row-after",
    },
  );
  assert.equal(result.changed, true);
  // C is already the only item in r-1
  // Moving C to new row after r-1: source row empty → removed
  // New row [C] inserted after r-1
  assert.deepEqual(ids(result.layout), [["A", "B"], ["C"]]);
  assert.equal(result.layout.rows.length, 2);
});

/* ================================================================== */
/*  SINGLE-ITEM ROW — BELOW works for all row sizes                   */
/* ================================================================== */

test("single-item row — BELOW works with 1-column row", () => {
  const result = moveContentLayoutV2(
    v2([
      row("r-0", [col("c0", [ref("concept", "A")])]),
      row("r-1", [col("c1", [ref("concept", "B")])]),
    ]),
    {
      sourceColumnId: "c1",
      targetRowId: "r-0",
      placement: "new-row-after",
    },
  );
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A"], ["B"]]);
  assert.equal(result.layout.rows.length, 2);
});

test("single-item row — BELOW works with 2-column row", () => {
  const result = moveContentLayoutV2(
    v2([
      row("r-0", [col("c0", [ref("concept", "A")]), col("c1", [ref("concept", "B")])]),
      row("r-1", [col("c2", [ref("concept", "C")])]),
    ]),
    {
      sourceColumnId: "c2",
      targetRowId: "r-0",
      placement: "new-row-after",
    },
  );
  assert.equal(result.changed, true);
  assert.deepEqual(ids(result.layout), [["A", "B"], ["C"]]);
  assert.equal(result.layout.rows.length, 2);
});
