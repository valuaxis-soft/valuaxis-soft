import assert from "node:assert/strict";
import test from "node:test";
import {
  DevelopmentStorageProvider,
  FileValidationError,
} from "../src/infrastructure/storage/storage-provider";

const provider = new DevelopmentStorageProvider();

test("storage provider calculates deterministic checksums", () => {
  const first = provider.calculateChecksum(Buffer.from("valuo"));
  const second = provider.calculateChecksum(Buffer.from("valuo"));
  assert.equal(first, second);
});

test("storage provider rejects unsupported mime types", () => {
  assert.throws(
    () =>
      provider.validateFile(
        { name: "document.pdf", size: 10, type: "application/pdf" },
        { allowedMimeTypes: ["image/png"], maxSizeBytes: 1024 },
      ),
    FileValidationError,
  );
});

test("storage provider rejects oversized files", () => {
  assert.throws(
    () =>
      provider.validateFile(
        { name: "image.png", size: 2048, type: "image/png" },
        { allowedMimeTypes: ["image/png"], maxSizeBytes: 1024 },
      ),
    FileValidationError,
  );
});
