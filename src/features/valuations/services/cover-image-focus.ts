/**
 * The point of the principal cover image that stays in view when the cover
 * box crops it: a percentage per axis, as CSS object-position reads it.
 * 0 shows the left or top edge, 100 the right or bottom one.
 */
export type CoverImageFocus = { x: number; y: number };

export const COVER_IMAGE_FOCUS_CENTER: CoverImageFocus = { x: 50, y: 50 };

/** Width over height of the cover box (816px page, 32px sides, 294px tall): wider images pan sideways, taller ones up and down. */
export const COVER_BOX_RATIO = (816 - 64) / 294;

/**
 * How big the principal image shows in the cover box. "cover" fills the box
 * and crops what is left over, as the cover always printed; "contain" shows
 * the whole image (a vehicle, a machine) over a neutral background. The scale,
 * in percent, makes it smaller or larger from there, around the focus.
 */
export type CoverImageFit = "cover" | "contain";
export type CoverImageSize = { fit: CoverImageFit; scale: number };

/** A cover that never chose a size: it fills the box, as before the size existed. */
export const DEFAULT_COVER_IMAGE_SIZE: CoverImageSize = { fit: "cover", scale: 100 };

export const COVER_IMAGE_SCALE = { min: 50, max: 200, step: 5 } as const;

/** A size with a known fit and a whole scale inside the limits; anything unreadable is the default. */
export function normalizeCoverImageSize(value: unknown): CoverImageSize {
  if (!value || typeof value !== "object") return DEFAULT_COVER_IMAGE_SIZE;
  const { fit, scale } = value as { fit?: unknown; scale?: unknown };
  return {
    fit: fit === "contain" ? "contain" : "cover",
    scale: typeof scale === "number" && Number.isFinite(scale)
      ? Math.min(COVER_IMAGE_SCALE.max, Math.max(COVER_IMAGE_SCALE.min, Math.round(scale)))
      : DEFAULT_COVER_IMAGE_SIZE.scale,
  };
}

export function isDefaultCoverImageSize(value: unknown) {
  const size = normalizeCoverImageSize(value);
  return size.fit === DEFAULT_COVER_IMAGE_SIZE.fit && size.scale === DEFAULT_COVER_IMAGE_SIZE.scale;
}

/**
 * Which sliders move anything for an image of this ratio and size; both when
 * the ratio is unknown. Filling the box, only the side that overflows moves;
 * whole, only the side with room left; scaled, both (the focus is the point the
 * image grows or shrinks around).
 */
export function coverImagePannableAxes(imageRatio: number | null, size: CoverImageSize = DEFAULT_COVER_IMAGE_SIZE): { x: boolean; y: boolean } {
  if (!imageRatio || !Number.isFinite(imageRatio) || size.scale !== 100) return { x: true, y: true };
  const wider = imageRatio > COVER_BOX_RATIO + 0.01;
  const taller = imageRatio < COVER_BOX_RATIO - 0.01;
  return size.fit === "contain" ? { x: taller, y: wider } : { x: wider, y: taller };
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

/**
 * The CSS of the cover image for its focus and size, the same in the preview,
 * the editor and the printed dictamen. The box keeps its height: a scale only
 * transforms the image, so the page lays out as before.
 */
export function coverImageStyle(focus: CoverImageFocus | null | undefined, size?: CoverImageSize | null) {
  const { fit, scale } = normalizeCoverImageSize(size);
  const objectPosition = coverImageObjectPosition(focus);
  return {
    objectFit: fit,
    objectPosition,
    ...(scale === 100 ? {} : { transform: `scale(${scale / 100})`, transformOrigin: objectPosition }),
  } as const;
}
