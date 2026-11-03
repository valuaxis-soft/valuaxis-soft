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
  assert.equal(statusAfterSave(sent, { ...sent, sections: [{ id: "x" } as unknown as EditorSnapshot["sections"][number]] }), "dirty");
  assert.equal(statusAfterSave(sent, { ...sent, meta: { folio: "F-1" } as unknown as EditorSnapshot["meta"] }), "dirty");
});

test("a save rebuilt from the same content reads as saved", () => {
  // The snapshot sent is rebuilt when saving (the phone formatted, the header written): same content, other objects.
  const sent = snapshot();
  assert.equal(statusAfterSave(sent, { ...sent, sections: [] }), "saved");
  assert.equal(statusAfterSave(sent, { ...sent, meta: {} as EditorSnapshot["meta"] }), "saved");
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
