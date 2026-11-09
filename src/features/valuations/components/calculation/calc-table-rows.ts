/**
 * The rows of a capture table the appraiser adds, duplicates, moves and
 * removes from its right-click menu (CalcTableContextMenu): the same edits
 * for every list of rows of the calculation panels.
 *
 * Pure: no React, no side effects.
 */

export type RowEdit = "insert-above" | "insert-below" | "duplicate" | "move-up" | "move-down" | "delete";

/** The rows after the edit on the row at `index`; an edit out of range, or one that would leave fewer than `minRows`, changes nothing. */
export function editRows<T>(rows: readonly T[], edit: RowEdit, index: number, blank: () => T, minRows = 0): T[] {
  if (index < 0 || index >= rows.length) return [...rows];
  const next = [...rows];
  switch (edit) {
    case "insert-above":
      next.splice(index, 0, blank());
      return next;
    case "insert-below":
      next.splice(index + 1, 0, blank());
      return next;
    case "duplicate":
      next.splice(index + 1, 0, structuredClone(rows[index]));
      return next;
    case "move-up":
      if (index === 0) return next;
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    case "move-down":
      if (index === rows.length - 1) return next;
      [next[index + 1], next[index]] = [next[index], next[index + 1]];
      return next;
    case "delete":
      if (rows.length <= minRows) return next;
      next.splice(index, 1);
      return next;
  }
}

/**
 * The row actions of the right-click menu of a table whose body rows are
 * `rows`: each edit hands the new rows to `commit`. Deleting is offered while
 * more than `minRows` rows are left.
 */
export function rowActionsOf<T>(rows: readonly T[], blank: () => T, commit: (rows: T[]) => void, minRows = 0) {
  const run = (edit: RowEdit) => (index: number) => commit(editRows(rows, edit, index, blank, minRows));
  return {
    count: rows.length,
    insertAbove: run("insert-above"),
    insertBelow: run("insert-below"),
    duplicate: run("duplicate"),
    moveUp: run("move-up"),
    moveDown: run("move-down"),
    ...(rows.length > minRows ? { delete: run("delete") } : {}),
  };
}
