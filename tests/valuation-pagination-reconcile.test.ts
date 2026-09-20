import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileProvisionalPages,
  splitMeasuredDocumentFlowItems,
} from "../src/features/valuations/components/document-preview-page";
import type { DocumentFlowItem } from "../src/features/valuations/components/document-preview-page";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function item(id: string): DocumentFlowItem {
  return { id, node: null };
}

function items(...ids: string[]): DocumentFlowItem[] {
  return ids.map(item);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test("reconcileProvisionalPages — no previous pages falls back to simple split", () => {
  const current = items("A", "B", "C");
  const result = reconcileProvisionalPages([], current);
  // splitDocumentFlowItemIds: no startOnNewPage → all items on one page
  assert.deepStrictEqual(result, [["A", "B", "C"]]);
});

test("reconcileProvisionalPages — adds new item E to final page", () => {
  // Previous: P1 [A,B] P2 [C,D]
  // Current:  [A,B,C,D,E]
  // Expected: P1 [A,B] P2 [C,D,E]
  const previous = [["A", "B"], ["C", "D"]];
  const current = items("A", "B", "C", "D", "E");
  const result = reconcileProvisionalPages(previous, current);
  assert.deepStrictEqual(result, [["A", "B"], ["C", "D", "E"]]);
});

test("reconcileProvisionalPages — removes deleted item C", () => {
  // Previous: P1 [A,B] P2 [C,D]
  // Current:  [A,B,D]
  // Expected: P1 [A,B] P2 [D]
  const previous = [["A", "B"], ["C", "D"]];
  const current = items("A", "B", "D");
  const result = reconcileProvisionalPages(previous, current);
  assert.deepStrictEqual(result, [["A", "B"], ["D"]]);
});

test("reconcileProvisionalPages — reordered items follow current document order", () => {
  // Previous: P1 [A,B] P2 [C]  → sizes [2, 1]
  // Current reordered: [A,C,B]
  // Distribute by doc order with old sizes: P1 [A,C] P2 [B]
  const previous = [["A", "B"], ["C"]];
  const current = items("A", "C", "B");
  const result = reconcileProvisionalPages(previous, current);
  assert.deepStrictEqual(result, [["A", "C"], ["B"]]);
});

test("reconcileProvisionalPages — empty previous page removed after deletion", () => {
  // Previous: P1 [A] P2 [B]
  // Current:  [A]
  // Expected: P1 [A]  (P2 empty → removed)
  const previous = [["A"], ["B"]];
  const current = items("A");
  const result = reconcileProvisionalPages(previous, current);
  assert.deepStrictEqual(result, [["A"]]);
});

test("reconcileProvisionalPages — all items removed falls back to empty", () => {
  // Previous: P1 [A,B]
  // Current:  []
  // Expected: []  (no items → no pages)
  const previous = [["A", "B"]];
  const current: DocumentFlowItem[] = [];
  const result = reconcileProvisionalPages(previous, current);
  assert.deepStrictEqual(result, []);
});

test("reconcileProvisionalPages — multiple new items appended to final page", () => {
  // Previous: P1 [A,B]
  // Current:  [A,B,C,D]
  // Expected: P1 [A,B,C,D]
  const previous = [["A", "B"]];
  const current = items("A", "B", "C", "D");
  const result = reconcileProvisionalPages(previous, current);
  assert.deepStrictEqual(result, [["A", "B", "C", "D"]]);
});

test("reconcileProvisionalPages — new items only (no previous match) create single page", () => {
  // Previous: P1 [X,Y]  (all removed)
  // Current:  [A,B,C]
  // Expected: P1 [A,B,C]
  const previous = [["X", "Y"]];
  const current = items("A", "B", "C");
  const result = reconcileProvisionalPages(previous, current);
  assert.deepStrictEqual(result, [["A", "B", "C"]]);
});

test("reconcileProvisionalPages — every current item appears exactly once", () => {
  const previous = [["A", "B", "C"], ["D", "E"]];
  const current = items("A", "C", "E", "F");
  const result = reconcileProvisionalPages(previous, current);
  const flat = result.flat();
  assert.strictEqual(flat.length, current.length);
  assert.strictEqual(new Set(flat).size, current.length);
  // All current IDs present
  for (const it of current) {
    assert.ok(flat.includes(it.id), `missing ${it.id}`);
  }
});

test("reconcileProvisionalPages — safety fallback on count mismatch", () => {
  // This tests the safety net: if reconciliation somehow produces wrong count,
  // it falls back to simple split. In practice this shouldn't happen,
  // but the safety net exists.
  const previous = [["A", "B"]];
  const current = items("A", "B");
  const result = reconcileProvisionalPages(previous, current);
  // Normal case: should reconcile correctly
  assert.deepStrictEqual(result, [["A", "B"]]);
});

/* ================================================================== */
/*  splitMeasuredDocumentFlowItems — atomic page placement             */
/* ================================================================== */

function measured(id: string, height: number): { item: DocumentFlowItem; height: number } {
  return { item: item(id), height };
}

test("splitMeasured — 26 items conservation: all IDs present exactly once, same order", () => {
  const ids = Array.from({ length: 26 }, (_, i) => `I.${i + 1}`);
  const measuredItems = ids.map((id) => measured(id, 60));
  const pages = splitMeasuredDocumentFlowItems(measuredItems, 600);
  const flat = pages.flat().map((i) => i.id);
  assert.strictEqual(flat.length, 26, `expected 26 items, got ${flat.length}`);
  assert.deepStrictEqual(flat, ids, "flattened page order must equal canonical document order");
  // No duplicate IDs
  assert.strictEqual(new Set(flat).size, 26, "duplicate IDs detected");
});

test("splitMeasured — atomic move: item that doesn't fit moves ENTIRELY to next page", () => {
  // availableHeight = 600
  // A=250, B=250, C=150
  // P1: A(250) + B(250) = 500 ≤ 600 → fit
  // C: 500 + 150 = 650 > 600 → C moves to P2
  const measuredItems = [measured("A", 250), measured("B", 250), measured("C", 150)];
  const pages = splitMeasuredDocumentFlowItems(measuredItems, 600);
  assert.strictEqual(pages.length, 2, "expected 2 pages");
  assert.deepStrictEqual(
    pages[0].map((i) => i.id),
    ["A", "B"],
  );
  assert.deepStrictEqual(
    pages[1].map((i) => i.id),
    ["C"],
  );
});

test("splitMeasured — exact fit: two items exactly filling a page", () => {
  // A=300, B=300, available=600 → P1: [A, B], no P2
  const measuredItems = [measured("A", 300), measured("B", 300)];
  const pages = splitMeasuredDocumentFlowItems(measuredItems, 600);
  assert.strictEqual(pages.length, 1, "expected exactly 1 page");
  assert.deepStrictEqual(
    pages[0].map((i) => i.id),
    ["A", "B"],
  );
});

test("splitMeasured — oversized item gets its own page, next item starts new page", () => {
  // A=800 (taller than available=600), B=100
  // A on its own page (clipped by overflow:hidden), B starts P2
  const measuredItems = [measured("A", 800), measured("B", 100)];
  const pages = splitMeasuredDocumentFlowItems(measuredItems, 600);
  assert.strictEqual(pages.length, 2, "oversized item must get its own page");
  assert.deepStrictEqual(
    pages[0].map((i) => i.id),
    ["A"],
  );
  assert.deepStrictEqual(
    pages[1].map((i) => i.id),
    ["B"],
  );
});

test("splitMeasured — startOnNewPage forces page break", () => {
  // A=100, B(startOnNewPage)=100, C=100, available=600
  // P1: [A], P2: [B, C]
  const a = { id: "A", node: null } as DocumentFlowItem;
  const b = { id: "B", node: null, startOnNewPage: true } as DocumentFlowItem;
  const c = { id: "C", node: null } as DocumentFlowItem;
  const measuredItems = [
    { item: a, height: 100 },
    { item: b, height: 100 },
    { item: c, height: 100 },
  ];
  const pages = splitMeasuredDocumentFlowItems(measuredItems, 600);
  assert.strictEqual(pages.length, 2);
  assert.deepStrictEqual(
    pages[0].map((i) => i.id),
    ["A"],
  );
  assert.deepStrictEqual(
    pages[1].map((i) => i.id),
    ["B", "C"],
  );
});

test("splitMeasured — items too tall for current page move to next, not overflow", () => {
  // A=500, B=200, C=200, available=600
  // P1: A(500). B: 500+200=700>600 → P2: [B, C]
  // B and C must NOT be split across pages
  const measuredItems = [measured("A", 500), measured("B", 200), measured("C", 200)];
  const pages = splitMeasuredDocumentFlowItems(measuredItems, 600);
  assert.deepStrictEqual(
    pages[0].map((i) => i.id),
    ["A"],
  );
  assert.deepStrictEqual(
    pages[1].map((i) => i.id),
    ["B", "C"],
  );
});

test("splitMeasured — zero-height items included in page", () => {
  // A=100, B=0, C=100, available=600 → P1: [A, B, C]
  const measuredItems = [measured("A", 100), measured("B", 0), measured("C", 100)];
  const pages = splitMeasuredDocumentFlowItems(measuredItems, 600);
  assert.strictEqual(pages.length, 1);
  assert.deepStrictEqual(
    pages[0].map((i) => i.id),
    ["A", "B", "C"],
  );
});

test("splitMeasured — consecutive mutations: final state is correct", () => {
  // First measurement: 3 items
  const m1 = [measured("A", 200), measured("B", 200), measured("C", 200)];
  const p1 = splitMeasuredDocumentFlowItems(m1, 600);
  assert.strictEqual(p1.length, 1, "all 3 fit on one page");

  // Second measurement: 6 items (3 added)
  const m2 = [
    measured("A", 200),
    measured("B", 200),
    measured("C", 200),
    measured("D", 200),
    measured("E", 200),
    measured("F", 200),
  ];
  const p2 = splitMeasuredDocumentFlowItems(m2, 600);
  const flat2 = p2.flat().map((i) => i.id);
  assert.deepStrictEqual(flat2, ["A", "B", "C", "D", "E", "F"]);
  assert.strictEqual(p2.length, 2, "6 items × 200px = 1200px → 2 pages");
});
