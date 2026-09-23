import { editorSnapshotChanged, type EditorSnapshot } from "./editor-history";

/** Wait after the last edit before saving automatically. */
export const AUTOSAVE_DELAY_MS = 15_000;

/**
 * Status once a save finished. Edits made while the request was in flight are
 * not in what was sent, so the document is still dirty.
 */
export function statusAfterSave(sent: EditorSnapshot, current: EditorSnapshot | null): "saved" | "dirty" {
  return current && editorSnapshotChanged(sent, current) ? "dirty" : "saved";
}

/** Autosave only runs for editable, persisted valuations with pending changes. */
export function shouldAutosave(input: {
  saveStatus: string;
  canEdit: boolean;
  valuationId: string | null;
  sessionExpired: boolean;
}) {
  return input.saveStatus === "dirty" && input.canEdit && Boolean(input.valuationId) && !input.sessionExpired;
}
