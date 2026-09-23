/**
 * Image source normalization utilities.
 *
 * Canonical contract:
 *   - PERSISTED value = durable S3 storage key (e.g. "uploads/2026-04/uuid.jpg")
 *   - RUNTIME value   = renderable URL (signed S3 URL, relative path, data URI)
 *
 * This module provides:
 *   - extractStorageKey(): normalize any image src into its durable S3 key
 *   - isS3Source(): detect whether an image src is an S3-managed source
 */

/**
 * Extract the durable S3 storage key from any image source value.
 *
 * Returns:
 *   - the raw key if the source is already a plain key or a local path (no protocol)
 *   - the path portion of a signed S3 URL (strips query params)
 *   - the original value for non-S3 sources (relative paths, data URIs, etc.)
 *
 * This is the SINGLE centralized function for S3 key extraction.
 * Both persistence (syncImages) and hydration (resolveImageUrl) use this.
 */
export function extractStorageKey(src: string): string {
  if (!src) return "";

  // Already a plain key (no protocol prefix). Local storage hands out
  // "/uploads/..." paths: the key has no leading slash, or the loader would
  // build "//uploads/...", which browsers read as a host.
  if (!src.includes("://") && !src.startsWith("data:")) {
    return src.replace(/^\/+/, "");
  }

  // Signed S3 URL → extract key from pathname
  if (src.includes("X-Amz-Signature")) {
    try {
      const url = new URL(src);
      return url.pathname.replace(/^\/+/, "");
    } catch {
      return src;
    }
  }

  // Non-S3 URL → preserve as-is
  return src;
}

/**
 * Detect whether an image source is an S3-managed value
 * (either a storage key or a signed S3 URL).
 */
export function isS3Source(src: string): boolean {
  if (!src) return false;
  // Plain key: starts with a known S3 prefix pattern
  if (!src.includes("://") && !src.startsWith("data:") && src.includes("/")) {
    return true;
  }
  // Signed URL
  return src.includes("X-Amz-Signature");
}

/** Sections whose images are stored through a dedicated file service and referenced by id. */
const RELATION_MANAGED_IMAGE_SECTIONS = new Set(["datos", "datosGenerales"]);

/**
 * The value the editor persists for an image. Datos generales images live in
 * their own file service and are linked by id; every other section, including
 * terreno, persists the storage source so the loader can sign it again.
 */
export function imageSourceForSave(sectionId: string, image: { id: string; src: string }): string {
  return RELATION_MANAGED_IMAGE_SECTIONS.has(sectionId) ? image.id : image.src;
}
