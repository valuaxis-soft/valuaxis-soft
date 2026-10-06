/**
 * The address the browser uses for a stored image. A signed storage URL lasts
 * minutes, and an editor stays open for hours: images went blank and had to
 * be uploaded again. This address does not expire; the route behind it checks
 * the session and redirects to a freshly signed URL every time.
 */
export const STORED_IMAGE_ROUTE = "/api/archivos/imagen";

export function storedImageUrl(key: string) {
  return `${STORED_IMAGE_ROUTE}?key=${encodeURIComponent(key)}`;
}

/** The storage key of an address built by `storedImageUrl`, relative or absolute; null for anything else. */
export function keyFromStoredImageUrl(src: string): string | null {
  const start = src.indexOf(`${STORED_IMAGE_ROUTE}?`);
  if (start === -1) return null;
  if (start !== 0 && !/^https?:\/\/[^/]+$/.test(src.slice(0, start))) return null;
  const key = new URLSearchParams(src.slice(start + STORED_IMAGE_ROUTE.length + 1)).get("key");
  return key || null;
}
