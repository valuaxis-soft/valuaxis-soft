"use client";

/**
 * Selecting cells in any table of the editor, as in Excel (video 5.7): click
 * and drag for a range, Shift+click to reach a cell, Ctrl/⌘+click to add or
 * take out one, Ctrl/⌘+A for the whole table and its title, Escape to let
 * go. On the selection Ctrl/⌘+C copies (as text separated by tabs, the way
 * Excel reads it), Ctrl/⌘+V pastes (also what was copied in Excel), Ctrl/⌘+X
 * cuts and Supr clears. The table says what each cell holds and how it
 * writes; the hook only knows rows and columns.
 *
 * Used by the configurable tables, the tables the calculation writes and the
 * capture tables of the panels (`CalcTableContextMenu`), so all select alike.
 */
import { useCallback, useEffect, useEffectEvent, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from "react";

import {
  EMPTY_SELECTION,
  activePoint,
  clampSelection,
  hasSelection,
  isCellSelected,
  isTabularText,
  parseTabularText,
  pastePlan,
  selectAll,
  selectColumn,
  selectPoint,
  selectRow,
  selectTitle,
  selectionGrid,
  selectionPoints,
  toTabularText,
  type GridPoint,
  type GridSelection,
  type GridShape,
  type SelectMode,
} from "../../services/cell-selection";

/** What a click on the grid is: a cell, the title, or nothing of the selection. */
export type GridTarget = GridPoint | "title" | null;

/** Cells name their place with `data-grid-row` and `data-grid-col`; the title with `data-grid-title`. */
export function locateByData(element: Element): GridTarget {
  if (element.closest("[data-grid-title]")) return "title";
  const cell = element.closest<HTMLElement>("[data-grid-row][data-grid-col]");
  if (!cell) return null;
  const row = Number(cell.dataset.gridRow);
  const col = Number(cell.dataset.gridCol);
  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null;
}

export const modeOf = (event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): SelectMode =>
  event.shiftKey ? "extend" : event.ctrlKey || event.metaKey ? "add" : "replace";

/** What a mousedown in the grid leaves to its own handler: the drag handles and buttons. */
const IGNORED = "button, [data-column-grip], [data-row-grip], [data-grid-ignore]";

/** Where a click outside the grid keeps its selection: the menus, dialogs and notices that act on it. */
const KEEPS_SELECTION = "[role='menu'], [role='menuitem'], [role='dialog'], [role='alertdialog'], [role='listbox'], [data-sonner-toaster], [data-cell-selection]";

/** A field with text of its own selected keeps the browser's copy, cut and paste. */
const editingText = (element: Element | null) =>
  (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && !element.readOnly && element.selectionStart !== element.selectionEnd;

const isField = (element: Element | null): element is HTMLInputElement | HTMLTextAreaElement =>
  element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;

export type CellSelectionOptions = {
  containerRef: RefObject<HTMLElement | null>;
  /** The rows, columns and header of the grid as it is now. */
  shape: GridShape;
  /** While a formula takes the clicks (an operation, a reference), the selection waits. */
  paused?: boolean;
  /** Whether the grid has a title to select. */
  withTitle?: boolean;
  locate?: (element: Element) => GridTarget;
  /** The text of a cell, for Ctrl/⌘+C; the header row is -1, the title is asked as null. */
  readCell: (point: GridPoint | null) => string;
  /** What is pasted, cell by cell; the table writes only where it takes typing and says what it left. */
  onPaste?: (plan: Array<{ point: GridPoint; text: string }>) => void;
  /** Supr or Ctrl/⌘+X on the selection: the cells to empty. */
  onClear?: (points: GridPoint[]) => void;
};

export function useCellSelection({ containerRef, shape, paused = false, withTitle = false, locate = locateByData, readCell, onPaste, onClear }: CellSelectionOptions) {
  const [rawSelection, setSelection] = useState<GridSelection>(EMPTY_SELECTION);
  // Rows or columns deleted leave the selection inside the grid.
  const selection = clampSelection(rawSelection, shape);
  const drag = useRef<{ start: GridPoint; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const points = selectionPoints(selection, shape);
  const count = points.length + (selection.title ? 1 : 0);

  const clear = useCallback(() => setSelection(EMPTY_SELECTION), []);

  /** The grid keeps the keys while several cells are selected: the field being written lets go. */
  const takeFocus = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.activeElement instanceof HTMLElement && container.contains(document.activeElement) && document.activeElement !== container) document.activeElement.blur();
    container.focus({ preventScroll: true });
  }, [containerRef]);

  const onMouseDown = (event: MouseEvent) => {
    if (paused || event.defaultPrevented) return;
    // The handles that drag a column or a row, and the buttons of a header, are not cells.
    if ((event.target as Element).closest(IGNORED)) return;
    const target = locate(event.target as Element);
    if (!target) return;
    const mode = modeOf(event);
    if (target === "title") {
      if (!withTitle) return;
      if (mode !== "replace") {
        event.preventDefault();
        takeFocus();
      }
      setSelection((current) => selectTitle(clampSelection(current, shape), mode));
      return;
    }
    // A right click keeps the selection it falls in, so its menu acts on all of it.
    if (event.button === 2) {
      if (!isCellSelected(selection, target)) setSelection(selectPoint(selection, target, "replace"));
      return;
    }
    if (event.button !== 0) return;
    if (mode !== "replace") {
      // Shift or Ctrl/⌘: the click selects; it does not enter the cell.
      event.preventDefault();
      takeFocus();
      setSelection((current) => selectPoint(clampSelection(current, shape), target, mode));
      return;
    }
    setSelection(selectPoint(selection, target, "replace"));
    drag.current = { start: target, moved: false };
    setDragging(true);
  };

  const onMouseOver = (event: MouseEvent) => {
    const current = drag.current;
    if (!current || paused) return;
    if ((event.buttons & 1) === 0) {
      drag.current = null;
      setDragging(false);
      return;
    }
    const target = locate(event.target as Element);
    if (!target || target === "title") return;
    if (!current.moved && target.row === current.start.row && target.col === current.start.col) return;
    if (!current.moved) {
      current.moved = true;
      // Dragging over cells selects them; it does not select the text of the first one.
      window.getSelection()?.removeAllRanges();
      takeFocus();
    }
    setSelection((selected) => selectPoint(selected, target, "extend"));
  };

  useEffect(() => {
    if (!dragging) return;
    const stop = () => {
      drag.current = null;
      setDragging(false);
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, [dragging]);

  /** Column letters and row numbers select all of them. */
  const onColumnPointer = (col: number, event: MouseEvent) => {
    if (paused || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    takeFocus();
    setSelection((current) => selectColumn(clampSelection(current, shape), shape, col, modeOf(event)));
  };
  const onRowPointer = (row: number, event: MouseEvent) => {
    if (paused || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    takeFocus();
    setSelection((current) => selectRow(clampSelection(current, shape), shape, row, modeOf(event)));
  };

  const copyText = () => {
    const grid = selectionGrid(selection, shape, (point) => readCell(point));
    const lines = selection.title ? [[readCell(null)], ...grid] : grid;
    return toTabularText(lines);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (paused || event.defaultPrevented) return;
    const focused = document.activeElement;
    const command = event.ctrlKey || event.metaKey;
    const several = count > 1;
    if (event.key === "Escape" && (several || selection.title || focused === containerRef.current)) {
      clear();
      return;
    }
    if (command && event.key.toLowerCase() === "a" && !event.shiftKey && !event.altKey) {
      // Inside a field, the first Ctrl/⌘+A takes its text; once it is all taken (or the field is empty), the table.
      if (isField(focused) && containerRef.current?.contains(focused) && !several) {
        const all = focused.selectionStart === 0 && focused.selectionEnd === focused.value.length;
        if (focused.value.length && !all) return;
      }
      event.preventDefault();
      takeFocus();
      setSelection(selectAll(shape, withTitle));
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !command && !event.altKey && (several || focused === containerRef.current)) {
      if (!points.length || !onClear) return;
      event.preventDefault();
      onClear(points);
    }
  };

  // Copy, cut and paste reach the document when the grid itself has the focus: listen there while it has it.
  const handleClipboard = useEffectEvent((event: ClipboardEvent) => {
    const container = containerRef.current;
    const focused = document.activeElement;
    if (paused || !container || !focused || !container.contains(focused) || !hasSelection(selection)) return;
    const several = count > 1;
    if (event.type === "paste") {
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!onPaste || !text) return;
      const tabular = isTabularText(text);
      // One value typed into the cell being written stays the browser's paste.
      if (!tabular && !several && focused !== container) return;
      event.preventDefault();
      const plan = pastePlan(selection.ranges.length ? selection : { ranges: [], title: false }, shape, parseTabularText(text));
      onPaste(plan.filter((item) => item.point.row >= 0));
      return;
    }
    // Copy and cut of text selected inside a field stay the browser's.
    if (!several && editingText(focused)) return;
    if (!several && focused !== container && isField(focused)) return;
    event.preventDefault();
    event.clipboardData?.setData("text/plain", copyText());
    if (event.type === "cut" && onClear && points.length) onClear(points);
  });

  // A click elsewhere in the page lets the selection go; a click in a menu, a dialog or a notice keeps it.
  const handleOutside = useEffectEvent((event: globalThis.MouseEvent) => {
    const container = containerRef.current;
    const target = event.target as Element | null;
    if (!container || !target || container.contains(target) || target.closest(KEEPS_SELECTION)) return;
    if (hasSelection(rawSelection)) setSelection(EMPTY_SELECTION);
  });
  useEffect(() => {
    const listener = (event: globalThis.MouseEvent) => handleOutside(event);
    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, []);

  useEffect(() => {
    const listener = (event: ClipboardEvent) => handleClipboard(event);
    document.addEventListener("copy", listener);
    document.addEventListener("cut", listener);
    document.addEventListener("paste", listener);
    return () => {
      document.removeEventListener("copy", listener);
      document.removeEventListener("cut", listener);
      document.removeEventListener("paste", listener);
    };
  }, []);

  const active = activePoint(selection);
  return {
    selection,
    setSelection,
    points,
    /** Cells selected, the title counted as one. */
    count,
    dragging,
    clear,
    isSelected: (point: GridPoint) => isCellSelected(selection, point),
    isActive: (point: GridPoint) => active !== null && active.row === point.row && active.col === point.col && count > 1,
    titleSelected: selection.title,
    /** Copies the selection as Ctrl/⌘+C does, for a menu's "Copiar". */
    copy: async () => {
      try {
        await navigator.clipboard.writeText(copyText());
      } catch {
        // Without permission the menu's copy does nothing; Ctrl/⌘+C still copies.
      }
    },
    containerProps: { onMouseDown, onMouseOver, onKeyDown },
    onColumnPointer,
    onRowPointer,
  };
}

export type CellSelectionApi = ReturnType<typeof useCellSelection>;
