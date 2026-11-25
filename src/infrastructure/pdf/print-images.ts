/**
 * Print-resolution photos for the PDF (dictamen review 14-nov, B-16). A
 * stored photo is up to 1920 px wide; on the page it takes a few inches, so
 * most of its pixels only weigh on the file. The renderer measures where each
 * photo prints and serves the PDF a copy at PRINT_PPI, re-encoded at
 * PRINT_JPEG_QUALITY. The stored original is never touched.
 */
import sharp from "sharp";
import { env } from "@/lib/env";
import type { StorageConfig } from "@/infrastructure/storage/storage";

/** The resolution a photo prints at: within the 150–200 ppp a printed report needs. */
export const PRINT_PPI = 200;
export const PRINT_JPEG_QUALITY = 80;
/** CSS pixels per inch: the unit the page is laid out in. */
const CSS_PX_PER_INCH = 96;
/** A photo is left as it is unless the copy saves more than this share of its pixels' width. */
const MIN_REDUCTION = 1.1;
/** The heaviest photo read again for its copy: no upload is heavier. */
export const MAX_PRINT_COPY_BYTES = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
/** Photos read again at a time. */
const PRINT_COPY_CONCURRENCY = 4;

/** Where an image prints: its box on the page (CSS px, 96 per inch on the Letter page), the file's own size, and whether it fills the box cropped (object-fit: cover). */
export type PlacedImage = { boxWidth: number; boxHeight: number; naturalWidth: number; naturalHeight: number; cropped?: boolean };

/**
 * The width in pixels the file needs to print at PRINT_PPI. A photo that fits
 * in its frame prints as wide as the narrower of the frame's width and the
 * width its height allows; one cropped to fill it, the wider.
 */
export function printPixelWidth(image: PlacedImage): number {
  const heightAsWidth = image.naturalHeight ? (image.boxHeight * image.naturalWidth) / image.naturalHeight : image.boxWidth;
  const printed = image.cropped ? Math.max(image.boxWidth, heightAsWidth) : Math.min(image.boxWidth, heightAsWidth);
  return Math.ceil((printed * PRINT_PPI) / CSS_PX_PER_INCH);
}

/** Whether a copy at that width is worth making: never larger than the file, and only when it is much smaller. */
export function needsPrintCopy(naturalWidth: number, width: number) {
  return width > 0 && naturalWidth > width * MIN_REDUCTION;
}

/**
 * The JPEG photo at `width` pixels, same proportions, JPEG at
 * PRINT_JPEG_QUALITY; null for anything that is not a JPEG (a PNG or a GIF
 * keeps its lossless file) or when the copy would not be lighter. Uploads are
 * stored as JPEG, so photos, croquis and map captures all get their copy.
 */
export async function printCopy(file: Buffer, width: number): Promise<Buffer | null> {
  const image = sharp(file, { failOn: "none" });
  const { format, width: naturalWidth = 0 } = await image.metadata();
  if (format !== "jpeg" || !needsPrintCopy(naturalWidth, width)) return null;
  const copy = await image.rotate().resize({ width, withoutEnlargement: true }).jpeg({ quality: PRINT_JPEG_QUALITY, mozjpeg: true }).toBuffer();
  return copy.length < file.length ? copy : null;
}

/**
 * Whether the renderer may read a photo again on the server (S-2): only from
 * this app (`appUrl`) or from the bucket its stored images are served from.
 * Any other address is left to the browser, as it loaded it.
 */
export function readableForPrintCopy(src: string, appUrl: string, s3?: StorageConfig["s3"]) {
  const url = new URL(src);
  if (url.origin === new URL(appUrl).origin) return true;
  if (!s3?.bucket) return false;
  if (s3.endpoint) {
    const endpoint = new URL(s3.endpoint);
    return url.protocol === endpoint.protocol
      && ((url.host === endpoint.host && url.pathname.startsWith(`/${s3.bucket}/`)) || url.host === `${s3.bucket}.${endpoint.host}`);
  }
  return url.protocol === "https:" && [`${s3.bucket}.s3.${s3.region}.amazonaws.com`, `${s3.bucket}.s3.amazonaws.com`].includes(url.host);
}

/**
 * The print copies of the photos (src → width), read with `read` a few at a
 * time and all within `budgetMs`: a photo unreadable, heavier than
 * MAX_PRINT_COPY_BYTES or left when the time is up prints as stored.
 */
export async function printCopies(
  wanted: ReadonlyArray<readonly [src: string, width: number]>,
  read: (src: string, timeoutMs: number) => Promise<Buffer | null>,
  budgetMs: number,
): Promise<Map<string, Buffer>> {
  const queue = [...wanted];
  const until = Date.now() + budgetMs;
  const copies = new Map<string, Buffer>();
  await Promise.all(Array.from({ length: PRINT_COPY_CONCURRENCY }, async () => {
    for (let next = queue.shift(); next && Date.now() < until; next = queue.shift()) {
      const [src, width] = next;
      const file = await read(src, until - Date.now()).catch(() => null);
      const copy = file && file.length <= MAX_PRINT_COPY_BYTES ? await printCopy(file, width).catch(() => null) : null;
      if (copy) copies.set(src, copy);
    }
  }));
  return copies;
}
