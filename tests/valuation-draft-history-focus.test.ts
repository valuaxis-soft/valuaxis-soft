/**
 * Redo with the keyboard right after undo with the keyboard did nothing in
 * the calculation panels (Costos, Mercado): to apply the step the field lets
 * go of the focus, and the next Ctrl+Y no longer reached the panel. The field
 * takes the focus back once the step is applied.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { DraftHistory, focusBackAfterStep } from "../src/features/valuations/components/calculation/use-draft-history";

const fieldOf = (patch: { isConnected?: boolean; disabled?: boolean } = {}) => {
  const field = { isConnected: true, disabled: false, focused: 0, focus() { field.focused += 1; }, ...patch };
  return field;
};

test("after a step taken with the keyboard the field takes the focus back, so Ctrl+Y after Ctrl+Z reaches the panel", () => {
  const body = {};
  const field = fieldOf();
  assert.equal(focusBackAfterStep(field, { activeElement: body, body }), true);
  assert.equal(field.focused, 1);
  // Nothing focused at all (the field's cell was written again) counts as the page.
  assert.equal(focusBackAfterStep(field, { activeElement: null, body }), true);
});

test("the focus is not taken from where the appraiser put it, nor given to a field that is gone or read only", () => {
  const body = {};
  const elsewhere = fieldOf();
  assert.equal(focusBackAfterStep(elsewhere, { activeElement: {}, body }), false);
  assert.equal(elsewhere.focused, 0);
  assert.equal(focusBackAfterStep(fieldOf({ isConnected: false }), { activeElement: body, body }), false);
  assert.equal(focusBackAfterStep(fieldOf({ disabled: true }), { activeElement: body, body }), false);
});

test("the step redone is the one undone: the history keeps it for the key that follows", () => {
  const history = new DraftHistory<{ value: string }>();
  history.record({ value: "1" }, "cell", 0);
  const undone = history.undo({ value: "0.5" });
  assert.deepEqual(undone?.draft, { value: "1" });
  assert.equal(history.canRedo, true);
  assert.deepEqual(history.redo({ value: "1" })?.draft, { value: "0.5" });
});
