"use client";

import { Fragment, useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CellSelectionBar, selectionLabel } from "@/features/valuations/components/editor/cell-selection-bar";
import { useClearCells } from "@/features/valuations/components/editor/delete-confirm";
import { useCellSelection, type GridTarget } from "@/features/valuations/components/editor/use-cell-selection";
import { parseTabularText, pastePlan, type GridPoint, type GridShape } from "@/features/valuations/services/cell-selection";
import { cn } from "@/lib/utils";
import { useConfirmDelete } from "@/features/valuations/components/editor/delete-confirm";
import {
  CAPTURE_FORMAT_HINT,
  captureFillPlan,
  captureFillSummary,
  copiedCaptureText,
  fillReplaceConfirmation,
  pasteValuesText,
  tableContextMenu,
  type CaptureFillMode,
  type CopiedCaptureCell,
  type TableMenuAction,
  type TableMenuGroup,
  type TableMenuTarget,
} from "@/features/valuations/services/table-context-menu";

/** What was right-clicked in a capture table: the cell, its row among the body's rows and its column. */
export type CalcTableHit = {
  cell: HTMLTableCellElement;
  /** The input of the cell, when it has one. */
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  /** Index of the row among the rows of the body; -1 in the header. */
  rowIndex: number;
  columnIndex: number;
  header: boolean;
};

/** What a capture table lets the menu do with its rows: what it does not give stays disabled, with the reason. */
export type CalcTableRowActions = {
  insertAbove?: (rowIndex: number) => void;
  insertBelow?: (rowIndex: number) => void;
  duplicate?: (rowIndex: number) => void;
  moveUp?: (rowIndex: number) => void;
  moveDown?: (rowIndex: number) => void;
  delete?: (rowIndex: number) => void;
  /** The rows the actions apply to; the others (totals, the subject's row) only copy. */
  count: number;
};

/**
 * Writes `text` in an input as typing does, so React sees the change. Each
 * step is rendered before the next one: a cell that sends what was typed when
 * it is left (CommitCell, the panels' fields that save on blur) reads it from
 * its state, and without the render in between it found nothing typed and
 * sent nothing ("Copiar valor a toda la fila" filled no cell, video 5.7).
 */
export function typeInto(input: HTMLInputElement | HTMLTextAreaElement, text: string, flush: (step: () => void) => void = flushSync) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  flush(() => input.focus());
  flush(() => {
    setter?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  flush(() => input.blur());
}

/**
 * The last cell "Copiar" took here: its formula and the value it showed, so
 * "Pegar solo valores" pastes that value when the formula's references cannot
 * be computed from the clipboard. Its text is what the clipboard got.
 */
let lastCopied: CopiedCaptureCell = { formula: null, value: "" };

async function copyCell(copied: CopiedCaptureCell) {
  lastCopied = copied;
  try {
    await navigator.clipboard.writeText(copiedCaptureText(copied));
  } catch {
    // Without permission the text stays in memory for a paste inside the app.
  }
}

async function readClipboard(): Promise<string> {
  try {
    return (await navigator.clipboard.readText()) || copiedCaptureText(lastCopied);
  } catch {
    return copiedCaptureText(lastCopied);
  }
}

/** What "Copiar" takes from a cell: the formula behind it (as Excel copies it) and the value it shows, as a fallback. */
const copiedOf = (hit: CalcTableHit): CopiedCaptureCell => ({
  formula: formulaOf(hit.input),
  value: hit.input instanceof HTMLSelectElement ? hit.input.selectedOptions[0]?.textContent?.trim() ?? "" : hit.input ? hit.input.value : hit.cell.textContent?.trim() ?? "",
});

/**
 * What a field holds as captured, not what it shows: the formula behind a
 * result, the text typed (`data-value` of a CommitCell, whose empty factor
 * shows the 1.00 it counts as), or its value.
 */
export function capturedText(field: HTMLInputElement | HTMLTextAreaElement): string {
  const formula = field.dataset.formula?.trim();
  if (formula?.startsWith("=")) return formula;
  return field.dataset.value ?? field.value;
}

/**
 * Enter goes to the cell below in the same column, Shift+Enter to the one
 * above, as in Excel and in the editor's tables (video 7.4, 06:33); rows
 * without a field there (a total) are skipped. False when there is none.
 */
export function focusCaptureCell(from: HTMLElement, by: 1 | -1): boolean {
  const cell = from.closest<HTMLTableCellElement>("td, th");
  const row = cell?.parentElement as HTMLTableRowElement | null;
  const section = row?.parentElement as HTMLTableSectionElement | null;
  if (!cell || !row || !section?.rows) return false;
  const rows = Array.from(section.rows);
  for (let index = rows.indexOf(row) + by; index >= 0 && index < rows.length; index += by) {
    const field = rows[index].cells[cell.cellIndex]?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input:not([type=checkbox]):not([type=radio]), textarea");
    if (!field || field.disabled || field.readOnly) continue;
    field.focus();
    field.select();
    return true;
  }
  return false;
}

/**
 * Whether a field holds a selection of part of its text, which the browser's
 * own menu serves (as a spreadsheet's formula bar): not a caret, and not the
 * whole text a field entered with Tab is given.
 */
export const isPartOfText = (field: { selectionStart: number | null; selectionEnd: number | null; value: string }) =>
  field.selectionStart !== field.selectionEnd && !(field.selectionStart === 0 && field.selectionEnd === field.value.length);

/**
 * A close the menu does not take: it opens at the pointer, with no trigger, so the menu's
 * "pointer left the trigger" closed it as soon as it opened on a cell being edited.
 */
export const ignoredClose = (details: unknown) => (details as { reason?: string } | undefined)?.reason === "trigger-hover";

/** A point of the screen as an anchor for the menu, where the right click was. */
const pointAnchor = (x: number, y: number) => ({
  getBoundingClientRect: () => ({ x, y, top: y, left: x, right: x, bottom: y, width: 0, height: 0, toJSON: () => ({}) }),
});

/**
 * The right-click menu of a capture table of the calculation panels (costs,
 * construction types, homologation, comparables): the same menu as the
 * configurable tables of the editor, with what this table cannot do
 * disabled and explained. It wraps the frame of the table and listens for the
 * right click on its cells and headers.
 */
export function CalcTableContextMenu({ children, readOnly, rows, className }: {
  children: ReactNode;
  readOnly: boolean;
  /** Rows the table adds, moves or removes through the menu; absent, its rows are the calculation's. */
  rows?: CalcTableRowActions;
  className?: string;
}) {
  const [menu, setMenu] = useState<{ anchor: ReturnType<typeof pointAnchor>; hit: CalcTableHit; groups: TableMenuGroup[] } | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const selection = useCaptureSelection(frameRef, readOnly);
  const confirm = useConfirmDelete();
  // Part of a text the appraiser had selected in a field before the right click. Chrome for Mac
  // selects the word under the pointer on the right press itself, and a field entered with Tab has
  // all its text selected: neither is a selection of his, and the menu is the table's.
  const selectedBeforeRef = useRef(false);
  const onMouseDownCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 2) return;
    const active = document.activeElement;
    selectedBeforeRef.current = active instanceof HTMLInputElement && active === (event.target as HTMLElement).closest("input") && isPartOfText(active);
  };

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const element = event.target as HTMLElement;
    const cell = element.closest<HTMLTableCellElement>("td, th");
    const row = cell?.closest("tr");
    if (!cell || !row || !event.currentTarget.contains(cell)) return;
    const header = Boolean(cell.closest("thead")) || cell.tagName === "TH";
    const body = row.closest("tbody");
    const rowIndex = header || !body ? -1 : Array.from(body.rows).indexOf(row);
    const several = selection.count > 1 && selection.isSelected({ row: rowIndex, col: cell.cellIndex });
    // The text selected inside an input keeps the browser's own menu, as in a spreadsheet's formula bar;
    // on a selection of several cells the menu is the table's, for all of them.
    const input = element.closest<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
    if (!several && input instanceof HTMLInputElement && selectedBeforeRef.current && input.selectionStart !== input.selectionEnd && document.activeElement === input) return;
    event.preventDefault();
    const hit: CalcTableHit = { cell, input, rowIndex, columnIndex: cell.cellIndex, header };
    const target = targetOf(hit, readOnly, rows);
    setMenu({
      anchor: pointAnchor(event.clientX, event.clientY),
      hit,
      groups: tableContextMenu("capture", target.kind === "cell" && several ? { ...target, selected: selection.count } : target),
    });
  };

  const run = async (action: TableMenuAction) => {
    if (!menu) return;
    const { hit } = menu;
    // On a selection of several cells, copying, cutting, pasting and clearing take all of them, as Excel.
    if (selection.count > 1 && selection.isSelected({ row: hit.rowIndex, col: hit.columnIndex })) {
      if (action === "copy") return selection.copy();
      if (action === "cut") return selection.cut();
      if (action === "paste" || action === "paste-values") return selection.pasteFromClipboard(action === "paste-values");
      if (action === "clear") return selection.clearSelected();
    }
    const input = takesTyping(hit.input, readOnly) ? hit.input : null;
    switch (action) {
      case "copy":
        await copyCell(copiedOf(hit));
        return;
      case "cut":
        if (!input) return;
        await copyCell(copiedOf(hit));
        typeInto(input, "");
        return;
      case "paste":
      case "paste-values": {
        if (!input) return;
        const text = await readClipboard();
        if (!text) {
          toast.info("No hay nada que pegar.");
          return;
        }
        if (action === "paste") {
          typeInto(input, text);
          return;
        }
        // The number the formula gives, as Excel's "Pegar valores".
        const value = pasteValuesText(text, lastCopied);
        if (value === null) {
          toast.error("No se pudo calcular el valor de lo copiado", { description: `«${text.trim()}» no da un número; pégalo con «Pegar» para conservar la fórmula.` });
          return;
        }
        typeInto(input, value);
        return;
      }
      case "clear":
        if (input) typeInto(input, "");
        return;
      case "edit-formula":
        if (input) {
          input.focus();
          if (!input.value.startsWith("=")) typeInto(input, "=");
          input.focus();
        }
        return;
      case "rename":
        if (hit.input) hit.input.focus();
        return;
      case "fill-column":
      case "fill-row":
      case "fill-column-empty":
      case "fill-row-empty": {
        const along = action === "fill-row" || action === "fill-row-empty" ? "row" : "column";
        const mode: CaptureFillMode = action === "fill-column" || action === "fill-row" ? "all" : "empty";
        const plan = fillPlan(hit, along, mode, readOnly);
        if (!plan) return;
        const write = () => {
          const previous = selection.typeAll(plan.writes);
          toast.info(captureFillSummary(plan.writes.length, plan.computedSkipped, along, plan.replaced), previous.length
            ? { description: "Se puede deshacer con «Deshacer».", action: { label: "Deshacer", onClick: () => void selection.typeAll(previous) } }
            : undefined);
        };
        // Writing over what is captured is asked first; the empty cells are filled at once.
        if (plan.replaced) confirm({ ...fillReplaceConfirmation(plan.replaced, along, plan.copies), onConfirm: write });
        else write();
        return;
      }
      case "insert-row-above": rows?.insertAbove?.(hit.rowIndex); return;
      case "insert-row-below": rows?.insertBelow?.(hit.rowIndex); return;
      case "duplicate-row": rows?.duplicate?.(hit.rowIndex); return;
      case "move-row-up": rows?.moveUp?.(hit.rowIndex); return;
      case "move-row-down": rows?.moveDown?.(hit.rowIndex); return;
      case "delete-row": rows?.delete?.(hit.rowIndex); return;
      default:
        return;
    }
  };

  return (
    // The bar of a selection floats over what is above the table: selecting never moves the table under the mouse.
    <div className="relative">
      {selection.count > 1 ? (
        <div className="absolute bottom-full left-0 z-30 mb-1 max-w-full">
          <CellSelectionBar
            count={selection.count}
            label={selectionLabel(selection.points.length, false)}
            readOnly={false}
            marks={{ bold: false, italic: false, underline: false }}
            formatLocked={CAPTURE_FORMAT_HINT}
            onMark={() => undefined}
            onAlign={() => undefined}
            onUnit={() => undefined}
            onDecimals={() => undefined}
            onClearFormat={() => undefined}
            onCopy={() => void selection.copy()}
            onClearContents={readOnly ? undefined : selection.clearSelected}
            onDone={selection.clear}
          />
        </div>
      ) : null}
    <div
      ref={frameRef}
      className={cn(
        className,
        "outline-none",
        selection.dragging && "select-none",
        // Several cells selected are shaded, the active one framed, as in the editor's tables.
        "[&_[data-cell-selected]]:bg-primary/10 dark:[&_[data-cell-selected]]:bg-primary/20 [&_[data-cell-active]]:outline-2 [&_[data-cell-active]]:-outline-offset-2 [&_[data-cell-active]]:outline-primary",
      )}
      onContextMenu={onContextMenu}
      onMouseDownCapture={onMouseDownCapture}
      onMouseDown={selection.containerProps.onMouseDown}
      onMouseOver={selection.containerProps.onMouseOver}
      onKeyDown={(event) => {
        selection.containerProps.onKeyDown(event);
        // Enter confirms the field and goes down, as in Excel; a cell that moved on its own already said so.
        if (event.key !== "Enter" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        const field = event.target as HTMLElement;
        if (!(field instanceof HTMLInputElement) || field.type === "checkbox" || !frameRef.current?.querySelector("table")?.contains(field)) return;
        event.preventDefault();
        if (!focusCaptureCell(field, event.shiftKey ? -1 : 1)) field.blur();
      }}
      tabIndex={-1}
      data-calc-table-menu=""
    >
      {children}
      <DropdownMenu open={menu !== null} onOpenChange={(open, details) => { if (!open && !ignoredClose(details)) setMenu(null); }} modal={false}>
        {menu ? (
          <DropdownMenuContent anchor={menu.anchor} align="start" side="bottom" sideOffset={2} className="w-64" aria-label="Menú de la tabla">
            {menu.groups.map((group, index) => (
              <Fragment key={index}>
                {index > 0 ? <DropdownMenuSeparator /> : null}
                {group.map((item) => (
                  <DropdownMenuItem
                    key={`${item.action}:${item.label}`}
                    variant={item.destructive ? "destructive" : undefined}
                    disabled={item.disabled}
                    title={item.disabled ? item.hint : undefined}
                    onClick={() => void run(item.action)}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </Fragment>
            ))}
          </DropdownMenuContent>
        ) : null}
      </DropdownMenu>
    </div>
    </div>
  );
}

/** The table of a frame and its body. */
const tableOf = (frame: HTMLElement | null) => frame?.querySelector("table") ?? null;

/** Rows of the body, columns of the widest row and whether the header takes a selection, as the frame shows them now. */
function captureShape(frame: HTMLElement | null): GridShape {
  const table = tableOf(frame);
  const body = table?.tBodies[0];
  const head = table?.tHead;
  const rows = body ? Array.from(body.rows) : [];
  const cols = Math.max(0, ...rows.map((row) => row.cells.length), ...(head ? Array.from(head.rows).map((row) => row.cells.length) : []));
  return { rows: rows.length, cols, header: Boolean(head?.rows.length) };
}

/** The cell of the frame at a point of the selection: the header's last row is row -1. */
function captureCell(frame: HTMLElement | null, point: GridPoint): HTMLTableCellElement | null {
  const table = tableOf(frame);
  const row = point.row < 0 ? table?.tHead?.rows[(table.tHead?.rows.length ?? 1) - 1] : table?.tBodies[0]?.rows[point.row];
  return row?.cells[point.col] ?? null;
}

/** Where a click falls in a capture table: its cell, by row of the body (the header is -1) and place in the row. */
function locateCapture(frame: HTMLElement | null) {
  return (element: Element): GridTarget => {
    const cell = element.closest<HTMLTableCellElement>("td, th");
    const table = tableOf(frame);
    if (!cell || !table || !table.contains(cell)) return null;
    const row = cell.parentElement as HTMLTableRowElement;
    if (row.parentElement === table.tHead) return { row: -1, col: cell.cellIndex };
    const index = table.tBodies[0] ? Array.from(table.tBodies[0].rows).indexOf(row) : -1;
    return index < 0 ? null : { row: index, col: cell.cellIndex };
  };
}

/** The text of a capture cell as copied: the formula behind its result (as Excel copies it), what its field holds, or what is written in it. */
function captureText(cell: HTMLTableCellElement | null) {
  if (!cell) return "";
  const field = cell.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  if (field instanceof HTMLSelectElement) return field.selectedOptions[0]?.textContent?.trim() ?? "";
  return field ? formulaOf(field) ?? field.value : cell.textContent?.trim() ?? "";
}

/**
 * The selection of cells of a capture table (video 5.7), the same as the
 * editor's tables: drag, Shift+click, Ctrl/⌘+click, Ctrl/⌘+A, copy and paste
 * with Excel and Supr. Its cells are the panel's fields: a paste or a clear
 * types in each one that takes typing, as a person would, and the notice
 * offers «Deshacer», which types back what each one held. These tables do not
 * print: their format is chosen in the dictamen's block.
 */
function useCaptureSelection(frameRef: RefObject<HTMLDivElement | null>, readOnly: boolean) {
  const clearCells = useClearCells();
  // Rows and columns as the frame shows them, read again whenever the panel adds or takes out rows.
  const [shape, setShape] = useState<GridShape>({ rows: 0, cols: 0, header: false });
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setShape((current) => {
      const next = captureShape(frame);
      return next.rows === current.rows && next.cols === current.cols && next.header === current.header ? current : next;
    });
    update();
    const observer = new MutationObserver(update);
    observer.observe(frame, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [frameRef]);
  const fieldAt = (point: GridPoint) => fieldOf(captureCell(frameRef.current, point) ?? undefined);
  /** Types each text in its field when it takes typing; gives back what each one held, to undo it. */
  const typeAll = (writes: Array<{ point: GridPoint; text: string }>) => {
    const previous: Array<{ point: GridPoint; text: string }> = [];
    for (const { point, text } of writes) {
      const field = fieldAt(point);
      // What it held as captured comes back on «Deshacer»: a formula, not its result; nothing, not a suggestion.
      const held = field ? capturedText(field) : "";
      if (!field || !takesTyping(field, readOnly) || held === text) continue;
      previous.push({ point, text: held });
      typeInto(field, text);
    }
    return previous;
  };
  const paste = (plan: Array<{ point: GridPoint; text: string }>) => {
    const previous = typeAll(plan.filter((item) => item.point.row >= 0));
    if (!previous.length) {
      toast.info("Ninguna de esas celdas se captura aquí: las calcula el sistema o son de solo lectura.");
      return;
    }
    toast.success(previous.length === 1 ? "Se pegó 1 celda" : `Se pegaron ${previous.length} celdas`, {
      description: "Se puede deshacer con «Deshacer».",
      action: { label: "Deshacer", onClick: () => void typeAll(previous) },
    });
  };
  const clear = (points: GridPoint[]) => {
    const filled = points.filter((point) => {
      const field = fieldAt(point);
      return field !== null && takesTyping(field, readOnly) && capturedText(field) !== "";
    });
    if (!filled.length) return;
    let previous: Array<{ point: GridPoint; text: string }> = [];
    clearCells({
      count: filled.length,
      onClear: () => {
        previous = typeAll(filled.map((point) => ({ point, text: "" })));
      },
      undo: () => void typeAll(previous),
    });
  };
  const api = useCellSelection({
    containerRef: frameRef,
    shape,
    locate: (element) => locateCapture(frameRef.current)(element),
    readCell: (point) => (point ? captureText(captureCell(frameRef.current, point)) : ""),
    onPaste: readOnly ? undefined : paste,
    onClear: readOnly ? undefined : clear,
  });

  // The cells selected are marked on the table itself: its rows are the panel's.
  const markKey = api.count > 1 ? api.points.map((point) => `${point.row}:${point.col}`).join(",") : "";
  const anchor = api.selection.ranges.at(-1)?.anchor;
  const activeKey = api.count > 1 && anchor ? `${anchor.row}:${anchor.col}` : "";
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.querySelectorAll("[data-cell-selected], [data-cell-active]").forEach((cell) => {
      cell.removeAttribute("data-cell-selected");
      cell.removeAttribute("data-cell-active");
    });
    if (!markKey) return;
    for (const key of markKey.split(",")) {
      const [row, col] = key.split(":").map(Number);
      const cell = captureCell(frame, { row, col });
      cell?.setAttribute("data-cell-selected", "");
      if (key === activeKey) cell?.setAttribute("data-cell-active", "");
    }
  }, [frameRef, markKey, activeKey]);

  return {
    ...api,
    typeAll,
    clearSelected: () => clear(api.points),
    cut: async () => {
      await api.copy();
      if (!readOnly) clear(api.points);
    },
    /** Pastes what was copied over the selection; `valuesOnly`, each formula as the number it gives. */
    pasteFromClipboard: async (valuesOnly = false) => {
      if (readOnly) return;
      let text = "";
      try {
        text = await navigator.clipboard.readText();
      } catch {
        toast.info("El navegador no dejó leer lo copiado: pega con Ctrl+V (⌘V en Mac).");
        return;
      }
      const grid = parseTabularText(text);
      paste(pastePlan(api.selection, shape, valuesOnly ? grid.map((line) => line.map((cell) => pasteValuesText(cell) ?? cell)) : grid));
    },
  };
}

/** Whether the cell's control takes typing. */
const takesTyping = (input: CalcTableHit["input"], readOnly: boolean): input is HTMLInputElement | HTMLTextAreaElement =>
  !readOnly && (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) && !input.disabled && !input.readOnly;

/** The formula of a cell's field: the one it keeps while it shows the result (`data-formula`), or what it holds. */
function formulaOf(input: CalcTableHit["input"]): string | null {
  if (!input) return null;
  const kept = input.dataset.formula?.trim();
  if (kept?.startsWith("=")) return kept;
  return "value" in input && input.value.trim().startsWith("=") ? input.value.trim() : null;
}

/** The field of a cell that takes typing, if any. */
const fieldOf = (cell: HTMLTableCellElement | undefined) => cell?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea") ?? null;

/**
 * "Copiar fórmula/valor a toda la fila/columna": the formula of the cell, or
 * its value, for the fields of its row or column that take typing (`all`,
 * replacing what they hold) or only the empty ones (`empty`). Empty is what
 * was captured, not what is shown: a factor left empty shows the 1.00 it
 * counts as and still takes the copy (video 7.4, 05:49).
 */
function fillPlan(hit: CalcTableHit, along: "row" | "column", mode: CaptureFillMode, readOnly: boolean) {
  const formula = takesTyping(hit.input, readOnly) ? formulaOf(hit.input) ?? (capturedText(hit.input).trim() || hit.input.value.trim() || null) : null;
  const row = hit.cell.closest("tr");
  const body = row?.closest("tbody");
  if (!formula || !row || !body) return null;
  const cells = along === "row" ? Array.from(row.cells) : Array.from(body.rows).map((item) => item.cells[hit.columnIndex]);
  const from = along === "row" ? hit.columnIndex : hit.rowIndex;
  const fields = cells.map(fieldOf);
  // A cell marked `data-no-fill` is left alone: "computed" when the system calculates it while empty
  // (Sup., FRe, the subject's area…), otherwise not one more value of the row (a comparable's free text).
  const seen = fields.map((field) => (field
    ? {
      takesTyping: takesTyping(field, readOnly), text: capturedText(field), hasFormula: formulaOf(field) !== null,
      noFill: field.dataset.noFill === undefined ? null : field.dataset.noFill === "computed" ? "computed" as const : "other" as const,
    }
    : null));
  const { targets, computedSkipped, replaced } = captureFillPlan(seen, from, mode);
  const point = (index: number): GridPoint => (along === "row" ? { row: hit.rowIndex, col: index } : { row: index, col: hit.columnIndex });
  return {
    writes: targets.map((index) => ({ point: point(index), text: formula })),
    computedSkipped,
    replaced,
    copies: formula.startsWith("=") ? "fórmula" as const : "valor" as const,
  };
}

/** The menu's target for what was clicked: a header, a row's first cell or a cell. */
function targetOf(hit: CalcTableHit, readOnly: boolean, rows: CalcTableRowActions | undefined): TableMenuTarget {
  if (hit.header) {
    return { kind: "column", canInsertBeside: false, canRename: takesTyping(hit.input, readOnly), canMoveLeft: false, canMoveRight: false, canDelete: false, hidden: false, canHide: false };
  }
  const ownRow = rows !== undefined && hit.rowIndex >= 0 && hit.rowIndex < rows.count && !readOnly;
  const canInsert = ownRow && Boolean(rows.insertAbove || rows.insertBelow);
  if (hit.columnIndex === 0 && !hit.input) {
    return {
      kind: "row",
      canInsert,
      canMoveUp: ownRow && Boolean(rows.moveUp) && hit.rowIndex > 0,
      canMoveDown: ownRow && Boolean(rows.moveDown) && hit.rowIndex < rows.count - 1,
      canDelete: ownRow && Boolean(rows.delete),
      hidden: false,
      canHide: false,
    };
  }
  const editable = takesTyping(hit.input, readOnly);
  return {
    kind: "cell",
    editable,
    hasFormula: editable && formulaOf(hit.input) !== null,
    hasValue: editable && Boolean(hit.input && "value" in hit.input && hit.input.value.trim()),
    canPaste: editable,
    canInsertRow: canInsert,
    canInsertColumn: false,
    canDeleteColumn: false,
    canDeleteRow: ownRow && Boolean(rows.delete),
  };
}
