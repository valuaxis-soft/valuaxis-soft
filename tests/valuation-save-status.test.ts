import assert from "node:assert/strict";
import { test } from "node:test";
import type { EditorSnapshot } from "../src/features/valuations/components/workspace/model/editor-history";
import { shouldAutosave, statusAfterSave } from "../src/features/valuations/components/workspace/model/save-status";

function snapshot(): EditorSnapshot {
  return { caratula: {} as EditorSnapshot["caratula"], meta: {} as EditorSnapshot["meta"], sections: [] };
}

test("a save with no edits in flight leaves the document saved", () => {
  const sent = snapshot();
  assert.equal(statusAfterSave(sent, sent), "saved");
  assert.equal(statusAfterSave(sent, null), "saved");
});

test("edits made while the save was in flight keep the document dirty", () => {
  const sent = snapshot();
  assert.equal(statusAfterSave(sent, { ...sent, sections: [] }), "dirty");
  assert.equal(statusAfterSave(sent, { ...sent, meta: {} as EditorSnapshot["meta"] }), "dirty");
});

test("autosave only runs for editable, persisted documents with pending changes", () => {
  const base = { saveStatus: "dirty", canEdit: true, valuationId: "1", sessionExpired: false };
  assert.equal(shouldAutosave(base), true);
  assert.equal(shouldAutosave({ ...base, saveStatus: "saved" }), false);
  assert.equal(shouldAutosave({ ...base, saveStatus: "saving" }), false);
  assert.equal(shouldAutosave({ ...base, saveStatus: "error" }), false);
  assert.equal(shouldAutosave({ ...base, canEdit: false }), false);
  assert.equal(shouldAutosave({ ...base, valuationId: null }), false);
  assert.equal(shouldAutosave({ ...base, sessionExpired: true }), false);
});
