import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DocumentImage } from "../src/features/valuations/components/document-image";
import { ImageEditorItem } from "../src/features/valuations/components/editor/image-editor";
import { hydrateImageMetadata, imageMetadataFromContent } from "../src/features/valuations/metadata";
import type { ImageCaption, ImageContent } from "../src/features/valuations/model";
import {
  captionsPatch,
  imageCaptions,
  moveCaption,
  newCaption,
  nextRotation,
  printedImageCaptions,
} from "../src/features/valuations/services/image-captions";

const image = (extra: Partial<ImageContent> = {}): ImageContent => ({ id: "foto", title: "Fachada", src: "https://example.test/fachada.jpg", enabled: true, ...extra });
const line = (id: string, text: string, position: ImageCaption["position"], align: ImageCaption["align"] = "center"): ImageCaption => ({ id, text, position, align });

test("an image saved with its single caption reads as one caption line", () => {
  assert.deepEqual(imageCaptions(image({ captionEnabled: true, captionText: "FACHADA", captionPosition: "top", captionAlign: "left" })), [line("caption-1", "FACHADA", "top", "left")]);
  assert.deepEqual(imageCaptions(image({ captionEnabled: true, captionText: "FACHADA" })), [line("caption-1", "FACHADA", "bottom")]);
  assert.deepEqual(imageCaptions(image({ captionEnabled: false, captionText: "FACHADA" })), [], "a caption turned off does not print");
  assert.deepEqual(imageCaptions(image()), []);
  // Once lines exist they are what counts.
  assert.deepEqual(imageCaptions(image({ captionEnabled: true, captionText: "VIEJA", captions: [] })), []);
});

test("several caption lines print above and below the image, in their order", () => {
  const photo = image({ captions: [line("a", "FOTO 1", "top"), line("b", "Vista desde la calle", "bottom", "left"), line("c", "  ", "bottom"), line("d", "FACHADA PRINCIPAL", "top", "right")] });
  assert.deepEqual(printedImageCaptions(photo, "top").map((caption) => caption.text), ["FOTO 1", "FACHADA PRINCIPAL"]);
  assert.deepEqual(printedImageCaptions(photo, "bottom").map((caption) => caption.text), ["Vista desde la calle"], "an empty line prints nothing");

  const html = renderToStaticMarkup(createElement(DocumentImage, { image: photo }));
  assert.match(html, /<figure[^>]*><figcaption class="mb-1 [^"]*text-center">FOTO 1<\/figcaption><figcaption class="mb-1 [^"]*text-right">FACHADA PRINCIPAL<\/figcaption><div[^>]*><img[^>]*><\/div><figcaption class="mt-1 [^"]*text-left">Vista desde la calle<\/figcaption><\/figure>$/);

  // The single caption of before prints as it did.
  const before = renderToStaticMarkup(createElement(DocumentImage, { image: image({ captionEnabled: true, captionText: "CROQUIS", captionPosition: "bottom" }) }));
  assert.match(before, /<img[^>]*><\/div><figcaption class="mt-1 [^"]*text-center">CROQUIS<\/figcaption>/);
});

test("caption lines are added, reordered and stored, the first one copied to the fields of before", () => {
  const first = newCaption([]);
  const second = newCaption([first], "top");
  assert.notEqual(first.id, second.id);
  assert.equal(second.position, "top");
  const lines = [{ ...first, text: "Uno" }, { ...second, text: "Dos" }];
  assert.deepEqual(moveCaption(lines, second.id, -1).map((caption) => caption.text), ["Dos", "Uno"]);
  assert.equal(moveCaption(lines, first.id, -1), lines, "the first one cannot go higher");

  const patch = captionsPatch(lines);
  assert.deepEqual(patch.captions, lines);
  assert.equal(patch.captionEnabled, true);
  assert.equal(patch.captionText, "Uno");
  assert.equal(captionsPatch([]).captionEnabled, false);

  // Saved and read back with the image's configuration; unreadable lines are dropped.
  const stored = imageMetadataFromContent({ ...image(), ...patch, rotation: 90 });
  const read = hydrateImageMetadata({ payload: { ...stored, captions: [...lines, { text: 4 }, "x"] } });
  assert.deepEqual(read.captions, lines);
  assert.equal(read.rotation, 90);
  assert.equal(hydrateImageMetadata({ rotation: 45 }).rotation, undefined);
  assert.equal(hydrateImageMetadata({ captionText: "Vieja", captionEnabled: true }).captions, undefined, "an image of before keeps its single caption");
});

test("Girar turns the image a quarter at a time, in the editor and in the document", () => {
  assert.equal(nextRotation(undefined), 90);
  assert.equal(nextRotation(90), 180);
  assert.equal(nextRotation(270), 0);

  const editor = renderToStaticMarkup(createElement(ImageEditorItem, { image: image({ rotation: 90 }), readOnly: false, onRemove: () => {}, onUpdate: () => {} }));
  assert.match(editor, /aria-label="Girar imagen"/);
  assert.match(editor, /style="transform:rotate\(90deg\)"/);
  assert.match(editor, /Agregar leyenda/);

  const turned = renderToStaticMarkup(createElement(DocumentImage, { image: image({ rotation: 180 }) }));
  assert.match(turned, /<img[^>]*style="max-height:600px;transform:rotate\(180deg\)"[^>]*data-image-rotation="180"/);
  const upright = renderToStaticMarkup(createElement(DocumentImage, { image: image() }));
  assert.doesNotMatch(upright, /rotate|data-image-rotation/);

  // In a pair the turned image stays inside its frame.
  const pair = renderToStaticMarkup(createElement(DocumentImage, { image: image({ rotation: 90 }), sideBySide: true }));
  assert.match(pair, /<div class="mx-auto aspect-video w-full relative overflow-hidden border-2 border-slate-500 bg-white"><img[^>]*style="width:56.25%;height:177.78%;max-width:none;object-fit:contain;object-position:50% 50%;transform:translate\(-50%, -50%\) rotate\(90deg\)"/);
});
