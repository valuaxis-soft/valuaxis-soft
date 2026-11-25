/**
 * B-16: the copies at print resolution the PDF takes of its photos
 * (print-images.ts). Every image here is invented noise.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { needsPrintCopy, printCopy, printPixelWidth } from "../src/infrastructure/pdf/print-images";

/** A photo as stored: 1920 px wide, JPEG at 85, with the grain of a real one (invented noise). */
async function storedPhoto(width = 1920, height = 1440) {
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 7;
  for (let index = 0; index < pixels.length; index += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    pixels[index] = (index % 3 === 0 ? 90 : 140) + (seed % 60);
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
}

test("B-16: a photo two per row prints at 200 ppp, at JPEG 80, much lighter; its proportions stay", async () => {
  // A cell of the photo annex: about 3.5 in wide on a Letter page, a 4:3 photo inside it.
  const width = printPixelWidth({ boxWidth: 336, boxHeight: 252, naturalWidth: 1920, naturalHeight: 1440 });
  assert.equal(width, 700, "3.5 in × 200 ppp");
  const stored = await storedPhoto();
  const copy = await printCopy(stored, width);
  assert.ok(copy);
  const meta = await sharp(copy).metadata();
  assert.equal(meta.width, 700);
  assert.equal(meta.height, 525, "same proportions: the pages lay out alike");
  assert.ok(copy.length < stored.length / 4, `${copy.length} bytes against ${stored.length}`);
});

test("B-16: a photo the whole width keeps the pixels its size needs; a small photo or a PNG is left as it is", async () => {
  assert.equal(printPixelWidth({ boxWidth: 672, boxHeight: 504, naturalWidth: 1920, naturalHeight: 1440 }), 1400, "7 in × 200 ppp");
  // In a 16:9 frame a 4:3 photo that fits prints as wide as the frame's height allows; cropped to fill it, the frame's width.
  assert.equal(printPixelWidth({ boxWidth: 361, boxHeight: 201, naturalWidth: 800, naturalHeight: 600 }), 559);
  assert.equal(printPixelWidth({ boxWidth: 336, boxHeight: 189, naturalWidth: 1920, naturalHeight: 1440, cropped: true }), 700);
  assert.equal(await printCopy(await storedPhoto(720, 540), 700), null, "already at its print size: never enlarged nor re-encoded");
  const drawing = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#ffffff" } }).png().toBuffer();
  assert.equal(await printCopy(drawing, 700), null, "a PNG keeps its lossless file");
  assert.equal(needsPrintCopy(1920, 0), false);
});
