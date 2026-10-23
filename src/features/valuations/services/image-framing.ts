import type { CSSProperties } from "react";

import {
  COVER_IMAGE_FOCUS_CENTER,
  coverImageStyle,
  normalizeCoverImageFocus,
  normalizeCoverImageSize,
  type CoverImageFocus,
  type CoverImageSize,
} from "./cover-image-focus";

/**
 * How a document image sits inside its frame, with the same model as the
 * principal cover image: the point kept in view (focus) and the size (fill
 * the frame or show the whole image, and a zoom). A vertical photo in the
 * annex's landscape frame can fill it and be moved up or down.
 */
export type ImageFraming = { focus: CoverImageFocus; size: CoverImageSize };

/**
 * The tallest a lone image prints (a plan, a vertical photo): with its block
 * title and captions it fits the page, instead of running off its foot.
 */
export const LONE_IMAGE_MAX_HEIGHT_PX = 600;

/** Width over height of the frame of images that share a row (photo annexes). */
export const PAIRED_IMAGE_FRAME_RATIO = 16 / 9;

/** An image that never chose a framing: whole, centered, as images always printed. */
export const DEFAULT_IMAGE_SIZE: CoverImageSize = { fit: "contain", scale: 100 };
export const DEFAULT_IMAGE_FRAMING: ImageFraming = { focus: COVER_IMAGE_FOCUS_CENTER, size: DEFAULT_IMAGE_SIZE };

/** The framing of an image, the default when it has none or it is unreadable. */
export function resolveImageFraming(framing: unknown): ImageFraming {
  if (!framing || typeof framing !== "object") return DEFAULT_IMAGE_FRAMING;
  const { focus, size } = framing as { focus?: unknown; size?: unknown };
  const fit = size && typeof size === "object" && (size as { fit?: unknown }).fit === "cover" ? "cover" : "contain";
  return {
    focus: normalizeCoverImageFocus(focus),
    size: { ...normalizeCoverImageSize(size), fit },
  };
}

export function isDefaultImageFraming(framing: unknown) {
  const { focus, size } = resolveImageFraming(framing);
  return focus.x === COVER_IMAGE_FOCUS_CENTER.x && focus.y === COVER_IMAGE_FOCUS_CENTER.y &&
    size.fit === DEFAULT_IMAGE_SIZE.fit && size.scale === DEFAULT_IMAGE_SIZE.scale;
}

/** A framing read from stored configuration; undefined when there is none or it is the default (an image of before). */
export function readStoredImageFraming(value: unknown): ImageFraming | undefined {
  if (!value || typeof value !== "object" || isDefaultImageFraming(value)) return undefined;
  return resolveImageFraming(value);
}

/** The CSS of the image inside its frame: the cover's, so both behave the same. */
export function imageFramingStyle(framing: unknown): CSSProperties {
  const { focus, size } = resolveImageFraming(framing);
  return coverImageStyle(focus, size);
}

/** The zoom of the framing, to add to a transform the image already has (a turn). */
export function imageFramingScale(framing: unknown) {
  return resolveImageFraming(framing).size.scale / 100;
}
