/**
 * Images taken from the clipboard: a screenshot pasted with Ctrl+V or read
 * with «Pegar del portapapeles». Shared by every place that takes a photo
 * (the comparable's photos and screenshot, the cover, the editor's images) so
 * they all paste the same way.
 */
import type { ChangeEvent } from "react";

/** The image types the server stores; the clipboard's PNG of a screenshot is one of them. */
export const CLIPBOARD_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const fileOf = (blob: Blob, type: string, baseName: string, index: number) =>
  new File([blob], `${baseName}${index ? `-${index + 1}` : ""}.${type.split("/")[1]}`, { type });

/** The images of a paste event, named after what they are ("pantalla-de-referencia.png"); none when it carries only text. */
export function pastedImages(items: DataTransferItemList | ArrayLike<DataTransferItem> | null, baseName: string): File[] {
  const files: File[] = [];
  for (const item of Array.from(items ?? [])) {
    if (item.kind !== "file" || !CLIPBOARD_IMAGE_TYPES.includes(item.type)) continue;
    const file = item.getAsFile();
    if (file) files.push(fileOf(file, item.type, baseName, files.length));
  }
  return files;
}

/** The browser did not let the page read the clipboard (permission, or an old browser). */
export class ClipboardUnavailableError extends Error {}

/** The images on the clipboard, read through the async clipboard API; none when it holds no image. */
export async function readClipboardImages(baseName: string): Promise<File[]> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.read) throw new ClipboardUnavailableError();
  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new ClipboardUnavailableError();
  }
  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find((candidate) => CLIPBOARD_IMAGE_TYPES.includes(candidate));
    if (type) files.push(fileOf(await item.getType(type), type, baseName, files.length));
  }
  return files;
}

/**
 * Pasted files handed to an upload handler written for a file input, which
 * reads `event.target.files` and clears `event.target.value`.
 */
export function filesAsChangeEvent(files: File[]): ChangeEvent<HTMLInputElement> {
  const target = { files: Object.assign([...files], { item: (index: number) => files[index] ?? null }), value: "" };
  return { target, currentTarget: target } as unknown as ChangeEvent<HTMLInputElement>;
}
