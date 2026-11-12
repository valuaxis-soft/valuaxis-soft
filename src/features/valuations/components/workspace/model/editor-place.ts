/**
 * Where the editor was: the first block or concept at the top of its view,
 * how far below the top it sat, and the concept being typed in. Kept while
 * the editor is swapped for another view (preview, dictamen, the split
 * layouts mount their own `#valuation-form`), so coming back lands in the
 * same place instead of at the top (video 5.6, 12:14).
 */
export type EditorPlace = {
  sectionId: string;
  scrollTop: number;
  anchor: { attribute: PlaceAttribute; id: string; offset: number } | null;
  focusConceptId: string | null;
};

type PlaceAttribute = "data-concept-id" | "data-block-id";

export type PlaceCandidate = { attribute: PlaceAttribute; id: string; top: number; bottom: number };

/**
 * The element that marks the place: the first one still showing at the top
 * of the view, a concept before the block it is in. Pure.
 */
export function pickPlaceAnchor(candidates: PlaceCandidate[], viewTop: number): PlaceCandidate | null {
  const showing = candidates.filter((candidate) => candidate.bottom > viewTop);
  if (!showing.length) return null;
  const top = Math.min(...showing.map((candidate) => Math.max(candidate.top, viewTop)));
  return showing.find((candidate) => candidate.attribute === "data-concept-id" && Math.max(candidate.top, viewTop) === top)
    ?? showing.find((candidate) => Math.max(candidate.top, viewTop) === top)
    ?? null;
}

/** The scroll that puts the anchor (now at `anchorTop`) `offset` pixels below the top of the view again. Pure. */
export function scrollTopForAnchor(scrollTop: number, viewTop: number, anchorTop: number, offset: number): number {
  return Math.max(0, scrollTop + (anchorTop - viewTop) - offset);
}

const PLACE_SELECTOR = "[data-block-id], [data-concept-id]";

export function captureEditorPlace(root: HTMLElement, sectionId: string): EditorPlace {
  const view = root.getBoundingClientRect();
  const candidates: PlaceCandidate[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(PLACE_SELECTOR)) {
    const rect = element.getBoundingClientRect();
    if (rect.height === 0 || rect.top > view.bottom) continue;
    const attribute: PlaceAttribute = element.hasAttribute("data-concept-id") ? "data-concept-id" : "data-block-id";
    const id = element.getAttribute(attribute);
    if (id) candidates.push({ attribute, id, top: rect.top, bottom: rect.bottom });
  }
  const anchor = pickPlaceAnchor(candidates, view.top);
  const focused = document.activeElement instanceof HTMLElement && root.contains(document.activeElement)
    ? document.activeElement.closest<HTMLElement>("[data-concept-id]")?.getAttribute("data-concept-id") ?? null
    : null;
  return {
    sectionId,
    scrollTop: root.scrollTop,
    anchor: anchor ? { attribute: anchor.attribute, id: anchor.id, offset: anchor.top - view.top } : null,
    focusConceptId: focused,
  };
}

/** Takes the editor back to the place, and the cursor back to the concept it was in. */
export function restoreEditorPlace(root: HTMLElement, place: EditorPlace) {
  const anchor = place.anchor
    ? root.querySelector<HTMLElement>(`[${place.anchor.attribute}="${CSS.escape(place.anchor.id)}"]`)
    : null;
  root.scrollTop = anchor && place.anchor
    ? scrollTopForAnchor(root.scrollTop, root.getBoundingClientRect().top, anchor.getBoundingClientRect().top, place.anchor.offset)
    : place.scrollTop;
  if (!place.focusConceptId) return;
  const field = root
    .querySelector(`[data-concept-id="${CSS.escape(place.focusConceptId)}"]`)
    ?.querySelector<HTMLElement>("textarea, input:not([type=checkbox]):not([type=hidden]), [contenteditable=true]");
  field?.focus({ preventScroll: true });
}
