/**
 * Croquis in any block (videos 5.7 and 6.3 of Álvaro, nov 2026): «Agregar →
 * Croquis de localización» in any block or subbloque, several per valuation
 * with ids of their own, the old fixed ids read as croquis, copies without
 * repeated ids, and the street names turned along their street and placed by
 * hand.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { AppSection, Block, ImageContent } from "../src/features/valuations/model";
import { createInitialSections } from "../src/features/valuations/sections";
import { normalizeEditorSections } from "../src/features/valuations/components/workspace/model/section-numbering";
import { hydrateImageMetadata, imageMetadataFromContent } from "../src/features/valuations/metadata";
import { blockWithoutData, copyApartado, copyBlock } from "../src/features/valuations/services/structure-transfer";
import { CROQUIS_IMAGE_IDS, streetLabelBox } from "../src/features/maps/croquis";
import { croquisStreets } from "../src/features/maps/croquis-streets";
import {
  croquisInsertLock,
  documentCroquis,
  findCroquisById,
  findCroquisImage,
  withCroquisImage,
  withInsertedCroquis,
  withUpdatedCroquis,
  type GeneratedCroquis,
} from "../src/features/maps/croquis-document";
import { readCroquisMarker, withLegacyCroquisMarker } from "../src/features/maps/croquis-marker";
import { DEFAULT_HIGHLIGHT_STYLES, placedStreetLabels, streetAngle, streetLabels, uprightAngle } from "../src/features/maps/highlights";
import { imagePixel, pointAtPixel } from "../src/features/maps/static-map";

const sections = (): AppSection[] => normalizeEditorSections(createInitialSections());
const terreno = (all: readonly AppSection[]) => all.find((section) => section.id === "terreno")!;
const generated = (...kinds: GeneratedCroquis["kind"][]): GeneratedCroquis[] => kinds.map((kind) => ({ kind, src: `/api/archivos/imagen?key=uploads/${kind}.jpg`, marker: { kind } }));
const allImageIds = (all: readonly AppSection[]) => all.flatMap((section) => section.blocks.flatMap((block) => [...block.images, ...block.apartados.flatMap((apartado) => apartado.images)].map((image) => image.id)));

test("V5.7-01: «Agregar → Croquis» puts macro and micro side by side in any block, each with an id of its own, as many times as wanted", () => {
  const start = sections();
  const block = terreno(start).blocks[0];
  const first = withInsertedCroquis(start, { sectionId: "terreno", blockId: block.id }, generated("macro", "micro"));
  assert.equal(first.imageIds.length, 2);
  const placed = terreno(first.sections).blocks[0];
  const [macro, micro] = first.imageIds.map((id) => placed.images.find((image) => image.id === id)!);
  assert.equal(macro.croquis?.kind, "macro");
  assert.equal(micro.croquis?.kind, "micro");
  assert.equal(macro.captionText, "Croquis de macrolocalización");
  // Side by side: one row, two columns, at the end of the block, in its flow.
  const row = placed.contentLayout!.rows.at(-1)!;
  assert.deepEqual(row.columns.map((column) => column.items.map((item) => item.id)), [[macro.id], [micro.id]]);
  assert.ok(placed.blockFlow!.rows.some((item) => item.items.some((ref) => ref.type === "content-row" && ref.rowId === row.id)));

  // A second one in a subbloque of the same section, and a third in the block: all different ids.
  const withSub: AppSection[] = first.sections.map((section) =>
    section.id !== "terreno"
      ? section
      : { ...section, blocks: section.blocks.map((item, index) => (index ? item : { ...item, apartados: [...item.apartados, { id: "sub-croquis", title: "Ubicación", enabled: true, concepts: [], tables: [], images: [] }] })) },
  );
  const second = withInsertedCroquis(withSub, { sectionId: "terreno", blockId: block.id, apartadoId: "sub-croquis" }, generated("micro"));
  const third = withInsertedCroquis(second.sections, { sectionId: "terreno", blockId: block.id }, generated("macro"));
  const sub = terreno(third.sections).blocks[0].apartados.find((apartado) => apartado.id === "sub-croquis")!;
  assert.equal(sub.images[0].croquis?.kind, "micro");
  assert.ok(sub.contentLayout!.rows.some((item) => item.columns.some((column) => column.items.some((ref) => ref.id === sub.images[0].id))));
  assert.equal(documentCroquis(third.sections).length, 4);
  const ids = allImageIds(third.sections);
  assert.equal(new Set(ids).size, ids.length, "no repeated ids in the document");
  assert.ok(ids.every((id) => !Object.values(CROQUIS_IMAGE_IDS).includes(id)));
  assert.deepEqual(findCroquisById(third.sections, sub.images[0].id)?.apartadoId, "sub-croquis");
});

test("V5.7-01: not in the carátula (concepts and subbloques only), in Datos generales (files of their own) or in a generated block", () => {
  assert.match(croquisInsertLock("caratula")!, /carátula solo lleva conceptos/);
  assert.match(croquisInsertLock("datos")!, /Datos generales/);
  assert.equal(croquisInsertLock("terreno"), null);
  const start = sections();
  const datos = start.find((section) => section.id === "datos")!;
  const refused = withInsertedCroquis(start, { sectionId: "datos", blockId: datos.blocks[0].id }, generated("macro"));
  assert.deepEqual(refused.imageIds, []);
  assert.deepEqual(refused.sections, start);
  assert.deepEqual(withInsertedCroquis(start, { sectionId: "terreno", blockId: "no-existe" }, generated("macro")).imageIds, []);
});

test("V5.7-03: generating again from one croquis replaces only its picture, with its frame and names; the caption and size stay", () => {
  const block = terreno(sections()).blocks[0];
  const inserted = withInsertedCroquis(sections(), { sectionId: "terreno", blockId: block.id }, generated("macro"));
  const twice = withInsertedCroquis(inserted.sections, { sectionId: "terreno", blockId: block.id }, generated("macro"));
  const [one, two] = [inserted.imageIds[0], twice.imageIds[0]];
  const edited = twice.sections.map((section) =>
    section.id !== "terreno" ? section : { ...section, blocks: section.blocks.map((item) => ({ ...item, images: item.images.map((image) => (image.id === one ? { ...image, captionText: "Mi macro", layoutWidthPercent: 60 } : image)) })) },
  );
  const marker = { kind: "macro" as const, frame: { offset: [0.001, 0] as [number, number], zoom: 14 }, labels: [{ name: "Av. Ficticia", point: [20.63, -103.4] as [number, number], angle: 30 }] };
  const updated = withUpdatedCroquis(edited, one, "/api/archivos/imagen?key=uploads/nuevo.jpg", marker);
  assert.ok(updated.updated);
  const image = findCroquisById(updated.sections, one)!.image;
  assert.equal(image.src, "/api/archivos/imagen?key=uploads/nuevo.jpg");
  assert.deepEqual(image.croquis, marker);
  assert.equal(image.captionText, "Mi macro");
  assert.equal(image.layoutWidthPercent, 60);
  assert.equal(findCroquisById(updated.sections, two)!.image.src, "/api/archivos/imagen?key=uploads/macro.jpg", "the other macro is untouched");
  assert.equal(withUpdatedCroquis(edited, "ya-no-esta", "x", marker).updated, false);
});

/** A block of the Croquis section as saved before 13 nov 2026: the croquis known only by the fixed ids. */
function legacyBlock(): Block {
  const image = (id: string, title: string): ImageContent => ({ id, title, src: `/api/archivos/imagen?key=uploads/${id}.jpg`, enabled: true, captionText: title, captionEnabled: true });
  return {
    id: "bloque-croquis",
    title: "Croquis",
    sectionLabel: "",
    enabled: true,
    required: false,
    concepts: [],
    apartados: [],
    tables: [],
    images: [image(CROQUIS_IMAGE_IDS.macro, "Croquis de macrolocalización"), image(CROQUIS_IMAGE_IDS.micro, "Croquis de microlocalización"), image("foto-a-mano", "Foto")],
  };
}

test("the croquis saved with the old fixed ids are read as croquis and keep working; their copies too, under new ids (V5.7-07)", () => {
  const legacy = legacyBlock();
  const read = legacy.images.map(withLegacyCroquisMarker);
  assert.deepEqual(read.map((image) => image.croquis?.kind), ["macro", "micro", undefined]);
  assert.equal(read[0].id, CROQUIS_IMAGE_IDS.macro, "the id stays, nothing is lost");
  assert.equal(read[0].src, legacy.images[0].src);
  assert.equal(read[0].captionText, "Croquis de macrolocalización");

  // In the Croquis section, the section's own access finds and replaces it in place.
  const all = sections().map((section) => (section.id === "croquisComparables" ? { ...section, blocks: [{ ...legacy, images: read }] } : section));
  assert.equal(findCroquisImage(all, "macro")?.id, CROQUIS_IMAGE_IDS.macro);
  const again = withCroquisImage(all, { kind: "macro", src: "/nuevo.jpg", marker: { kind: "macro" } });
  assert.equal(findCroquisImage(again.sections, "macro")?.src, "/nuevo.jpg");
  assert.equal(documentCroquis(again.sections).filter((entry) => entry.image.croquis.kind === "macro").length, 1);

  // A copy of the block as it was (no marker yet): new ids, still croquis.
  const copy = copyBlock(legacy, all, { includeData: true, includeImages: true });
  assert.equal(copy.images.length, 3);
  assert.ok(copy.images.every((image) => !legacy.images.some((original) => original.id === image.id)));
  assert.deepEqual(copy.images.map((image) => image.croquis?.kind), ["macro", "micro", undefined]);
});

test("V5.7-07: copy, duplicate, a subbloque's copy and a template keep the croquis, with no repeated ids", () => {
  const block = terreno(sections()).blocks[0];
  const inserted = withInsertedCroquis(sections(), { sectionId: "terreno", blockId: block.id }, [{ kind: "macro", src: "/m.jpg", marker: { kind: "macro", labels: [{ name: "Calle Uno", point: [20.6, -103.4], angle: 15 }] } }]);
  const source = terreno(inserted.sections).blocks[0];
  const duplicate = copyBlock(source, inserted.sections, { includeData: true, includeImages: true });
  const withDuplicate = inserted.sections.map((section) => (section.id === "terreno" ? { ...section, blocks: [...section.blocks, duplicate] } : section));
  const ids = allImageIds(withDuplicate);
  assert.equal(new Set(ids).size, ids.length);
  const croquis = documentCroquis(withDuplicate);
  assert.equal(croquis.length, 2);
  assert.deepEqual(croquis[1].image.croquis.labels, [{ name: "Calle Uno", point: [20.6, -103.4], angle: 15 }], "the copy keeps its names");
  // Each one is generated again on its own.
  const updated = withUpdatedCroquis(withDuplicate, croquis[1].image.id, "/otra.jpg", { kind: "macro" });
  assert.equal(findCroquisById(updated.sections, croquis[0].image.id)!.image.src, "/m.jpg");

  const apartado = { id: "a1", title: "Sub", enabled: true, concepts: [], tables: [], images: [{ ...croquis[0].image, id: "img-sub" }] };
  const subCopy = copyApartado(apartado, withDuplicate, { includeData: true, includeImages: true });
  assert.notEqual(subCopy.images[0].id, "img-sub");
  assert.equal(subCopy.images[0].croquis?.kind, "macro");
  // A template with images keeps the marker; the import gives new ids (copyBlock above).
  assert.equal(blockWithoutData(source, { includeData: false, includeImages: true }).images.find((image) => image.croquis)?.croquis?.kind, "macro");
});

test("the marker is saved with the image's metadata and read back; a damaged one is no croquis", () => {
  const marker = { kind: "micro" as const, frame: { offset: [0.0002, -0.0001] as [number, number], zoom: 18 }, labels: [{ name: "Calle Dos", point: [20.61, -103.41] as [number, number], angle: -60 }] };
  const stored = imageMetadataFromContent({ croquis: marker });
  assert.deepEqual(hydrateImageMetadata({ kind: "image", payload: { id: "x", ...stored } }).croquis, marker);
  assert.equal(hydrateImageMetadata({ kind: "image", payload: { croquis: { kind: "otro" } } }).croquis, undefined);
  assert.equal(readCroquisMarker({ kind: "macro", labels: [{ name: "", point: [0, 0], angle: 0 }] }), undefined);
  assert.equal(hydrateImageMetadata({ kind: "image", payload: {} }).croquis, undefined);
});

test("V5.7-14: each name is turned along its street, never upside down, and the ones placed by hand keep their place and angle", () => {
  // East–west is horizontal, north–south vertical, a street going up to the northeast leans up (negative angle on the image).
  assert.equal(streetAngle([20.63, -103.41], [20.63, -103.40]), 0);
  assert.equal(streetAngle([20.63, -103.40], [20.63, -103.41]), 0, "the same street drawn the other way reads the same");
  assert.equal(Math.abs(streetAngle([20.62, -103.4], [20.63, -103.4])), 90);
  const diagonal = streetAngle([20.63, -103.4], [20.63 + 0.001, -103.4 + 0.001 / Math.cos((20.63 * Math.PI) / 180)]);
  assert.ok(Math.abs(diagonal + 45) < 0.5, `northeast diagonal at ${diagonal}`);
  assert.equal(uprightAngle(135), -45);
  assert.equal(uprightAngle(-120), 60);
  assert.equal(uprightAngle(180), 0);

  const items = [{ way: { n: "Diagonal", r: 3, g: [[20.63, -103.401], [20.631, -103.4], [20.632, -103.399]] as [number, number][] }, key: "secundaria" as const, style: DEFAULT_HIGHLIGHT_STYLES.secundaria }];
  const [label] = streetLabels(items, [20.631, -103.4]);
  assert.ok(label.angle < -30 && label.angle > -60, `the label leans like the street: ${label.angle}`);

  const placed = placedStreetLabels([label, { ...label, name: "Otra" }], [{ name: "Diagonal", point: [20.6305, -103.4005], angle: 200 }, { name: "Ya no resaltada", point: [0, 0], angle: 0 }]);
  assert.deepEqual(placed[0].point, [20.6305, -103.4005]);
  assert.equal(placed[0].angle, 20);
  assert.equal(placed[1].angle, label.angle, "the others follow their street");
  assert.equal(placed.length, 2, "a placement of a street no longer highlighted adds nothing");
});

test("V5.7-14: a name dragged in «Letreros» lands on the map point under it (pixel ↔ point round trip)", () => {
  const center: [number, number] = [20.6301, -103.4];
  for (const zoom of [14, 17, 19]) {
    const point = pointAtPixel(center, zoom, 123.5, 345.25);
    const back = imagePixel(center, zoom, point);
    assert.ok(Math.abs(back.x - 123.5) < 1e-6 && Math.abs(back.y - 345.25) < 1e-6);
  }
  const middle = pointAtPixel(center, 17, 320, 200);
  assert.ok(Math.abs(middle[0] - center[0]) < 1e-9 && Math.abs(middle[1] - center[1]) < 1e-9);
});

test("V5.7-14: a straight street whose ends fall outside the micro frame still gets its name, on it, inside the image, off the pin and the other names", () => {
  const pin: [number, number] = [20.6301, -103.4];
  const ways = [
    { n: "Avenida Larga", r: 2, g: [[20.622, -103.409], [20.638, -103.391]] as [number, number][] },
    { n: "Calle Frente", r: 4, g: [[20.6301, -103.404], [20.6301, -103.396]] as [number, number][] },
  ];
  const highlights = { front: "Calle Frente", streets: [{ name: "Avenida Larga", category: "principal" as const }], styles: DEFAULT_HIGHLIGHT_STYLES, names: true };
  const { labels } = croquisStreets("micro", pin, 17, highlights, ways, pin);
  assert.deepEqual(labels.map((label) => label.name).sort(), ["Avenida Larga", "Calle Frente"]);
  const boxes = labels.map((label) => streetLabelBox(pin, 17, label));
  assert.ok(boxes.every((box) => box.inside), "both names are on the image");
  const front = labels.find((label) => label.name === "Calle Frente")!;
  assert.equal(front.angle, 0, "the east–west street reads horizontally");
  const avenue = labels.find((label) => label.name === "Avenida Larga")!;
  assert.ok(avenue.angle < -30 && avenue.angle > -60, `the avenue's name leans with it: ${avenue.angle}`);
  const at = imagePixel(pin, 17, pin);
  for (const box of boxes) assert.ok(Math.hypot(box.x - at.x, box.y - at.y) > 12, "no name sits on the pin");
  const [a, b] = boxes;
  assert.ok(Math.abs(a.x - b.x) > 20 || Math.abs(a.y - b.y) > 20, "the two names do not land on the same spot");
});
