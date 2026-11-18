"use client";

import { useEffect } from "react";

/**
 * Chrome's suggestions do not belong in the editor (video 7.3, 3:10 and 8:15:
 * a black balloon with «1», «4» or «350/800» under a concept or a filter): a
 * concept or a figure is a datum of this valuation, not something to repeat
 * from the last one. Every text field of the editor says `autocomplete="off"`,
 * the value Chrome honours for the history of what was typed in a field.
 */
const NO_AUTOFILL = "off";

/** Fields that take typing: a field that already says what it wants (a password, an e-mail) is left as it is. */
const TYPED_FIELDS = 'input:not([autocomplete]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):not([type="range"]):not([type="color"]):not([type="button"]):not([type="submit"]), textarea:not([autocomplete])';

/** Turns Chrome's suggestions off in every text field under `root` (and in `root` itself) that has no autocomplete of its own. */
function withoutAutofill(root: Element | Document) {
  const fields = root instanceof Element && root.matches(TYPED_FIELDS) ? [root] : [];
  for (const field of [...fields, ...root.querySelectorAll(TYPED_FIELDS)]) field.setAttribute("autocomplete", NO_AUTOFILL);
}

/**
 * While the editor is open, every text field shown (the editor's, and those
 * of its dialogs and menus, which open outside it) gets `autocomplete="off"`
 * as it appears, also the raw inputs of the tables and the panels.
 */
export function useNoAutofill() {
  useEffect(() => {
    withoutAutofill(document);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) withoutAutofill(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}
