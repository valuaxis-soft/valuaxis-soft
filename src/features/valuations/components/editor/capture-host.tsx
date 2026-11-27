"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useSyncExternalStore,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { CapturePages } from "@/features/valuations/calculation/capture-display";
import { toast } from "sonner";

import { parseTabularText } from "@/features/valuations/services/cell-selection";
import { cn } from "@/lib/utils";
import { capturedText, focusCaptureCell, writeCaptureCell } from "../calculation/calc-table-context-menu";

/**
 * The capture of a calculation inside the tables of its pages (20 nov 2026:
 * one table, not a capture panel over a copy of it). The panel of the
 * calculation keeps its state, its saving and its undo; it only places each
 * of its fields in the cell of the table of the dictamen that shows that
 * datum (`CaptureSlot`), and the table leaves that place to it
 * (`CaptureSlotTarget`). The field is the panel's own, moved there with a
 * portal: what it does when it is typed in, left or undone is what it did in
 * the panel.
 */

/** A place of a table of the calculation's pages the capture fills. */
export type CaptureAddress =
  /** A cell: the row and the column as the calculation wrote them. */
  | { table: string; row: string; column: string }
  /** What is done with a row (taking it out, its link), at its end. */
  | { table: string; row: string }
  /** The figure of a row of a box under the table. */
  | { table: string; box: string }
  /** Under the grid of the table: adding a row. */
  | { table: string; part: "footer" }
  /**
   * Over the table: what the capture sets for it and does not print (the
   * subject's data over the homologation, the buttons over the comparables),
   * right above the table it affects (video 8.10: one structure, in the order
   * of the appraiser's Excel, no «configuration» apart).
   */
  | { table: string; part: "before" }
  /** After everything of the table (its notes and boxes): what the capture adds at its end (the values and the statistics of a market). */
  | { table: string; part: "after" };

/** The key of a place; ids are compared in lower case, as they come back saved. */
export function captureSlotKey(address: CaptureAddress): string {
  const parts = "column" in address ? ["cell", address.row, address.column]
    : "row" in address ? ["row", address.row]
      : "box" in address ? ["box", address.box]
        : [address.part];
  return [address.table, ...parts].join("|").toLowerCase();
}

type Listener = () => void;

/**
 * A header of a table of the capture whose name is a datum of the calculation
 * (a factor's): renamed in the table, the calculation takes the name and
 * writes it everywhere it prints, instead of the table keeping a label of its own.
 */
export type CaptureHeaderRename = {
  handles: (columnId: string) => boolean;
  rename: (columnId: string, name: string) => void;
  /**
   * The columns the appraiser may take out of the table (video 8.9: «debo de
   * poder eliminar columnas»); the ones the calculation needs stay. Missing,
   * none: they are hidden, as before.
   */
  removable?: (columnId: string) => boolean;
  /** A column taken out that the calculation takes itself (a factor, a datum of the card): the table does not keep it out, the calculation drops it. */
  takesRemoval?: (columnId: string) => boolean;
  remove?: (columnId: string) => void;
  /** A column added after `after` that becomes the calculation's (a factor among the factors): the table does not keep it as its own. */
  takesInsert?: (after: string | null) => boolean;
  /** `columnId`: the column as the table added it, so one insertion is taken once. */
  insert?: (after: string | null, name: string, columnId: string) => void;
  /** Rows of the table's boxes the panel edits as a table of its own (the statistics), by `summaryRowKey`: not repeated among the box labels. */
  boxRowManaged?: (rowKey: string) => boolean;
  /** The data of the card the table may show as a column, and whether each already is one («Dato de la ficha»). */
  linkable?: () => Array<{ key: string; label: string; linked: boolean }>;
  link?: (key: string) => void;
};

/** What the panel declared and where the tables left room for it, for one section of the editor. */
export class CaptureStore {
  private declared = new Map<string, number>();
  private elements = new Map<string, HTMLElement>();
  private listeners = new Set<Listener>();
  private current: CapturePages | null = null;
  private headers = new Map<string, CaptureHeaderRename>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    for (const listener of [...this.listeners]) listener();
  }

  pages = () => this.current;

  setPages(pages: CapturePages | null) {
    if (this.current === pages) return;
    this.current = pages;
    this.notify();
  }

  isDeclared = (key: string) => this.declared.has(key);

  /** Whether the capture puts something at the end of the rows of a table (its actions): the table leaves them room. */
  hasRowSlots = (table: string) => {
    const prefix = `${table.toLowerCase()}|row|`;
    for (const key of this.declared.keys()) if (key.startsWith(prefix)) return true;
    return false;
  };

  declare(key: string) {
    const count = this.declared.get(key) ?? 0;
    this.declared.set(key, count + 1);
    if (!count) this.notify();
    return () => {
      const left = (this.declared.get(key) ?? 1) - 1;
      if (left > 0) {
        this.declared.set(key, left);
        return;
      }
      this.declared.delete(key);
      this.notify();
    };
  }

  /** Who names the columns of a table of the capture, if its panel does (the factors of the homologation). */
  headerRename = (table: string) => this.headers.get(table.toLowerCase()) ?? null;

  setHeaderRename(table: string, rename: CaptureHeaderRename) {
    this.headers.set(table.toLowerCase(), rename);
    this.notify();
    return () => {
      if (this.headers.get(table.toLowerCase()) !== rename) return;
      this.headers.delete(table.toLowerCase());
      this.notify();
    };
  }

  element = (key: string) => this.elements.get(key) ?? null;

  setElement(key: string, element: HTMLElement) {
    if (this.elements.get(key) === element) return;
    this.elements.set(key, element);
    this.notify();
  }

  removeElement(key: string, element: HTMLElement) {
    if (this.elements.get(key) !== element) return;
    this.elements.delete(key);
    this.notify();
  }
}

const CaptureStoreContext = createContext<CaptureStore | null>(null);

export const CaptureStoreProvider = CaptureStoreContext.Provider;

const NO_SUBSCRIPTION = () => () => undefined;

/** The pages the section's calculation captures in, as it holds them now; null without one. */
export function useCapturePages(store: CaptureStore): CapturePages | null {
  return useSyncExternalStore(store.subscribe, store.pages, () => null);
}

/**
 * The panel hands the editor its pages, with what is being captured: the
 * tables of the section show them, each once. Gone with the panel.
 */
export function usePublishCapturePages(pages: CapturePages | null) {
  const store = useContext(CaptureStoreContext);
  useLayoutEffect(() => {
    store?.setPages(pages);
  }, [store, pages]);
  useEffect(() => () => store?.setPages(null), [store]);
}

/** The store of the section's capture, for a table to ask who names its columns. */
export const useCaptureStore = () => useContext(CaptureStoreContext);

/**
 * The panel manages those columns of that table: a header renamed there is
 * the calculation's name, and what it says of taking out, adding and linking
 * columns is the calculation's. Always read as the panel renders now.
 */
export function useCaptureColumns(table: string, columns: CaptureHeaderRename) {
  const store = useContext(CaptureStoreContext);
  const latest = useRef(columns);
  useLayoutEffect(() => {
    latest.current = columns;
  });
  useEffect(() => store?.setHeaderRename(table, {
    handles: (columnId) => latest.current.handles(columnId),
    rename: (columnId, name) => latest.current.rename(columnId, name),
    removable: (columnId) => latest.current.removable?.(columnId) ?? false,
    takesRemoval: (columnId) => latest.current.takesRemoval?.(columnId) ?? false,
    remove: (columnId) => latest.current.remove?.(columnId),
    takesInsert: (after) => latest.current.takesInsert?.(after) ?? false,
    insert: (after, name, columnId) => latest.current.insert?.(after, name, columnId),
    boxRowManaged: (rowKey) => latest.current.boxRowManaged?.(rowKey) ?? false,
    linkable: latest.current.linkable ? () => latest.current.linkable?.() ?? [] : undefined,
    link: (key) => latest.current.link?.(key),
  }), [store, table]);
}

/** Whether the capture puts actions at the end of the rows of the table («Ver ficha», «Eliminar»). */
export function useCaptureRowSlots(table: string): boolean {
  const store = useContext(CaptureStoreContext);
  const read = () => store?.hasRowSlots(table) ?? false;
  return useSyncExternalStore(store?.subscribe ?? NO_SUBSCRIPTION, read, read);
}

/** Who manages the columns of a table of the capture, once its panel says so; null for the others. */
export function useCaptureColumnsOf(table: string): CaptureHeaderRename | null {
  const store = useContext(CaptureStoreContext);
  const read = () => store?.headerRename(table) ?? null;
  return useSyncExternalStore(store?.subscribe ?? NO_SUBSCRIPTION, read, () => null);
}

/** Whether the capture fills that place of the table. */
export function useCaptureDeclared(address: CaptureAddress): boolean {
  const store = useContext(CaptureStoreContext);
  const key = captureSlotKey(address);
  const declared = () => store?.isDeclared(key) ?? false;
  return useSyncExternalStore(store?.subscribe ?? NO_SUBSCRIPTION, declared, declared);
}

/**
 * The room a table leaves for a field of the capture. Its keys are the
 * panel's: Ctrl+Z in it is the panel's undo, not the document's.
 */
export function CaptureSlotTarget({ address, className }: { address: CaptureAddress; className?: string }) {
  const store = useContext(CaptureStoreContext);
  const key = captureSlotKey(address);
  const register = useCallback((element: HTMLDivElement | null) => {
    if (!element || !store) return undefined;
    store.setElement(key, element);
    return () => store.removeElement(key, element);
  }, [store, key]);
  return <div ref={register} className={className} data-capture-slot={key} data-native-undo="" />;
}

type CaptureField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** What a field holds as captured: the option of a list, the formula behind a result or what was typed. */
export const captureFieldText = (field: CaptureField) => (field instanceof HTMLSelectElement ? field.value : capturedText(field));

/**
 * The field of a cell the table's menu acts on: the list, when the right
 * click was on it (a cell may hold a factor and, under it, the list that
 * proposes it); else its first field.
 */
export function captureMenuField(cell: Element | null): CaptureField | null {
  const slot = cell?.querySelector<HTMLElement>("[data-capture-slot]");
  const list = slot?.dataset.captureMenu === "select" ? slot.querySelector("select") : null;
  return list ?? captureFieldIn(cell);
}

/** The field of the same kind in another cell of the table: its list for a list, its first field otherwise. */
export function captureFieldLike(cell: Element | null, like: CaptureField): CaptureField | null {
  if (like instanceof HTMLSelectElement) return cell?.querySelector<HTMLSelectElement>("[data-capture-slot] select") ?? null;
  const field = captureFieldIn(cell);
  return field instanceof HTMLSelectElement ? null : field;
}

/**
 * Whether a fill of its row or column writes in a field: not in one that is
 * not one more value of them, and not in one the system calculates while
 * empty (a surface factor left to its formula), as in every capture table.
 */
export function captureFieldTakesFill(field: CaptureField): boolean {
  if (field.disabled) return false;
  const mark = field.dataset.noFill;
  if (mark === undefined) return true;
  return mark === "computed" && captureFieldText(field).trim() !== "";
}

/**
 * Several cells pasted from a spreadsheet, from the cell of `start` to the
 * right and down, each in the field of the capture of its cell; cells
 * without one (the calculation's figures) are skipped. Returns what each
 * field held, to undo it.
 */
export function pasteCaptureRange(start: Element, rows: string[][]): Array<{ field: CaptureField; previous: string }> {
  const cell = start.closest("td");
  const body = cell?.closest("tbody");
  const row = cell?.parentElement;
  if (!cell || !body || !row) return [];
  const bodyRows = Array.from(body.children);
  const fromRow = bodyRows.indexOf(row);
  const fromColumn = Number((cell as HTMLElement).dataset.gridCol ?? -1);
  if (fromRow < 0 || fromColumn < 0) return [];
  const written: Array<{ field: CaptureField; previous: string }> = [];
  rows.forEach((texts, rowOffset) => texts.forEach((text, columnOffset) => {
    const target = bodyRows[fromRow + rowOffset]?.querySelector(`:scope > td[data-grid-col="${fromColumn + columnOffset}"]`);
    const field = captureFieldIn(target ?? null);
    if (!field || field.disabled || field instanceof HTMLSelectElement) return;
    written.push({ field, previous: captureFieldText(field) });
    writeCaptureCell(field, text.trim());
  }));
  return written;
}

/** The field of the capture a place of a table holds, if any. */
export function captureFieldIn(container: Element | null) {
  return container?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    "[data-capture-slot] input:not([type=checkbox]):not([type=radio]), [data-capture-slot] textarea, [data-capture-slot] select",
  ) ?? null;
}

/**
 * A field of the capture in its place of the table of the dictamen. While
 * that table is not on screen (its block belongs to another tab) the field
 * is not shown, unless `fallback` says to keep it here, in the panel.
 */
export function CaptureSlot({ at, children, fallback = false }: { at: CaptureAddress; children: ReactNode; fallback?: boolean }) {
  const store = useContext(CaptureStoreContext);
  const key = captureSlotKey(at);
  useLayoutEffect(() => store?.declare(key), [store, key]);
  const element = useSyncExternalStore(store?.subscribe ?? NO_SUBSCRIPTION, () => store?.element(key) ?? null, () => null);
  if (!element) return fallback ? <>{children}</> : null;
  return createPortal(<CaptureSlotContent element={element}>{children}</CaptureSlotContent>, element);
}

/** Says how many cells a paste or a fill wrote, with «Deshacer»: each goes back to what it held. */
export function notifyCaptureWrite(written: Array<{ field: CaptureField; previous: string }>, what: string) {
  if (!written.length) {
    toast.info("No hay celdas de captura donde escribir desde aquí.");
    return;
  }
  toast.success(written.length === 1 ? `1 celda ${what.replace(/s$/, "")}` : `${written.length} celdas ${what}`, {
    description: "Se puede deshacer con «Deshacer».",
    duration: 10_000,
    action: { label: "Deshacer", onClick: () => written.forEach(({ field, previous }) => { if (field.isConnected) writeCaptureCell(field, previous); }) },
  });
}

const plainKey = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/**
 * What was already written in the same column of the table and starts with
 * what is being typed (video 8.7, 3:50: «un 80… la recomendación de que si ya
 * puse ese valor, Enter o tabulador para confirmar»), as the editor's tables
 * offer it: the other cells of the column, each value once, up to five.
 */
export function columnCaptureSuggestions(field: HTMLInputElement, limit = 5): string[] {
  const typed = plainKey(field.value);
  if (!typed || typed.startsWith("=")) return [];
  const cell = field.closest("td");
  const body = cell?.closest("tbody");
  const column = (cell as HTMLElement | null)?.dataset.gridCol;
  if (!cell || !body || column === undefined) return [];
  const seen = new Set<string>();
  const found: string[] = [];
  for (const other of body.querySelectorAll<HTMLElement>(`:scope > tr > td[data-grid-col="${column}"]`)) {
    if (other === cell) continue;
    const input = captureFieldIn(other);
    const text = (input && !(input instanceof HTMLSelectElement) ? captureFieldText(input) : "").trim();
    const key = plainKey(text);
    if (!text || text.startsWith("=") || key === typed || !key.startsWith(typed) || seen.has(key)) continue;
    seen.add(key);
    found.push(text);
    if (found.length === limit) break;
  }
  return found;
}

type Offer = { field: HTMLInputElement; options: string[]; index: number; left: number; top: number; width: number };

/**
 * What a field keeps of the table it sits in. React hands its events to the
 * panel (the portal's parent), so the ones the table answers are passed on by
 * hand: the right click opens the menu of the table's cell, Enter goes to the
 * cell below (Shift+Enter, above), and what the column already holds is
 * offered while typing (Tab or Enter takes it), as in every table.
 */
function CaptureSlotContent({ element, children }: { element: HTMLElement; children: ReactNode }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const onInput = (event: FormEvent<HTMLElement>) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.type === "checkbox") return;
    const options = columnCaptureSuggestions(field);
    if (!options.length) {
      setOffer(null);
      return;
    }
    const box = field.getBoundingClientRect();
    setOffer({ field, options, index: 0, left: box.left, top: box.bottom, width: box.width });
  };
  const take = (value: string) => {
    if (!offer) return;
    writeCaptureCell(offer.field, value);
    setOffer(null);
  };
  const onContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    // The menu acts on the list when the click was on it (a state of conservation under its factor).
    event.currentTarget.parentElement?.setAttribute("data-capture-menu", event.target instanceof HTMLSelectElement ? "select" : "field");
    element.dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY, button: 2 }));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (offer && event.target === offer.field) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : offer.options.length - 1;
        setOffer({ ...offer, index: (offer.index + step) % offer.options.length });
        return;
      }
      if (event.key === "Escape") {
        setOffer(null);
        return;
      }
      // Tab or Enter takes the value offered; then Tab or Enter go on as always.
      if (event.key === "Tab" || event.key === "Enter") take(offer.options[offer.index]);
      else setOffer(null);
    }
    if (event.key !== "Enter" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.type === "checkbox") return;
    event.preventDefault();
    if (!focusCaptureCell(field, event.shiftKey ? -1 : 1)) field.blur();
  };
  // A range copied in a spreadsheet (tabs and line breaks) fills the cells from this one, as in every table.
  const onPaste = (event: ClipboardEvent<HTMLElement>) => {
    const text = event.clipboardData.getData("text/plain");
    if (!(event.target instanceof HTMLInputElement) || !/[\t\n]/.test(text.replace(/[\r\n]+$/, ""))) return;
    event.preventDefault();
    const field = event.target;
    field.blur();
    notifyCaptureWrite(pasteCaptureRange(field, parseTabularText(text)), "pegadas");
  };
  return (
    <span className="contents" onContextMenu={onContextMenu} onKeyDown={onKeyDown} onPaste={onPaste} onInput={onInput} onBlur={() => setOffer(null)}>
      {children}
      {offer ? createPortal(
        <ul
          className="fixed z-50 max-h-48 overflow-y-auto rounded-md border bg-popover py-1 text-xs text-popover-foreground shadow-md"
          style={{ left: offer.left, top: offer.top + 2, minWidth: Math.max(offer.width, 160) }}
          role="listbox"
          aria-label="Valores de la columna"
          data-column-suggestions=""
        >
          {offer.options.map((option, position) => (
            <li
              key={option}
              role="option"
              aria-selected={position === offer.index}
              className={cn("cursor-pointer px-2 py-1", position === offer.index && "bg-accent text-accent-foreground")}
              // The field keeps the focus: the click only takes the value.
              onMouseDown={(event) => {
                event.preventDefault();
                take(option);
              }}
            >
              {option}
            </li>
          ))}
          <li className="border-t px-2 pt-1 text-[10px] text-muted-foreground">Tab o Enter para usarlo</li>
        </ul>,
        document.body,
      ) : null}
    </span>
  );
}

/** The place over the whole section, at its top, where a calculation keeps in sight where the appraiser is. */
export const SECTION_TOP_SLOT = "seccion";
