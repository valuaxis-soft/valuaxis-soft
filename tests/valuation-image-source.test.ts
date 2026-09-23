import assert from "node:assert/strict";
import { test } from "node:test";
import { extractStorageKey, isS3Source } from "../src/features/valuations/services/image-source";

test("a plain key stays as is", () => {
  assert.equal(extractStorageKey("uploads/2026-09/a.jpg"), "uploads/2026-09/a.jpg");
});

test("a local storage path loses its leading slash, so it is not read as a host later", () => {
  assert.equal(extractStorageKey("/uploads/2026-09/a.jpg"), "uploads/2026-09/a.jpg");
  assert.equal(extractStorageKey("//uploads/2026-09/a.jpg"), "uploads/2026-09/a.jpg");
});

test("a signed S3 URL gives back its key", () => {
  const signed = "https://bucket.s3.amazonaws.com/uploads/2026-09/a.jpg?X-Amz-Signature=abc&X-Amz-Expires=900";
  assert.equal(extractStorageKey(signed), "uploads/2026-09/a.jpg");
  assert.equal(isS3Source(signed), true);
});

test("data URIs and other URLs are kept", () => {
  assert.equal(extractStorageKey("data:image/png;base64,AAA"), "data:image/png;base64,AAA");
  assert.equal(extractStorageKey("https://example.com/a.jpg"), "https://example.com/a.jpg");
  assert.equal(isS3Source("https://example.com/a.jpg"), false);
});
