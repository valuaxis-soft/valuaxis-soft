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
 * The one message of every upload of an image (cover, comparables, editor,
 * logo…) whose file is not an image the server takes: what it must be and
 * what to do with a photo of the iPhone, the usual case (video 5.5).
 */
export const NOT_AN_IMAGE_MESSAGE = "El archivo no es una imagen JPG, PNG o WebP. Si es una foto del iPhone (HEIC), ábrela y expórtala como JPG.";

/**
 * Why an image whose content is not of the accepted kinds is rejected, in
 * words the appraiser can act on: the same message as every upload, and,
 * when its real kind is known, that renaming the file does not convert it.
 */
export function imageContentProblem(format: string | undefined): string {
  const actual = format ? FORMAT_NAMES[format] ?? format.toUpperCase() : null;
  if (!actual) return NOT_AN_IMAGE_MESSAGE;
  const [first, ...rest] = NOT_AN_IMAGE_MESSAGE.split(". ");
  return `${first}: es ${actual}, y cambiarle la extensión no la convierte. ${rest.join(". ")}`;
}
