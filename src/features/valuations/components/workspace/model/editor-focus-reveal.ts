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
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
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
