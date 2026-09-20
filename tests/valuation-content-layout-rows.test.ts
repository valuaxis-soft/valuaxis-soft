import assert from "node:assert/strict";
import test from "node:test";
import type { ContentLayoutItem } from "../src/features/valuations/model";
import {
  deriveContentLayoutRows,
  deriveExplicitRows,
  deriveLayoutRows,
  hasExplicitRowBreaks,
} from "../src/features/valuations/services/content-layout-rows";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function item(type: "concept" | "image" | "table", id: string, span: 4 | 6 | 8 | 12): ContentLayoutItem {
  return { type, id, span };
}

/* ------------------------------------------------------------------ */
/*  Empty                                                             */
/* ------------------------------------------------------------------ */

test("deriveContentLayoutRows — empty input returns empty array", () => {
  assert.deepEqual(deriveContentLayoutRows([]), []);
});

/* ------------------------------------------------------------------ */
/*  Single item                                                       */
/* ------------------------------------------------------------------ */

test("deriveContentLayoutRows — [12] fits one row", () => {
  const items = [item("concept", "c1", 12)];
  const rows = deriveContentLayoutRows(items);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].items.length, 1);
  assert.equal(rows[0].usedSpan, 12);
  assert.equal(rows[0].items[0].id, "c1");
});

/* ------------------------------------------------------------------ */
/*  Two-item rows                                                     */
/* ------------------------------------------------------------------ */

test("deriveContentLayoutRows — [6,6] fits one row", () => {
  const items = [item("concept", "c1", 6), item("concept", "c2", 6)];
  const rows = deriveContentLayoutRows(items);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].items.length, 2);
  assert.equal(rows[0].usedSpan, 12);
});

test("deriveContentLayoutRows — [8,4] fits one row", () => {
  const items = [item("image", "i1", 8), item("concept", "c1", 4)];
  const rows = deriveContentLayoutRows(items);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].items.length, 2);
  assert.equal(rows[0].usedSpan, 12);
});

test("deriveContentLayoutRows — [8,8] splits into two rows", () => {
  const items = [item("image", "i1", 8), item("image", "i2", 8)];
  const rows = deriveContentLayoutRows(items);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].items.length, 1);
  assert.equal(rows[0].usedSpan, 8);
  assert.equal(rows[0].items[0].id, "i1");
  assert.equal(rows[1].items.length, 1);
  assert.equal(rows[1].usedSpan, 8);
  assert.equal(rows[1].items[0].id, "i2");
});

/* ------------------------------------------------------------------ */
/*  Three-item rows                                                   */
/* ------------------------------------------------------------------ */

test("deriveContentLayoutRows — [4,4,4] fits one row", () => {
  const items = [item("concept", "c1", 4), item("concept", "c2", 4), item("concept", "c3", 4)];
  const rows = deriveContentLayoutRows(items);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].items.length, 3);
  assert.equal(rows[0].usedSpan, 12);
});

/* ------------------------------------------------------------------ */
/*  Overflow to next row                                              */
/* ------------------------------------------------------------------ */

test("deriveContentLayoutRows — [4,4,4,4] splits: row1=[4,4,4], row2=[4]", () => {
  const items = [
    item("concept", "c1", 4),
    item("concept", "c2", 4),
    item("concept", "c3", 4),
    item("concept", "c4", 4),
  ];
  const rows = deriveContentLayoutRows(items);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].items.length, 3);
  assert.equal(rows[0].usedSpan, 12);
  assert.equal(rows[1].items.length, 1);
  assert.equal(rows[1].usedSpan, 4);
  assert.equal(rows[1].items[0].id, "c4");
});

test("deriveContentLayoutRows — [6,4,4] splits: row1=[6,4], row2=[4]", () => {
  const items = [
    item("concept", "c1", 6),
    item("concept", "c2", 4),
    item("concept", "c3", 4),
  ];
  const rows = deriveContentLayoutRows(items);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].items.length, 2);
  assert.equal(rows[0].usedSpan, 10);
  assert.equal(rows[0].items[0].id, "c1");
  assert.equal(rows[0].items[1].id, "c2");
  assert.equal(rows[1].items.length, 1);
  assert.equal(rows[1].usedSpan, 4);
  assert.equal(rows[1].items[0].id, "c3");
});

test("deriveContentLayoutRows — [4,8,4] splits: row1=[4,8], row2=[4]", () => {
  const items = [
    item("concept", "c1", 4),
    item("image", "i1", 8),
    item("concept", "c2", 4),
  ];
  const rows = deriveContentLayoutRows(items);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].items.length, 2);
  assert.equal(rows[0].usedSpan, 12);
  assert.equal(rows[0].items[0].id, "c1");
  assert.equal(rows[0].items[1].id, "i1");
  assert.equal(rows[1].items.length, 1);
  assert.equal(rows[1].usedSpan, 4);
  assert.equal(rows[1].items[0].id, "c2");
});

/* ------------------------------------------------------------------ */
/*  3-item limit enforced even when span fits                         */
/* ------------------------------------------------------------------ */

test("deriveContentLayoutRows — three 4-span items fill row even though 4th could fit span-wise", () => {
  const items = [
    item("concept", "c1", 4),
    item("concept", "c2", 4),
    item("concept", "c3", 4),
    item("concept", "c4", 4),
  ];
  const rows = deriveContentLayoutRows(items);

  // Row 1: c1(4) + c2(4) + c3(4) = 12 — full by count AND span
  // Row 2: c4(4)
  assert.equal(rows.length, 2);
  assert.equal(rows[0].items.length, 3);
  assert.equal(rows[1].items.length, 1);
});

/* ------------------------------------------------------------------ */
/*  Order preservation                                                */
/* ------------------------------------------------------------------ */

test("deriveContentLayoutRows — item order is preserved across row splits", () => {
  const items = [
    item("concept", "c1", 6),
    item("table", "t1", 12),
    item("image", "i1", 8),
    item("concept", "c2", 6),
    item("concept", "c3", 4),
  ];
  const rows = deriveContentLayoutRows(items);

  // Row 1: c1(6) → t1 would be 6+12=18 → new row
  // Row 2: t1(12) → i1 would be 12+8=20 → new row
  // Row 3: i1(8) → c2 would be 8+6=14 → new row
  // Row 4: c2(6) → c3 would be 6+4=10 ≤ 12, count=2 < 3 → same row
  // Row 4: c2(6) + c3(4) = 10
  assert.equal(rows.length, 4);
  assert.equal(rows[0].items[0].id, "c1");
  assert.equal(rows[1].items[0].id, "t1");
  assert.equal(rows[2].items[0].id, "i1");
  assert.equal(rows[3].items[0].id, "c2");
  assert.equal(rows[3].items[1].id, "c3");
});

/* ------------------------------------------------------------------ */
/*  No mutation                                                       */
/* ------------------------------------------------------------------ */

test("deriveContentLayoutRows — does not mutate the input array", () => {
  const items = [
    item("concept", "c1", 6),
    item("concept", "c2", 6),
  ];
  const itemsCopy = items.map((i) => ({ ...i }));

  deriveContentLayoutRows(items);

  assert.deepEqual(items, itemsCopy);
});

/* ------------------------------------------------------------------ */
/*  Edge: single item that doesn't fill the grid                      */
/* ------------------------------------------------------------------ */

test("deriveContentLayoutRows — [4] creates one row with usedSpan 4", () => {
  const rows = deriveContentLayoutRows([item("concept", "c1", 4)]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].items.length, 1);
  assert.equal(rows[0].usedSpan, 4);
});

/* ------------------------------------------------------------------ */
/*  Edge: complex realistic sequence                                   */
/* ------------------------------------------------------------------ */

test("deriveContentLayoutRows — realistic mixed sequence", () => {
  const items = [
    item("concept", "c1", 6),   // row 1: 6
    item("concept", "c2", 6),   // row 1: 6+6=12 → full
    item("table", "t1", 12),    // row 2: 12 → full
    item("image", "i1", 8),     // row 3: 8
    item("concept", "c3", 4),   // row 3: 8+4=12 → full
    item("concept", "c4", 6),   // row 4: 6
    item("concept", "c5", 6),   // row 4: 6+6=12 → full
    item("image", "i2", 8),     // row 5: 8
    item("concept", "c6", 4),   // row 5: 8+4=12 → full
    item("concept", "c7", 4),   // row 6: 4
    item("concept", "c8", 4),   // row 6: 4+4=8
    item("concept", "c9", 4),   // row 6: 8+4=12 → full
  ];
  const rows = deriveContentLayoutRows(items);

  assert.equal(rows.length, 6);
  assert.equal(rows[0].usedSpan, 12); // c1+c2
  assert.equal(rows[1].usedSpan, 12); // t1
  assert.equal(rows[2].usedSpan, 12); // i1+c3
  assert.equal(rows[3].usedSpan, 12); // c4+c5
  assert.equal(rows[4].usedSpan, 12); // i2+c6
  assert.equal(rows[5].usedSpan, 12); // c7+c8+c9
});

/* ================================================================== */
/*  Explicit row breaks                                                */
/* ================================================================== */

test("hasExplicitRowBreaks — false when no items have rowBreakBefore", () => {
  const items = [item("concept", "c1", 6), item("concept", "c2", 6)];
  assert.equal(hasExplicitRowBreaks(items), false);
});

test("hasExplicitRowBreaks — true when at least one item has rowBreakBefore", () => {
  const items: ContentLayoutItem[] = [
    item("concept", "c1", 6),
    { type: "concept", id: "c2", span: 6, rowBreakBefore: true },
  ];
  assert.equal(hasExplicitRowBreaks(items), true);
});

test("deriveExplicitRows — no breaks returns empty (caller uses legacy)", () => {
  const items = [item("concept", "c1", 6), item("concept", "c2", 6)];
  assert.equal(deriveExplicitRows(items).length, 0);
});

test("deriveExplicitRows — single item with break produces one row of 1", () => {
  const items: ContentLayoutItem[] = [
    { type: "concept", id: "c1", span: 6, rowBreakBefore: true },
  ];
  const rows = deriveExplicitRows(items);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].items.length, 1);
  assert.equal(rows[0].items[0].id, "c1");
});

test("deriveExplicitRows — [A,B,C,D with D.break] → [A,B,C] [D]", () => {
  const items: ContentLayoutItem[] = [
    item("concept", "c1", 6),
    item("concept", "c2", 6),
    item("concept", "c3", 6),
    { type: "concept", id: "c4", span: 6, rowBreakBefore: true },
  ];
  const rows = deriveExplicitRows(items);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].items.map((i) => i.id), ["c1", "c2", "c3"]);
  assert.deepEqual(rows[1].items.map((i) => i.id), ["c4"]);
});

test("deriveExplicitRows — [A,B with B.break,C,D] → [A] [B,C,D]", () => {
  const items: ContentLayoutItem[] = [
    item("concept", "c1", 6),
    { type: "concept", id: "c2", span: 6, rowBreakBefore: true },
    item("concept", "c3", 6),
    item("concept", "c4", 6),
  ];
  const rows = deriveExplicitRows(items);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].items.map((i) => i.id), ["c1"]);
  assert.deepEqual(rows[1].items.map((i) => i.id), ["c2", "c3", "c4"]);
});

test("deriveExplicitRows — [A,B,C with C.break,D with D.break,E] → [A,B] [C] [D,E]", () => {
  const items: ContentLayoutItem[] = [
    item("concept", "c1", 6),
    item("concept", "c2", 6),
    { type: "concept", id: "c3", span: 6, rowBreakBefore: true },
    { type: "concept", id: "c4", span: 6, rowBreakBefore: true },
    item("concept", "c5", 6),
  ];
  const rows = deriveExplicitRows(items);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].items.map((i) => i.id), ["c1", "c2"]);
  assert.deepEqual(rows[1].items.map((i) => i.id), ["c3"]);
  assert.deepEqual(rows[2].items.map((i) => i.id), ["c4", "c5"]);
});

test("deriveExplicitRows — first item break ignored", () => {
  const items: ContentLayoutItem[] = [
    { type: "concept", id: "c1", span: 6, rowBreakBefore: true },
    item("concept", "c2", 6),
    item("concept", "c3", 6),
  ];
  const rows = deriveExplicitRows(items);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].items.map((i) => i.id), ["c1", "c2", "c3"]);
});

test("deriveExplicitRows — segment exceeding 3 splits safely", () => {
  const items: ContentLayoutItem[] = [
    item("concept", "c1", 4),
    { type: "concept", id: "c2", span: 4, rowBreakBefore: true },
    item("concept", "c3", 4),
    item("concept", "c4", 4),
    item("concept", "c5", 4),
  ];
  // Segment after break: [c2,c3,c4,c5] → 4 items, split at max 3
  const rows = deriveExplicitRows(items);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].items.length, 1); // [c1]
  assert.equal(rows[1].items.length, 3); // [c2,c3,c4]
  assert.equal(rows[2].items.length, 1); // [c5]
});

test("deriveExplicitRows — 5 items with breaks at 2 and 4", () => {
  const items: ContentLayoutItem[] = [
    item("concept", "c1", 4),
    { type: "concept", id: "c2", span: 4, rowBreakBefore: true },
    item("concept", "c3", 4),
    { type: "concept", id: "c4", span: 4, rowBreakBefore: true },
    item("concept", "c5", 4),
  ];
  // [c1] [c2,c3] [c4,c5]
  const rows = deriveExplicitRows(items);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].items.map((i) => i.id), ["c1"]);
  assert.deepEqual(rows[1].items.map((i) => i.id), ["c2", "c3"]);
  assert.deepEqual(rows[2].items.map((i) => i.id), ["c4", "c5"]);
});

test("deriveExplicitRows — mixed concept/image/table", () => {
  const items: ContentLayoutItem[] = [
    item("concept", "c1", 6),
    item("image", "i1", 8),
    { type: "table", id: "t1", span: 12, rowBreakBefore: true },
    item("concept", "c2", 6),
  ];
  const rows = deriveExplicitRows(items);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].items[0].type, "concept");
  assert.equal(rows[0].items[1].type, "image");
  assert.equal(rows[1].items[0].type, "table");
  assert.equal(rows[1].items[1].type, "concept");
});

test("deriveExplicitRows — order preserved", () => {
  const items: ContentLayoutItem[] = [
    item("concept", "c1", 4),
    { type: "image", id: "i1", span: 8, rowBreakBefore: true },
    item("concept", "c2", 4),
    { type: "table", id: "t1", span: 12, rowBreakBefore: true },
    item("concept", "c3", 4),
  ];
  // Segments: [c1] [i1,c2] [t1,c3]
  const rows = deriveExplicitRows(items);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].items[0].id, "c1");
  assert.equal(rows[1].items[0].id, "i1");
  assert.equal(rows[1].items[1].id, "c2");
  assert.equal(rows[2].items[0].id, "t1");
  assert.equal(rows[2].items[1].id, "c3");
});

test("deriveExplicitRows — does not mutate input", () => {
  const items: ContentLayoutItem[] = [
    item("concept", "c1", 6),
    { type: "concept", id: "c2", span: 6, rowBreakBefore: true },
  ];
  const itemsCopy = items.map((i) => ({ ...i }));

  deriveExplicitRows(items);

  assert.deepEqual(items, itemsCopy);
});

test("deriveExplicitRows — each row has correct span property", () => {
  const items: ContentLayoutItem[] = [
    item("concept", "c1", 6),
    { type: "concept", id: "c2", span: 6, rowBreakBefore: true },
    item("concept", "c3", 6),
  ];
  const rows = deriveExplicitRows(items);
  // Row 1: 1 item → span 12
  // Row 2: 2 items → span 6
  assert.equal(rows[0].span, 12);
  assert.equal(rows[1].span, 6);
});

/* ================================================================== */
/*  deriveLayoutRows (unified dispatcher)                              */
/* ================================================================== */

test("deriveLayoutRows — no breaks uses legacy balanced fallback", () => {
  const items = [
    item("concept", "c1", 4),
    item("concept", "c2", 4),
    item("concept", "c3", 4),
  ];
  const rows = deriveLayoutRows(items);
  // Legacy balanced: 3 items (4+4+4=12 fits) → one row of 3
  assert.equal(rows.length, 1);
  assert.equal(rows[0].items.length, 3);
});

test("deriveLayoutRows — explicit breaks override legacy", () => {
  const items: ContentLayoutItem[] = [
    item("concept", "c1", 6),
    { type: "concept", id: "c2", span: 6, rowBreakBefore: true },
    item("concept", "c3", 6),
  ];
  const rows = deriveLayoutRows(items);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].items.map((i) => i.id), ["c1"]);
  assert.deepEqual(rows[1].items.map((i) => i.id), ["c2", "c3"]);
});

test("deriveLayoutRows — empty returns empty", () => {
  assert.deepEqual(deriveLayoutRows([]), []);
});

test("deriveLayoutRows — single item no break", () => {
  const rows = deriveLayoutRows([item("concept", "c1", 6)]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].items.length, 1);
});

test("deriveLayoutRows — does not mutate input", () => {
  const items: ContentLayoutItem[] = [
    item("concept", "c1", 6),
    { type: "concept", id: "c2", span: 6, rowBreakBefore: true },
  ];
  const itemsCopy = items.map((i) => ({ ...i }));

  deriveLayoutRows(items);

  assert.deepEqual(items, itemsCopy);
});
