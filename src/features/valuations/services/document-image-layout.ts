import type { ImageContent } from "@/features/valuations/model";

export const IMAGE_WIDTH_MIN = 25;
export const IMAGE_WIDTH_MAX = 100;
export const IMAGE_WIDTH_STEP = 5;

export const IMAGE_WIDTH_PRESETS = {
  normal: 70,
  wide: 88,
  full: 100,
} as const;

export function resolveImageWidthPercent(image: ImageContent) {
  if (typeof image.layoutWidthPercent === "number" && Number.isFinite(image.layoutWidthPercent)) {
    return clampImageWidthPercent(image.layoutWidthPercent);
  }
  return IMAGE_WIDTH_PRESETS[image.layoutWidth ?? "normal"];
}

export function clampImageWidthPercent(value: number) {
  return Math.min(IMAGE_WIDTH_MAX, Math.max(IMAGE_WIDTH_MIN, Math.round(value)));
}

export function imageLayoutWidthForPercent(value: number): ImageContent["layoutWidth"] {
  if (value >= IMAGE_WIDTH_PRESETS.full) return "full";
  if (value >= IMAGE_WIDTH_PRESETS.wide) return "wide";
  return "normal";
}

/**
 * An image uploaded in place of another («Reemplazar», or the empty frame of
 * a template, as the subject's photographs): it takes the place, the name
 * and the width of the one it replaces; in an empty frame never sized, the
 * whole width, as any new image (video 8.14, 30:44: «las imágenes por default
 * ancho completo 100%»).
 */
export function replacedImage(current: ImageContent, uploaded: ImageContent): ImageContent {
  const sized = Boolean(current.src) || current.layoutWidth !== undefined || current.layoutWidthPercent !== undefined;
  return {
    ...uploaded,
    id: current.id,
    title: current.title || uploaded.title,
    layoutWidth: sized ? current.layoutWidth : "full",
    layoutWidthPercent: sized ? current.layoutWidthPercent : undefined,
  };
}
