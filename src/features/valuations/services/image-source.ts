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
 *   - the raw key if the source is already a plain key (no protocol)
 *   - the path portion of a signed S3 URL (strips query params)
 *   - the original value for non-S3 sources (relative paths, data URIs, etc.)
 *
 * This is the SINGLE centralized function for S3 key extraction.
 * Both persistence (syncImages) and hydration (resolveImageUrl) use this.
 */
export function extractStorageKey(src: string): string {
  if (!src) return "";

  // Already a plain S3 key (no protocol prefix)
  if (!src.includes("://") && !src.startsWith("data:")) {
    return src;
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
