import assert from "node:assert/strict";
import test from "node:test";

import {
  PREVIEW_HEARTBEAT_MS,
  externalPreviewWindowAction,
  livePreviewWindows,
  previewDirectoryAction,
  previewWindowLabel,
  type ExternalPreviewPayload,
  type OpenPreviewDirectory,
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

/* ── Other preview windows open ─────────────────────────────────── */

test("each preview window lists the others open, of any valuation, never itself, until they go or stop answering", () => {
  const here = (windowId: string, folio: string, title = "") => ({ type: "preview-here", windowId, valuationId: `v-${windowId}`, folio, title });
  let directory: OpenPreviewDirectory = {};
  const receive = (message: unknown, now: number) => {
    const action = previewDirectoryAction(directory, message, "a", now);
    directory = action.directory;
    return action;
  };
  receive(here("b", "2026-014", "Casa Arandas"), 0);
  receive(here("c", "2026-002", "Bodega"), 0);
  assert.equal(receive(here("a", "2026-001"), 0).directory, directory, "its own announcement is not listed");
  assert.deepEqual(livePreviewWindows(directory, 1000).map((entry) => entry.windowId), ["c", "b"], "by folio");
  assert.deepEqual(livePreviewWindows(directory, 1000)[1], { windowId: "b", valuationId: "v-b", folio: "2026-014", title: "Casa Arandas" });

  // A window that stops answering drops off; one that keeps answering stays.
  receive(here("b", "2026-014", "Casa Arandas"), 3 * PREVIEW_HEARTBEAT_MS);
  assert.deepEqual(livePreviewWindows(directory, 3 * PREVIEW_HEARTBEAT_MS + 1).map((entry) => entry.windowId), ["b"]);
  receive({ type: "preview-gone", windowId: "b" }, 0);
  assert.deepEqual(Object.keys(directory), ["c"]);
});

test("a window answers a roll call and comes to the front only when it is the one asked for", () => {
  assert.deepEqual(previewDirectoryAction({}, { type: "preview-roll-call" }, "a", 0), { directory: {}, answer: true, focus: false });
  assert.equal(previewDirectoryAction({}, { type: "preview-focus", windowId: "a" }, "a", 0).focus, true);
  assert.equal(previewDirectoryAction({}, { type: "preview-focus", windowId: "b" }, "a", 0).focus, false);
  for (const message of [null, "hola", {}, { type: "preview-here" }, { type: "preview-gone", windowId: "z" }, { type: "preview-state" }]) {
    assert.deepEqual(previewDirectoryAction({}, message, "a", 0), { directory: {}, answer: false, focus: false });
  }
});

test("a preview window is listed by its folio and title", () => {
  assert.equal(previewWindowLabel({ folio: "2026-014", title: "Casa Arandas", valuationId: "x" }), "Folio 2026-014 · Casa Arandas");
  assert.equal(previewWindowLabel({ folio: " ", title: "", valuationId: "x" }), "Avalúo sin folio");
  assert.equal(previewWindowLabel({ folio: "", title: "Terreno", valuationId: null }), "Borrador · Terreno");
});
