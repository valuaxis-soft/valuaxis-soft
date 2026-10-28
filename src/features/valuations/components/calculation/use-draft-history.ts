import { useRef, type KeyboardEvent } from "react";

import { EDITOR_HISTORY_LIMIT, TEXT_EDIT_GROUP_MS } from "@/features/valuations/components/workspace/model/editor-history";

type Step<T> = { draft: T; cell: string | null };

/**
 * Undo and redo for the table of a calculation panel, which saves on its own
 * outside the document's history: Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) in its
 * fields go back and forth through its drafts, typing in one cell is one
 * step, as in the document, and the cell changed is brought into view and lit.
 */
export function useDraftHistory<T>({
  apply,
  cellElement,
}: {
  /** Shows the draft and saves it, as an edit would. */
  apply: (draft: T) => void;
  /** The field of a cell, to bring it into view after an undo. */
  cellElement: (cell: string) => HTMLElement | null;
}) {
  const past = useRef<Step<T>[]>([]);
  const future = useRef<Step<T>[]>([]);
  const last = useRef<{ cell: string | null; at: number }>({ cell: null, at: 0 });

  /** Call with the draft as it was before an edit; `cell` names the cell typed in, null for any other change. */
  const record = (before: T, cell: string | null) => {
    const now = Date.now();
    const grouped = cell !== null && last.current.cell === cell && now - last.current.at <= TEXT_EDIT_GROUP_MS;
    last.current = { cell, at: now };
    future.current = [];
    if (!grouped) past.current = [...past.current, { draft: before, cell }].slice(-EDITOR_HISTORY_LIMIT);
  };

  const reveal = (cell: string | null) => {
    if (!cell) return;
    window.requestAnimationFrame(() => {
      const element = cellElement(cell);
      if (!element) return;
      element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      element.animate?.(
        [
          { boxShadow: "0 0 0 2px rgb(245 158 11)", backgroundColor: "rgb(254 243 199 / 0.9)" },
          { boxShadow: "0 0 0 2px rgb(245 158 11 / 0)", backgroundColor: "rgb(254 243 199 / 0)" },
        ],
        { duration: 1600, easing: "ease-out" },
      );
    });
  };

  const step = (from: Step<T>[], to: Step<T>[], current: T) => {
    const target = from.at(-1);
    if (!target) return null;
    to.push({ draft: current, cell: target.cell });
    from.pop();
    last.current = { cell: null, at: 0 };
    apply(target.draft);
    reveal(target.cell);
    return target;
  };

  /** Handles Ctrl+Z / Ctrl+Y in the panel; the document's undo does not see them. */
  const onKeyDown = (event: KeyboardEvent, current: T) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const key = event.key.toLowerCase();
    const undo = key === "z" && !event.shiftKey;
    const redo = key === "y" || (key === "z" && event.shiftKey);
    if (!undo && !redo) return;
    const done = undo ? step(past.current, future.current, current) : step(future.current, past.current, current);
    // With nothing to undo here, the field keeps the browser's own undo.
    if (done) event.preventDefault();
  };

  /** Forgets the steps: the panel loaded another state from the server. */
  const reset = () => {
    past.current = [];
    future.current = [];
    last.current = { cell: null, at: 0 };
  };

  return { onKeyDown, record, reset };
}
