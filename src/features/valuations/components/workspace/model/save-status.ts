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

/**
 * The dictamen and the calculation memory are drawn from what is saved: with
 * changes pending, or a save still on its way (whose result is not known),
 * the editor saves first, and only opens the document once that worked (V5.7-21).
 */
export const mustSaveBeforeDocument = (input: { saving: boolean; hasUnsavedChanges: boolean }) => input.saving || input.hasUnsavedChanges;

/** «… Código: G-7KX3QF.» → "G-7KX3QF": the reference the server logged a failed save with, to copy it. */
export const errorCodeOf = (message: string) => /Código: (G-[A-Z0-9]{6})/.exec(message)?.[1] ?? null;
