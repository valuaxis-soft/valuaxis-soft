/**
 * Canonical auto-scroll policy for editor DnD contexts.
 *
 * Prevents dnd-kit's auto-scroller from targeting:
 *   - document.scrollingElement (<html>)
 *   - document.documentElement
 *   - document.body
 *
 * These elements must never scroll during editor drag operations.
 * Internal editor scroll containers (e.g. #valuation-form) remain valid targets.
 */

export function editorCanScroll(element: Element): boolean {
  const doc = element.ownerDocument;
  if (!doc) return true;

  return !(
    element === doc.scrollingElement ||
    element === doc.documentElement ||
    element === doc.body
  );
}
