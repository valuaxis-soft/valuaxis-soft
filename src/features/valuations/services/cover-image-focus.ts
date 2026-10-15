/**
 * The point of the principal cover image that stays in view when the cover
 * box crops it: a percentage per axis, as CSS object-position reads it.
 * 0 shows the left or top edge, 100 the right or bottom one.
 */
export type CoverImageFocus = { x: number; y: number };

export const COVER_IMAGE_FOCUS_CENTER: CoverImageFocus = { x: 50, y: 50 };

/** Width over height of the cover box (816px page, 32px sides, 294px tall): wider images pan sideways, taller ones up and down. */
export const COVER_BOX_RATIO = (816 - 64) / 294;

/** Which sliders move anything for an image of this ratio; both when it is unknown. */
export function coverImagePannableAxes(imageRatio: number | null): { x: boolean; y: boolean } {
  if (!imageRatio || !Number.isFinite(imageRatio)) return { x: true, y: true };
  const wider = imageRatio > COVER_BOX_RATIO + 0.01;
  const taller = imageRatio < COVER_BOX_RATIO - 0.01;
  return { x: wider, y: taller };
}

function clampAxis(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : COVER_IMAGE_FOCUS_CENTER.x;
}

/** A focus with both axes whole and inside 0–100; anything unreadable is the center. */
export function normalizeCoverImageFocus(value: unknown): CoverImageFocus {
  if (!value || typeof value !== "object") return COVER_IMAGE_FOCUS_CENTER;
  const { x, y } = value as { x?: unknown; y?: unknown };
  return { x: clampAxis(x), y: clampAxis(y) };
}

/** The CSS object-position of the cover image. */
export function coverImageObjectPosition(focus: CoverImageFocus | null | undefined) {
  const { x, y } = normalizeCoverImageFocus(focus);
  return `${x}% ${y}%`;
}
