import assert from "node:assert/strict";
import test from "node:test";

import {
  externalPreviewWindowAction,
  type ExternalPreviewPayload,
} from "../src/features/valuations/components/workspace/external-preview-sync";

const payload = { letterhead: { name: "Valuadores" } } as ExternalPreviewPayload;

test("the preview window shows the editor's state, and waits for a current editor when the letterhead is missing", () => {
  assert.deepEqual(externalPreviewWindowAction({ type: "preview-state", payload }, "a"), { kind: "show", payload });
  assert.deepEqual(externalPreviewWindowAction({ type: "preview-state", payload: {} }, "a"), { kind: "ignore" }, "an editor of an older version");
  assert.deepEqual(externalPreviewWindowAction({ type: "main-ready" }, "a"), { kind: "request-state" }, "an editor reloaded or signed in again");
});

test("the editor tab going away closes its preview window unless an editor answers", () => {
  assert.deepEqual(externalPreviewWindowAction({ type: "main-closed" }, "a"), { kind: "close-unless-answered" });
});

test("a newer preview window of the valuation takes the place of the older one; its own announcement does nothing", () => {
  assert.deepEqual(externalPreviewWindowAction({ type: "preview-opened", windowId: "b" }, "a"), { kind: "close" });
  assert.deepEqual(externalPreviewWindowAction({ type: "preview-opened", windowId: "a" }, "a"), { kind: "ignore" });
  assert.deepEqual(externalPreviewWindowAction({ type: "preview-opened" }, "a"), { kind: "ignore" });
});

test("anything else on the channel is ignored", () => {
  for (const message of [null, "hola", 3, {}, { type: "preview-ready" }, { type: "otro" }]) {
    assert.deepEqual(externalPreviewWindowAction(message, "a"), { kind: "ignore" });
  }
});
