import assert from "node:assert/strict";
import test from "node:test";
import { imageSourceForSave } from "../src/features/valuations/services/image-source";

const image = { id: "img-123", src: "uploads/2026-09/0b7c.jpg" };

test("terreno images persist their storage source, not a random id", () => {
  assert.equal(imageSourceForSave("terreno", image), "uploads/2026-09/0b7c.jpg");
});

test("datos generales images are linked through their file service by id", () => {
  assert.equal(imageSourceForSave("datos", image), "img-123");
  assert.equal(imageSourceForSave("datosGenerales", image), "img-123");
});

test("any other section persists the storage source", () => {
  assert.equal(imageSourceForSave("fotografias", image), "uploads/2026-09/0b7c.jpg");
});
