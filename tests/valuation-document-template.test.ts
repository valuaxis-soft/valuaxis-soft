import assert from "node:assert/strict";
import test from "node:test";
import type { AppSection, Block } from "../src/features/valuations/model";
import {
  buildDocumentTemplate,
  importableBlocks,
  readDocumentTemplate,
} from "../src/features/valuations/services/document-template";

const block = (id: string, extra: Partial<Block> = {}): Block => ({
  id,
  title: id.toUpperCase(),
  sectionLabel: "I",
  enabled: true,
  required: false,
  concepts: [{ id: `${id}-c`, label: "Superficie", value: "120", type: "measurement", valueFormat: "m2", enabled: true }],
  apartados: [],
  tables: [],
  images: [{ id: `${id}-img`, title: "Foto", src: "https://bucket.s3.amazonaws.com/uploads/2026-10/foto.jpg?X-Amz-Signature=abc" }],
  ...extra,
});

const section = (id: string, blocks: Block[], extra: Partial<AppSection> = {}): AppSection => ({ id, label: "I", title: id.toUpperCase(), sourceFile: "", enabled: true, required: false, blocks, ...extra });

const document = () => [
  section("caratula", [block("caratula-block-1-datos")]),
  section("datos", [block("datos-1")]),
  section("terreno", [block("terreno-1")], { titleEdited: true, title: "ZONA" }),
  section("mercadoVenta", [block("motor-mercado-terreno_venta-1"), block("mercadoVenta-block-1-comparables-de-mercado-en-venta")]),
  section("custom-1", [block("propio")], { custom: true, enabled: false }),
];

test("a template keeps the structure with its ids, without values, images or the calculation's blocks", () => {
  const template = buildDocumentTemplate(document(), { includeData: false, includeImages: false });
  assert.equal(template.format, 1);
  assert.deepEqual(template.sections.map((item) => item.id), ["caratula", "datos", "terreno", "mercadoVenta", "custom-1"]);
  const terreno = template.sections[2];
  assert.equal(terreno.title, "ZONA");
  assert.equal(terreno.titleEdited, true);
  assert.equal(terreno.blocks[0].id, "terreno-1", "ids stay: a template starts a document of its own");
  assert.deepEqual(terreno.blocks[0].concepts.map((item) => [item.id, item.label, item.type, item.valueFormat, item.value]), [["terreno-1-c", "Superficie", "measurement", "m2", ""]]);
  assert.deepEqual(terreno.blocks[0].images, []);
  assert.deepEqual(template.sections[3].blocks.map((item) => item.id), ["mercadoVenta-block-1-comparables-de-mercado-en-venta"], "what the calculation writes is not kept");
  assert.equal(template.sections[4].enabled, false, "a hidden section stays hidden");
});

test("with data and images the template keeps the values and the lasting address of each image, but not the files of Datos generales", () => {
  const template = buildDocumentTemplate(document(), { includeData: true, includeImages: true });
  const terreno = template.sections[2].blocks[0];
  assert.equal(terreno.concepts[0].value, "120");
  assert.deepEqual(terreno.images.map((item) => item.src), ["/api/archivos/imagen?key=uploads%2F2026-10%2Ffoto.jpg"]);
  assert.deepEqual(template.sections[1].blocks[0].images, []);
});

test("the stored template is read back, and anything else is not a template", () => {
  const template = buildDocumentTemplate(document(), { includeData: false, includeImages: false });
  const stored = JSON.parse(JSON.stringify(template));
  assert.deepEqual(readDocumentTemplate(stored), template);
  assert.equal(readDocumentTemplate(null), null);
  assert.equal(readDocumentTemplate({ format: 2, sections: [] }), null);
  assert.equal(readDocumentTemplate({ format: 1, sections: [{ id: "x", title: "X", blocks: [{ id: "b" }] }] }), null);
});

test("the blocks offered to import leave out the carátula, the calculation's blocks and their templates", () => {
  assert.deepEqual(importableBlocks(document()).map((item) => `${item.sectionId}/${item.block.id}`), ["datos/datos-1", "terreno/terreno-1", "custom-1/propio"]);
});
