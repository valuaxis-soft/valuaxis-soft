/**
 * What an uploaded image really is, read from its content (sharp's format),
 * and why one of another kind is refused. Pure, without the server's
 * configuration, so it can be tested on its own.
 */

export const MIME_BY_SHARP_FORMAT: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

const FORMAT_NAMES: Record<string, string> = {
  jpeg: "JPG", png: "PNG", webp: "WebP", gif: "GIF", heif: "HEIC/HEIF", avif: "AVIF", tiff: "TIFF", svg: "SVG", jp2: "JPEG 2000",
};

/**
 * Why an image whose content is not of the accepted kinds is rejected, in
 * words the appraiser can act on: renaming the file does not convert it.
 */
export function imageContentProblem(format: string | undefined, allowedMimeTypes: string[]): string {
  const accepted = allowedMimeTypes
    .map((type) => FORMAT_NAMES[Object.keys(MIME_BY_SHARP_FORMAT).find((key) => MIME_BY_SHARP_FORMAT[key] === type) ?? ""])
    .filter(Boolean)
    .join(", ");
  const actual = format ? FORMAT_NAMES[format] ?? format.toUpperCase() : null;
  const iphone = format === "heif" ? " (el formato de las fotos de iPhone)" : "";
  return actual
    ? `La imagen es ${actual}${iphone} aunque su nombre diga otra cosa; se aceptan ${accepted}. Cambiar la extensión no la convierte: ábrela y guárdala o expórtala como JPG o PNG.`
    : `El archivo no es una imagen ${accepted}. Ábrelo y guárdalo como JPG o PNG.`;
}
