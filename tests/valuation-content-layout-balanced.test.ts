import assert from "node:assert/strict";
import test from "node:test";
import {
  computeBalancedRowSizes,
  balancedRowSpan,
} from "../src/features/valuations/services/content-layout-balanced";

/* ------------------------------------------------------------------ */
/*  computeBalancedRowSizes                                           */
/* ------------------------------------------------------------------ */

test("computeBalancedRowSizes — 0 items", () => {
  assert.deepEqual(computeBalancedRowSizes(0), []);
});

test("computeBalancedRowSizes — 1 item", () => {
  assert.deepEqual(computeBalancedRowSizes(1), [1]);
});

test("computeBalancedRowSizes — 2 items", () => {
  assert.deepEqual(computeBalancedRowSizes(2), [2]);
});

test("computeBalancedRowSizes — 3 items", () => {
  assert.deepEqual(computeBalancedRowSizes(3), [3]);
});

test("computeBalancedRowSizes — 4 items → 2+2 (not 3+1)", () => {
  assert.deepEqual(computeBalancedRowSizes(4), [2, 2]);
});

test("computeBalancedRowSizes — 5 items → 3+2", () => {
  assert.deepEqual(computeBalancedRowSizes(5), [3, 2]);
});

test("computeBalancedRowSizes — 6 items → 3+3", () => {
  assert.deepEqual(computeBalancedRowSizes(6), [3, 3]);
});

test("computeBalancedRowSizes — 7 items → 3+2+2 (not 3+3+1)", () => {
  assert.deepEqual(computeBalancedRowSizes(7), [3, 2, 2]);
});

test("computeBalancedRowSizes — 8 items → 3+3+2", () => {
  assert.deepEqual(computeBalancedRowSizes(8), [3, 3, 2]);
});

test("computeBalancedRowSizes — 9 items → 3+3+3", () => {
  assert.deepEqual(computeBalancedRowSizes(9), [3, 3, 3]);
});

test("computeBalancedRowSizes — 10 items → 3+3+2+2 (not 3+3+3+1)", () => {
  assert.deepEqual(computeBalancedRowSizes(10), [3, 3, 2, 2]);
});

test("computeBalancedRowSizes — 11 items → 3+3+3+2", () => {
  assert.deepEqual(computeBalancedRowSizes(11), [3, 3, 3, 2]);
});

test("computeBalancedRowSizes — 12 items → 3+3+3+3", () => {
  assert.deepEqual(computeBalancedRowSizes(12), [3, 3, 3, 3]);
});

test("computeBalancedRowSizes — preserve order (total matches input)", () => {
  for (let n = 0; n <= 15; n++) {
    const rows = computeBalancedRowSizes(n);
    const total = rows.reduce((a, b) => a + b, 0);
    assert.equal(total, n, `Total for ${n} items should equal ${n}`);
  }
});

test("computeBalancedRowSizes — max 3 per row", () => {
  for (let n = 0; n <= 20; n++) {
    const rows = computeBalancedRowSizes(n);
    for (const size of rows) {
      assert.ok(size <= 3, `Row size ${size} should be ≤ 3 (for ${n} items)`);
    }
  }
});

test("computeBalancedRowSizes — no single-item tail row", () => {
  for (let n = 0; n <= 20; n++) {
    const rows = computeBalancedRowSizes(n);
    if (rows.length >= 2) {
      assert.ok(
        rows[rows.length - 1] !== 1,
        `${n} items: last row should not be 1 (got ${rows})`,
      );
    }
  }
});

test("computeBalancedRowSizes — does not mutate input", () => {
  const input = 7;
  const result = computeBalancedRowSizes(input);
  assert.equal(input, 7, "Input unchanged");
  assert.ok(Array.isArray(result));
});

test("computeBalancedRowSizes — custom maxPerRow=4", () => {
  assert.deepEqual(computeBalancedRowSizes(4, 4), [4]);
  assert.deepEqual(computeBalancedRowSizes(8, 4), [4, 4]);
  assert.deepEqual(computeBalancedRowSizes(5, 4), [3, 2], "rebalances single-item tail");
});

/* ------------------------------------------------------------------ */
/*  balancedRowSpan                                                    */
/* ------------------------------------------------------------------ */

test("balancedRowSpan — 1 item → span 12", () => {
  assert.equal(balancedRowSpan(1), 12);
});

test("balancedRowSpan — 0 items → span 12 (fallback)", () => {
  assert.equal(balancedRowSpan(0), 12);
});

test("balancedRowSpan — 2 items → span 6", () => {
  assert.equal(balancedRowSpan(2), 6);
});

test("balancedRowSpan — 3 items → span 4", () => {
  assert.equal(balancedRowSpan(3), 4);
});

test("balancedRowSpan — all returned spans are valid", () => {
  const valid = new Set([4, 6, 12]);
  for (let n = 0; n <= 5; n++) {
    assert.ok(valid.has(balancedRowSpan(n)), `Span for ${n} items should be valid`);
  }
});
