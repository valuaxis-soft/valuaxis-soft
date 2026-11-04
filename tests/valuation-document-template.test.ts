import assert from "node:assert/strict";
import test from "node:test";
import type { AppSection, Block } from "../src/features/valuations/model";
import {
  buildDocumentTemplate,
  importableBlocks,
  readDocumentTemplate,
  stripClientDataFromSections,
  templateContainsData,
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

test("with images the template keeps the lasting address of each image, but not the files of Datos generales; the data never, even when asked", () => {
  const template = buildDocumentTemplate(document(), { includeData: true, includeImages: true });
  const terreno = template.sections[2].blocks[0];
  assert.equal(terreno.concepts[0].value, "", "the property's data stay with the valuation");
  assert.equal(template.includeData, false);
  assert.deepEqual(terreno.images.map((item) => item.src), ["/api/archivos/imagen?key=uploads%2F2026-10%2Ffoto.jpg"]);
  assert.deepEqual(template.sections[1].blocks[0].images, []);
});

test("the template keeps the appraiser's texts: the whole Consideraciones section and the paragraphs and long texts anywhere", () => {
  const sections: AppSection[] = [
    section("caratula", [block("caratula-block-1-datos", {
      concepts: [
        { id: "solicitante", label: "Solicitante", value: "Juan Pérez", enabled: true },
        { id: "folio", label: "Folio", value: "VDA-0012", enabled: true },
      ],
    })]),
    section("consideraciones", [block("consideraciones-1", {
      concepts: [{ id: "supuesto-1", label: "Comentario", value: "El avalúo supone que…", enabled: true }],
      apartados: [{ id: "ap", title: "Supuestos", enabled: true, concepts: [{ id: "ap-c", label: "2", value: "Las medidas son las de escritura.", enabled: true }], tables: [], images: [] }],
    })]),
    section("conclusiones", [block("conclusiones-1", {
      concepts: [
        { id: "valor", label: "Valor concluido", value: "2200000.00", type: "currency", valueFormat: "mxn-mn", enabled: true },
        { id: "declaracion", label: "Declaración del valuador", value: "Declaro que…", type: "longText", enabled: true },
        { id: "parrafo", label: "", value: "Texto libre", type: "paragraph", enabled: true },
      ],
      apartados: [{ id: "ap2", title: "Alcance", enabled: true, concepts: [{ id: "ap2-c", label: "Alcance", value: "Solo el inmueble.", type: "longText", enabled: true }, { id: "ap2-d", label: "Fecha", value: "2026-11-02", type: "date", enabled: true }], tables: [], images: [] }],
    })]),
  ];
  assert.equal(templateContainsData(sections), true);
  const clean = stripClientDataFromSections(sections, { includeImages: false });
  assert.deepEqual(clean[0].blocks[0].concepts.map((item) => item.value), ["", ""], "the client's data are blank");
  assert.equal(clean[1].blocks[0].concepts[0].value, "El avalúo supone que…", "Consideraciones keeps its texts");
  assert.equal(clean[1].blocks[0].apartados[0].concepts[0].value, "Las medidas son las de escritura.");
  const conclusion = clean[2].blocks[0];
  assert.deepEqual(conclusion.concepts.map((item) => [item.value, item.valueFormat]), [["", "mxn-mn"], ["Declaro que…", undefined], ["Texto libre", undefined]], "formats stay, texts stay, amounts go");
  assert.deepEqual(conclusion.apartados[0].concepts.map((item) => item.value), ["Solo el inmueble.", ""]);
  assert.equal(templateContainsData(clean), false);
  assert.equal(templateContainsData(buildDocumentTemplate(sections, { includeImages: false }).sections), false);
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
