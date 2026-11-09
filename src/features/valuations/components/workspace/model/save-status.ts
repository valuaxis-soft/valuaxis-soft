import { editorSnapshotEquals, type EditorSnapshot } from "./editor-history";

/** Wait after the last edit before saving automatically. */
export const AUTOSAVE_DELAY_MS = 15_000;

/**
 * Status once a save finished. Edits made while the request was in flight are
 * not in what was sent, so the document is still dirty.
 */
export function statusAfterSave(sent: EditorSnapshot, current: EditorSnapshot | null): "saved" | "dirty" {
  return current && !editorSnapshotEquals(sent, current) ? "dirty" : "saved";
}

/** Ctrl+S, or ⌘S on a Mac: save, as the "Guardar" button does. With Shift or Alt it is another shortcut. */
export function isSaveShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">) {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "s";
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
