/**
 * The address the browser keeps for a stored image does not expire, and the
 * editor turns it back into the storage key when it saves.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { keyFromStoredImageUrl, storedImageUrl } from "../src/features/files/services/stored-image-url";
import { extractStorageKey, imageSourceForSave, isS3Source } from "../src/features/valuations/services/image-source";

const key = "organizaciones/0b1c/avaluos/9f2e/caratula/imagen-principal/7a.jpg";

test("a stored image address carries its key and no signature", () => {
  const url = storedImageUrl(key);
  assert.equal(url, `/api/archivos/imagen?key=${encodeURIComponent(key)}`);
  assert.doesNotMatch(url, /X-Amz|Expires/);
  assert.equal(keyFromStoredImageUrl(url), key);
  assert.equal(keyFromStoredImageUrl(`https://valuaxissoft.com${url}`), key);
  assert.equal(keyFromStoredImageUrl(`${url}&v=2`), key);
});

test("only this app's image address is read as one", () => {
  for (const other of ["", key, `/${key}`, "/api/archivos/imagen", "/api/archivos/imagen?key=", "data:image/png;base64,AAAA",
    "https://bucket.s3.amazonaws.com/a/b.jpg?X-Amz-Signature=1", "https://evil.test/x?next=/api/archivos/imagen?key=a/b.jpg"]) {
    assert.equal(keyFromStoredImageUrl(other), null, other);
  }
});

test("saving stores the key, whatever address the editor holds", () => {
  const stable = storedImageUrl(key);
  assert.equal(extractStorageKey(stable), key);
  assert.equal(extractStorageKey(`https://valuaxissoft.com${stable}`), key);
  assert.equal(isS3Source(stable), true);
  // The addresses from before still resolve to the same key.
  assert.equal(extractStorageKey(`https://bucket.s3.us-east-1.amazonaws.com/${key}?X-Amz-Signature=abc&X-Amz-Expires=900`), key);
  assert.equal(extractStorageKey(key), key);
  assert.equal(extractStorageKey(`/${key}`), key);
  assert.equal(imageSourceForSave("terreno", { id: "i1", src: stable }), stable);
});

test("keys with characters that need escaping survive the round trip", () => {
  const odd = "uploads/2026-10/a b+c&d=e.jpg";
  assert.equal(keyFromStoredImageUrl(storedImageUrl(odd)), odd);
});
