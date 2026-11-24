/**
 * What the undo of a market panel does with its list of comparables (V8.3,
 * 24 nov 2026: «borré uno de más y ya no regresa»). A comparable deleted in
 * the panel waits aside on the server with its factors, photos and what was
 * written in its rows of the dictamen; undoing brings it back at the place it
 * had, and redoing deletes it again. Only comparables deleted in this panel
 * come and go: one added since an earlier step of the history is never taken
 * out by an undo. Pure: tested without the server.
 */
export type ComparableListSteps = {
  /** Deleted in the panel and present in the state to go back to: they come back. */
  restore: string[];
  /** Brought back in the panel and absent from that state (a redo of a deletion): they go again. */
  remove: string[];
  /** The order to leave: that of the state, with the comparables added since after it, in their order. */
  order: string[];
};

export function comparableListSteps(currentIds: readonly string[], targetIds: readonly string[], deletedInPanel: ReadonlySet<string>): ComparableListSteps {
  const current = new Set(currentIds);
  const target = new Set(targetIds);
  const restore = targetIds.filter((id) => !current.has(id) && deletedInPanel.has(id));
  const remove = currentIds.filter((id) => !target.has(id) && deletedInPanel.has(id));
  const gone = new Set(remove);
  const kept = new Set([...currentIds.filter((id) => !gone.has(id)), ...restore]);
  const order = [...targetIds.filter((id) => kept.has(id)), ...currentIds.filter((id) => kept.has(id) && !target.has(id))];
  return { restore, remove, order };
}

/** Whether the steps change anything at all. */
export const changesList = (steps: ComparableListSteps) => steps.restore.length > 0 || steps.remove.length > 0;
