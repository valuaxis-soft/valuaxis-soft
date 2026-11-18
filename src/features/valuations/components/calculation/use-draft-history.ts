import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { EDITOR_HISTORY_LIMIT, TEXT_EDIT_GROUP_MS } from "@/features/valuations/components/workspace/model/editor-history";
import { revealInEditor } from "@/features/valuations/components/workspace/model/editor-focus-reveal";

type Step<T> = { draft: T; cell: string | null };

/**
 * The two stacks of a panel's undo: each step keeps the state before a
 * change; undoing puts back the step and keeps the state it leaves to redo
 * it. Typing in one cell within a moment is one step, as in the document.
 * Pure: `now` is passed, so it is tested without a clock.
 */
export class DraftHistory<T> {
  private past: Step<T>[] = [];
  private future: Step<T>[] = [];
  private last: { cell: string | null; at: number } = { cell: null, at: 0 };

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  get sizes() {
    return { past: this.past.length, future: this.future.length };
  }

  /** Call with the state as it was before a change; `cell` names the cell typed in, null for any other change. */
  record(before: T, cell: string | null, now: number) {
    const grouped = cell !== null && this.last.cell === cell && now - this.last.at <= TEXT_EDIT_GROUP_MS;
    this.last = { cell, at: now };
    this.future = [];
    if (!grouped) this.past = [...this.past, { draft: before, cell }].slice(-EDITOR_HISTORY_LIMIT);
  }

  /** The step to put back, with `current` kept to redo it; null with nothing to undo. */
  undo(current: T): Step<T> | null {
    return this.step(this.past, this.future, current);
  }

  redo(current: T): Step<T> | null {
    return this.step(this.future, this.past, current);
  }

  reset() {
    this.past = [];
    this.future = [];
    this.last = { cell: null, at: 0 };
  }

  private step(from: Step<T>[], to: Step<T>[], current: T) {
    const target = from.pop();
    if (!target) return null;
    to.push({ draft: current, cell: target.cell });
    this.last = { cell: null, at: 0 };
    return target;
  }
}

type TextField = HTMLInputElement | HTMLTextAreaElement;
const isTextField = (target: EventTarget | null): target is TextField =>
  target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit"].includes(target.type));

/**
 * Undo and redo for the table of a calculation panel, which saves on its own
 * outside the document's history: Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) in its
 * fields go back and forth through its states, and the cell changed is
 * brought into view and lit. While a field holds text typed and not sent
 * yet, Ctrl+Z is the field's own: it undoes the typing, not the panel's last
 * change (V7.2-15). `undo`, `redo`, `canUndo` and `canRedo` serve the
 * panel's own buttons.
 */
export function useDraftHistory<T>({
  apply,
  cellElement,
}: {
  /** Shows the state and saves it, as an edit would. */
  apply: (draft: T) => void;
  /** The field of a cell, to bring it into view after an undo. */
  cellElement: (cell: string) => HTMLElement | null;
}) {
  const stacks = useRef(new DraftHistory<T>());
  // How many steps each stack holds, as state, so the buttons that read them render again.
  const [counts, setCounts] = useState({ past: 0, future: 0 });
  const changed = () => setCounts(stacks.current.sizes);
  // The text each field had before the typing since it took the focus.
  const typedFrom = useRef(new WeakMap<TextField, string>());

  useEffect(() => {
    const onFocus = (event: FocusEvent) => {
      if (isTextField(event.target)) typedFrom.current.delete(event.target);
    };
    const onBeforeInput = (event: Event) => {
      const target = event.target;
      if (isTextField(target) && !typedFrom.current.has(target)) typedFrom.current.set(target, target.value);
    };
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("beforeinput", onBeforeInput, true);
    return () => {
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("beforeinput", onBeforeInput, true);
    };
  }, []);

  const record = (before: T, cell: string | null) => {
    stacks.current.record(before, cell, Date.now());
    changed();
  };

  const reveal = (cell: string | null) => {
    if (!cell) return;
    window.requestAnimationFrame(() => {
      const element = cellElement(cell);
      if (!element) return;
      revealInEditor(element, "nearest");
      element.animate?.(
        [
          { boxShadow: "0 0 0 2px rgb(245 158 11)", backgroundColor: "rgb(254 243 199 / 0.9)" },
          { boxShadow: "0 0 0 2px rgb(245 158 11 / 0)", backgroundColor: "rgb(254 243 199 / 0)" },
        ],
        { duration: 1600, easing: "ease-out" },
      );
    });
  };

  const go = (direction: "undo" | "redo", current: T) => {
    const target = direction === "undo" ? stacks.current.undo(current) : stacks.current.redo(current);
    if (!target) return null;
    changed();
    apply(target.draft);
    reveal(target.cell);
    return target;
  };

  const undo = (current: T) => go("undo", current);
  const redo = (current: T) => go("redo", current);

  /** Handles Ctrl+Z / Ctrl+Y in the panel; the document's undo does not see them. */
  const onKeyDown = (event: KeyboardEvent, current: T) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const key = event.key.toLowerCase();
    const isUndo = key === "z" && !event.shiftKey;
    const isRedo = key === "y" || (key === "z" && event.shiftKey);
    if (!isUndo && !isRedo) return;
    const field = isTextField(event.target) ? event.target : null;
    // Text typed and not sent yet: the field undoes its own typing first.
    if (field && typedFrom.current.has(field) && typedFrom.current.get(field) !== field.value) return;
    if (!(isUndo ? stacks.current.canUndo : stacks.current.canRedo)) return;
    // The field lets go first, as it was: once the step is applied it would send its old text back.
    field?.blur();
    event.preventDefault();
    event.stopPropagation();
    if (isUndo) undo(current);
    else redo(current);
  };

  /** Forgets the steps: the panel loaded another state from the server. */
  const reset = () => {
    stacks.current.reset();
    changed();
  };

  return { onKeyDown, record, reset, undo, redo, canUndo: counts.past > 0, canRedo: counts.future > 0 };
}
