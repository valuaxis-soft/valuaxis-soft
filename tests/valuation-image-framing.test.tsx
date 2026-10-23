import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DocumentImage } from "../src/features/valuations/components/document-image";
import { ImageEditorItem } from "../src/features/valuations/components/editor/image-editor";
import { UploadButton } from "../src/features/valuations/components/editor/image-upload-control";
import { buildSectionsPayload } from "../src/features/valuations/components/workspace/model/save-payload";
import { hydrateImageMetadata, imageMetadataFromContent } from "../src/features/valuations/metadata";
import type { AppSection, ImageContent } from "../src/features/valuations/model";
import {
  DOCUMENT_IMAGE_ACCEPT,
  documentImageUploadError,
  documentImageUploadProblem,
  documentImageUploadSummary,
} from "../src/features/valuations/services/document-image-upload";
import {
  DEFAULT_IMAGE_FRAMING,
  imageFramingStyle,
  isDefaultImageFraming,
  readStoredImageFraming,
  resolveImageFraming,
  type ImageFraming,
} from "../src/features/valuations/services/image-framing";

const image = (extra: Partial<ImageContent> = {}): ImageContent => ({ id: "foto", title: "Recámara", src: "https://example.test/recamara.jpg", enabled: true, ...extra });
const filled: ImageFraming = { focus: { x: 50, y: 20 }, size: { fit: "cover", scale: 130 } };

test("an image that never chose a framing shows whole and centered, as images always printed", () => {
  assert.deepEqual(resolveImageFraming(undefined), DEFAULT_IMAGE_FRAMING);
  assert.deepEqual(DEFAULT_IMAGE_FRAMING.size, { fit: "contain", scale: 100 });
  assert.equal(isDefaultImageFraming(undefined), true);
  assert.equal(isDefaultImageFraming(filled), false);
  // The cover's limits and rounding apply; an unknown fit stays whole.
  assert.deepEqual(resolveImageFraming({ focus: { x: -4, y: 33.4 }, size: { fit: "stretch", scale: 900 } }), { focus: { x: 0, y: 33 }, size: { fit: "contain", scale: 200 } });
  assert.deepEqual(imageFramingStyle(filled), { objectFit: "cover", objectPosition: "50% 20%", transform: "scale(1.3)", transformOrigin: "50% 20%" });
});

test("the framing is kept with each image and read back the same; the default is not stored", () => {
  const stored = imageMetadataFromContent(image({ framing: filled }));
  assert.deepEqual(stored.framing, filled);
  assert.deepEqual(hydrateImageMetadata({ kind: "image", payload: stored }).framing, filled);
  assert.equal(imageMetadataFromContent(image({ framing: DEFAULT_IMAGE_FRAMING })).framing, undefined);
  assert.equal(hydrateImageMetadata({ payload: { framing: "arriba" } }).framing, undefined);
  assert.equal(readStoredImageFraming({ focus: { x: 50, y: 50 }, size: { fit: "contain", scale: 100 } }), undefined);

  const sections = [{
    id: "fotosSujeto", label: "", title: "FOTOGRAFÍAS", sourceFile: "", enabled: true, required: false,
    blocks: [{ id: "anexo", title: "ANEXO", sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [image({ framing: filled })] }],
  }] as AppSection[];
  assert.deepEqual(buildSectionsPayload(sections)[0].blocks[0].images[0].framing, filled);
});

test("annex photos sit in a frame with a firm line; a vertical photo can fill it, zoomed and moved", () => {
  const whole = renderToStaticMarkup(createElement(DocumentImage, { image: image(), sideBySide: true }));
  assert.match(whole, /<div class="[^"]*aspect-video[^"]*border-2 border-slate-500 bg-white"><img class="block h-full w-full" style="object-fit:contain;object-position:50% 50%"/);

  const framed = renderToStaticMarkup(createElement(DocumentImage, { image: image({ framing: filled }), sideBySide: true }));
  assert.match(framed, /overflow-hidden border-2 border-slate-500[^"]*"><img[^>]*style="object-fit:cover;object-position:50% 20%;transform:scale\(1.3\);transform-origin:50% 20%"/);

  // A turned photo keeps its framing inside the frame.
  const turned = renderToStaticMarkup(createElement(DocumentImage, { image: image({ rotation: 90, framing: filled }), sideBySide: true }));
  assert.match(turned, /object-fit:cover;object-position:50% 20%;transform:translate\(-50%, -50%\) rotate\(90deg\) scale\(1.3\)/);
});

test("a lone image (a plan) prints framed and centered, never taller than the page leaves room for", () => {
  const plan = renderToStaticMarkup(createElement(DocumentImage, { image: image({ captionEnabled: true, captionText: "PLANTA BAJA" }) }));
  assert.match(plan, /<figure class="mx-auto[^"]*"[^>]*data-image-frame="lone"><div class="mx-auto relative overflow-hidden border-2 border-slate-500 bg-white"><img[^>]*style="max-height:600px[^"]*"/);
  assert.match(plan, /<\/div><figcaption class="mt-1 [^"]*text-center">PLANTA BAJA<\/figcaption><\/figure>$/);
});

test("each image of the editor offers its framing, as the cover image does", () => {
  const editor = renderToStaticMarkup(createElement(ImageEditorItem, { image: image({ framing: filled }), readOnly: false, onRemove: () => {}, onUpdate: () => {} }));
  assert.match(editor, /aria-label="Encuadre de la imagen"/);
  const empty = renderToStaticMarkup(createElement(ImageEditorItem, { image: image({ src: "" }), readOnly: false, onRemove: () => {}, onUpdate: () => {} }));
  assert.match(empty, /<button[^>]*disabled=""[^>]*aria-label="Encuadre de la imagen"/, "nothing to frame without a file");
});

test("several images can be chosen at once, of the formats the server reads", () => {
  const button = renderToStaticMarkup(createElement(UploadButton, { label: "Imágenes", multiple: true, accept: DOCUMENT_IMAGE_ACCEPT, onChange: () => {} }));
  assert.match(button, /<input[^>]*type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp,image\/gif,\.jpg,\.jpeg,\.png,\.webp,\.gif"[^>]*multiple=""/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(UploadButton, { label: "Imagen", onChange: () => {} })), /multiple/);

  const file = (name: string, type: string, size = 10) => ({ name, type, size });
  for (const ok of [file("a.jpg", "image/jpeg"), file("b.JPEG", "image/jpeg"), file("c.png", "image/png"), file("d.webp", "image/webp")]) {
    assert.equal(documentImageUploadProblem(ok), null, ok.name);
  }
  assert.match(documentImageUploadProblem(file("IMG_0001.HEIC", "image/heic")) ?? "", /HEIC/);
  assert.match(documentImageUploadProblem(file("plano.pdf", "application/pdf")) ?? "", /JPG, JPEG, PNG, WebP o GIF/);
  assert.match(documentImageUploadProblem(file("vacía.jpg", "image/jpeg", 0)) ?? "", /vacío/);
  assert.equal(documentImageUploadError("plano.pdf", "formato no compatible."), "No se pudo subir «plano.pdf»: formato no compatible.");

  assert.equal(documentImageUploadSummary(1, 1), "Imagen subida");
  assert.equal(documentImageUploadSummary(10, 10), "10 imágenes subidas");
  assert.equal(documentImageUploadSummary(8, 10), "Se subieron 8 de 10 imágenes");
});
