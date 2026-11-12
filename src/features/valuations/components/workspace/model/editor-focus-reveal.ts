import type { EditorFocus } from "./editor-history";

/** How long the changed field stays lit after an undo or a redo. */
const HIGHLIGHT_MS = 1600;

const attribute = (name: string, value: string) => `[${name}="${CSS.escape(value)}"]`;

/** The element of the editor that shows the change: the cell, the table, the concept or the block, the most precise one there is. */
export function findEditorFocusElement(root: ParentNode, focus: EditorFocus): HTMLElement | null {
  const candidates = [
    focus.tableId && focus.rowId && focus.columnId
      ? `${attribute("data-table-cell", focus.tableId)}${attribute("data-row-id", focus.rowId)}${attribute("data-column-id", focus.columnId)}`
      : null,
    focus.tableId ? attribute("data-table-editor", focus.tableId) : null,
    focus.conceptId ? attribute("data-concept-id", focus.conceptId) : null,
    focus.blockId ? attribute("data-block-id", focus.blockId) : null,
  ];
  for (const selector of candidates) {
    if (!selector) continue;
    const element = root.querySelector<HTMLElement>(selector);
    // A cell lights up whole, not only its text box.
    if (element) return element.closest<HTMLElement>("td") ?? element;
  }
  return null;
}

/** What a scroller shows and where an element sits, in viewport pixels. */
type RevealGeometry = { scrollTop: number; viewTop: number; viewHeight: number; elementTop: number; elementHeight: number };

/**
 * The scroll position that shows the element: centered, or ("nearest") only
 * as far as needed to bring it into view. Pure.
 */
export function scrollTopToReveal(geometry: RevealGeometry, block: "center" | "nearest"): number {
  const { scrollTop, viewTop, viewHeight, elementTop, elementHeight } = geometry;
  const offset = elementTop - viewTop;
  if (block === "center") return Math.max(0, scrollTop + offset - (viewHeight - elementHeight) / 2);
  if (offset < 0) return Math.max(0, scrollTop + offset);
  if (offset + elementHeight > viewHeight) return scrollTop + Math.min(offset, offset + elementHeight - viewHeight);
  return scrollTop;
}

const scrollsVertically = (element: HTMLElement) => {
  const { overflowY } = getComputedStyle(element);
  return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight;
};

/**
 * Scrolls the element into view moving only the scrollers between it and
 * the editor's (`#valuation-form`), the editor's included. scrollIntoView
 * also moved the page and the workspace around the editor, so the top bar
 * left the screen with Ctrl+Z (video 5.6, 3:15).
 */
export function revealInEditor(element: HTMLElement, block: "center" | "nearest", behavior: ScrollBehavior = "smooth") {
  // Outside the editor (a panel of its own), only the closest scroller moves.
  const root = element.closest<HTMLElement>("#valuation-form");
  for (let scroller = element.parentElement; scroller; scroller = scroller.parentElement) {
    const isRoot = scroller === root;
    if (!isRoot && !scrollsVertically(scroller)) continue;
    const view = scroller.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const top = scrollTopToReveal(
      { scrollTop: scroller.scrollTop, viewTop: view.top, viewHeight: scroller.clientHeight, elementTop: rect.top, elementHeight: rect.height },
      block,
    );
    if (top !== scroller.scrollTop) scroller.scrollTo({ top, behavior });
    if (isRoot || !root) break;
  }
}

/**
 * Brings the editor to where an undo or a redo changed the document and
 * lights it up for a moment. It waits for the section's tab to render when
 * the change is in another one.
 */
export function revealEditorFocus(focus: EditorFocus) {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      const root = document.getElementById("valuation-form");
      const element = root ? findEditorFocusElement(root, focus) : null;
      if (!element) return;
      revealInEditor(element, "center");
      element.animate?.(
        [
          { boxShadow: "inset 0 0 0 2px rgb(245 158 11)", backgroundColor: "rgb(254 243 199 / 0.9)" },
          { boxShadow: "inset 0 0 0 2px rgb(245 158 11 / 0)", backgroundColor: "rgb(254 243 199 / 0)" },
        ],
        { duration: HIGHLIGHT_MS, easing: "ease-out" },
      );
    });
  }, 60);
}
