/**
 * The screenshot and photos the appraiser pastes for a listing before its
 * comparable exists («Buscar con IA» and «Pegar anuncio»). They come from his
 * own browser: Valuaxis never downloads a portal's pages or images.
 */
import { CLIPBOARD_IMAGE_TYPES } from "@/features/files/clipboard-image";
import { MAX_COMPARABLE_PHOTOS } from "../calculation/market-types";

/** Images chosen before the comparable exists: uploaded right after it is saved, the photos in their order. */
export type PendingImages = { screenshot: File | null; photos: File[] };

export const NO_IMAGES: PendingImages = { screenshot: null, photos: [] };

export const imageCount = (images: PendingImages | undefined) => (images ? (images.screenshot ? 1 : 0) + images.photos.length : 0);

/**
 * The images added to what was there: the first goes as the «Pantalla de
 * referencia» while there is none, the rest as photos, up to the ten a
 * comparable keeps. A file that is not a JPG, PNG or WebP is left out.
 */
export function addListingImages(current: PendingImages, files: File[]): { images: PendingImages; rejected: number; overflow: number } {
  const usable = files.filter((file) => CLIPBOARD_IMAGE_TYPES.includes(file.type));
  let screenshot = current.screenshot;
  const photos = [...current.photos];
  let overflow = 0;
  for (const file of usable) {
    if (!screenshot) screenshot = file;
    else if (photos.length < MAX_COMPARABLE_PHOTOS) photos.push(file);
    else overflow += 1;
  }
  return { images: { screenshot, photos }, rejected: files.length - usable.length, overflow };
}

/** A photo becomes the screenshot, and the screenshot there was, the first photo. */
export function promoteToScreenshot(current: PendingImages, photoIndex: number): PendingImages {
  const chosen = current.photos[photoIndex];
  if (!chosen) return current;
  const rest = current.photos.filter((_, position) => position !== photoIndex);
  return { screenshot: chosen, photos: current.screenshot ? [current.screenshot, ...rest] : rest };
}

/**
 * Uploads the images of a comparable just created, the screenshot first and
 * then the photos in their order, one at a time. One that fails does not stop
 * the others; the answer says how many went up and the first failure.
 */
export async function uploadListingImages<T>(
  images: PendingImages,
  upload: { screenshot: (file: File) => Promise<T>; photo: (file: File) => Promise<T> },
): Promise<{ uploaded: number; failed: number; firstError: unknown; latest: T | null }> {
  const steps = [
    ...(images.screenshot ? [() => upload.screenshot(images.screenshot as File)] : []),
    ...images.photos.map((file) => () => upload.photo(file)),
  ];
  let uploaded = 0;
  let failed = 0;
  let firstError: unknown = null;
  let latest: T | null = null;
  for (const step of steps) {
    try {
      latest = await step();
      uploaded += 1;
    } catch (error) {
      failed += 1;
      firstError ??= error;
    }
  }
  return { uploaded, failed, firstError, latest };
}
