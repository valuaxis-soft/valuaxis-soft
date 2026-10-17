/**
 * The caption lines of a document image and its rotation.
 *
 * An image carries any number of caption lines, each above or below it, in
 * the order the appraiser gives them. Images saved with the single caption of
 * before (`captionText`, `captionEnabled`, `captionPosition`, `captionAlign`)
 * read as one line; the first line is still written to those fields, so a
 * document keeps its caption for whatever reads only them.
 *
 * Pure TypeScript — no React, no side effects.
 */
import type { ImageCaption, ImageCaptionAlign, ImageCaptionPosition, ImageContent, ImageRotation } from "../model";

const POSITIONS: readonly ImageCaptionPosition[] = ["top", "bottom"];
const ALIGNS: readonly ImageCaptionAlign[] = ["left", "center", "right"];
const ROTATIONS: readonly ImageRotation[] = [0, 90, 180, 270];

/** The caption lines as the editor shows them, the single caption of before included. */
export function imageCaptions(image: Pick<ImageContent, "captions" | "captionEnabled" | "captionText" | "captionPosition" | "captionAlign">): ImageCaption[] {
  if (image.captions) return image.captions;
  if (!image.captionEnabled) return [];
  return [{
    id: "caption-1",
    text: image.captionText ?? "",
    position: image.captionPosition ?? "bottom",
    align: image.captionAlign ?? "center",
  }];
}

/** The lines that print, in order: the ones with text. */
export function printedImageCaptions(image: Parameters<typeof imageCaptions>[0], position: ImageCaptionPosition): ImageCaption[] {
  return imageCaptions(image).filter((caption) => caption.position === position && caption.text.trim());
}

/** The patch that stores these lines; the first one also fills the fields of the single caption. */
export function captionsPatch(captions: ImageCaption[]): Partial<ImageContent> {
  const [first] = captions;
  return {
    captions,
    captionEnabled: Boolean(first),
    captionText: first?.text ?? "",
    captionPosition: first?.position ?? "bottom",
    captionAlign: first?.align ?? "center",
  };
}

export function newCaption(captions: ImageCaption[], position: ImageCaptionPosition = "bottom"): ImageCaption {
  const taken = new Set(captions.map((caption) => caption.id));
  let index = captions.length + 1;
  while (taken.has(`caption-${index}`)) index += 1;
  return { id: `caption-${index}`, text: "", position, align: "center" };
}

/** The lines with one moved a place up (-1) or down (1); unchanged at either end. */
export function moveCaption(captions: ImageCaption[], captionId: string, direction: -1 | 1): ImageCaption[] {
  const from = captions.findIndex((caption) => caption.id === captionId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= captions.length) return captions;
  const next = [...captions];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Caption lines read from stored configuration; undefined when it has none (an image of before). */
export function readStoredCaptions(value: unknown): ImageCaption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry, index): ImageCaption[] => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.text !== "string") return [];
    const position = POSITIONS.find((candidate) => candidate === record.position) ?? "bottom";
    const align = ALIGNS.find((candidate) => candidate === record.align) ?? "center";
    const id = typeof record.id === "string" && record.id ? record.id : `caption-${index + 1}`;
    return [{ id, text: record.text.slice(0, 500), position, align }];
  });
}

/** A quarter turn more, clockwise. */
export function nextRotation(rotation: ImageRotation | undefined): ImageRotation {
  return (((rotation ?? 0) + 90) % 360) as ImageRotation;
}

export function readStoredRotation(value: unknown): ImageRotation | undefined {
  return ROTATIONS.find((rotation) => rotation === value);
}

/** The image lies on its side: its width and height swap on the page. */
export const isQuarterTurn = (rotation: ImageRotation | undefined) => rotation === 90 || rotation === 270;
