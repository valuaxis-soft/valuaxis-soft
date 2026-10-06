/**
 * The point of the principal cover image that stays in view when the cover
 * box crops it: a percentage per axis, as CSS object-position reads it.
 * 0 shows the left or top edge, 100 the right or bottom one.
 */
export type CoverImageFocus = { x: number; y: number };

export const COVER_IMAGE_FOCUS_CENTER: CoverImageFocus = { x: 50, y: 50 };

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
