"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { CapturePages } from "@/features/valuations/calculation/capture-display";
import { focusCaptureCell } from "../calculation/calc-table-context-menu";

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
  | { table: string; part: "footer" };

/** The key of a place; ids are compared in lower case, as they come back saved. */
export function captureSlotKey(address: CaptureAddress): string {
  const parts = "column" in address ? ["cell", address.row, address.column]
    : "row" in address ? ["row", address.row]
      : "box" in address ? ["box", address.box]
        : [address.part];
  return [address.table, ...parts].join("|").toLowerCase();
}

type Listener = () => void;

/** What the panel declared and where the tables left room for it, for one section of the editor. */
export class CaptureStore {
  private declared = new Map<string, number>();
  private elements = new Map<string, HTMLElement>();
  private listeners = new Set<Listener>();
  private current: CapturePages | null = null;

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

/**
 * What a field keeps of the table it sits in. React hands its events to the
 * panel (the portal's parent), so the two the table answers are passed on by
 * hand: the right click opens the menu of the table's cell, and Enter goes
 * to the cell below (Shift+Enter, above), as in every table.
 */
function CaptureSlotContent({ element, children }: { element: HTMLElement; children: ReactNode }) {
  const onContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    element.dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY, button: 2 }));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.type === "checkbox") return;
    event.preventDefault();
    if (!focusCaptureCell(field, event.shiftKey ? -1 : 1)) field.blur();
  };
  return (
    <span className="contents" onContextMenu={onContextMenu} onKeyDown={onKeyDown}>
      {children}
    </span>
  );
}
