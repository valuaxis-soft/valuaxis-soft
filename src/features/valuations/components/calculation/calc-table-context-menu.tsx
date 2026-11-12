"use client";

import { Fragment, useState, type MouseEvent, type ReactNode } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  captureFillTargets,
  tableContextMenu,
  type CaptureFillCell,
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

/** Writes `text` in an input as typing does, so React sees the change. */
function typeInto(input: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  input.focus();
  setter?.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.blur();
}

/** What the system clipboard holds; the last text copied here when it cannot be read. */
let lastCopied = "";

async function copyText(text: string) {
  lastCopied = text;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Without permission the text stays in memory for a paste inside the app.
  }
}

async function readClipboard(): Promise<string> {
  try {
    return (await navigator.clipboard.readText()) || lastCopied;
  } catch {
    return lastCopied;
  }
}

/** The text a cell shows: what its input holds, or what is written in it. */
const cellText = (hit: CalcTableHit) => (hit.input ? hit.input.value : hit.cell.textContent?.trim() ?? "");

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

  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const element = event.target as HTMLElement;
    const cell = element.closest<HTMLTableCellElement>("td, th");
    const row = cell?.closest("tr");
    if (!cell || !row || !event.currentTarget.contains(cell)) return;
    // The text selected inside an input keeps the browser's own menu, as in a spreadsheet's formula bar.
    const input = element.closest<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
    if (input instanceof HTMLInputElement && input.selectionStart !== input.selectionEnd && document.activeElement === input) return;
    event.preventDefault();
    const header = Boolean(cell.closest("thead")) || cell.tagName === "TH";
    const body = row.closest("tbody");
    const rowIndex = header || !body ? -1 : Array.from(body.rows).indexOf(row);
    const hit: CalcTableHit = { cell, input, rowIndex, columnIndex: cell.cellIndex, header };
    const target = targetOf(hit, readOnly, rows);
    setMenu({ anchor: pointAnchor(event.clientX, event.clientY), hit, groups: tableContextMenu("capture", target) });
  };

  const run = async (action: TableMenuAction) => {
    if (!menu) return;
    const { hit } = menu;
    const input = takesTyping(hit.input, readOnly) ? hit.input : null;
    switch (action) {
      case "copy":
        await copyText(cellText(hit));
        return;
      case "cut":
        if (!input) return;
        await copyText(input.value);
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
        typeInto(input, action === "paste-values" ? text.replace(/^=/, "") : text);
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
        fillFormula(hit, action === "fill-row" ? "row" : "column", readOnly);
        return;
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
    <div className={className} onContextMenu={onContextMenu} data-calc-table-menu="">
      {children}
      <DropdownMenu open={menu !== null} onOpenChange={(open) => { if (!open) setMenu(null); }} modal={false}>
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
  );
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

/** "Copiar fórmula/valor a toda la fila/columna": the formula of the cell, or its value, typed in the empty fields of its row or column. */
function fillFormula(hit: CalcTableHit, along: "row" | "column", readOnly: boolean) {
  const formula = takesTyping(hit.input, readOnly) ? formulaOf(hit.input) ?? (hit.input.value.trim() || null) : null;
  const row = hit.cell.closest("tr");
  const body = row?.closest("tbody");
  if (!formula || !row || !body) return;
  const cells = along === "row" ? Array.from(row.cells) : Array.from(body.rows).map((item) => item.cells[hit.columnIndex]);
  const from = along === "row" ? hit.columnIndex : hit.rowIndex;
  const fields = cells.map(fieldOf);
  const seen: CaptureFillCell[] = fields.map((field) => (field ? { takesTyping: takesTyping(field, readOnly), text: field.value, hasFormula: formulaOf(field) !== null } : null));
  const targets = captureFillTargets(seen, from);
  for (const index of targets) typeInto(fields[index]!, formula);
  if (!targets.length) toast.info(`No hay celdas vacías en la ${along === "row" ? "fila" : "columna"} para copiarlo.`);
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
