import assert from "node:assert/strict";

/** Minimal expect() over node:assert for tests migrated from vitest. */
export function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected: unknown) {
      assert.deepStrictEqual(actual, expected);
    },
    toBeUndefined() {
      assert.strictEqual(actual, undefined);
    },
    toBeGreaterThanOrEqual(expected: number) {
      assert.ok((actual as number) >= expected, `${actual} >= ${expected}`);
    },
    toBeLessThanOrEqual(expected: number) {
      assert.ok((actual as number) <= expected, `${actual} <= ${expected}`);
    },
  };
}
