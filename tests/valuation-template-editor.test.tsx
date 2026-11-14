/**
 * «Nueva plantilla» / «Editar plantilla»: the document a new template starts
 * from, what a template keeps of what it is meant for, the note in place of
 * the calculation panels, and the creation form taking the template's types.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { typesOfTemplate } from "../src/features/valuations/components/create-valuation-form";
import { appliesToLabel } from "../src/features/valuations/components/template-details-dialog";
import { TemplateCalculationNote, TemplateEditingNotice } from "../src/features/valuations/components/workspace/template-editing";
import type { AppSection, Block } from "../src/features/valuations/model";
import {
  blankTemplateSections,
  buildDocumentTemplate,
  documentHasImages,
  readDocumentTemplate,
} from "../src/features/valuations/services/document-template";
import type { ValuationCreationCatalogs } from "../src/features/valuations/services/valuation-catalogs.service";

const block = (overrides: Partial<Block> = {}): Block => ({
  id: "b1", title: "BLOQUE", sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [], ...overrides,
});
const section = (id: string, blocks: Block[], title = id.toUpperCase()): AppSection => ({
  id, label: id, title, sourceFile: "", enabled: true, required: false, blocks,
});

test("a new template has the new valuation's sections; an empty one gets a block with its name; machinery hides its sections", () => {
  const sections = blankTemplateSections(
    [section("caratula", [block()]), section("terreno", [], "INFO TERRENO"), section("costos", [block({ id: "c" })])],
    new Set(["TERRENO"]),
  );
  assert.deepEqual(sections.map((item) => [item.id, item.enabled, item.blocks.length]), [["caratula", true, 1], ["terreno", false, 1], ["costos", true, 1]]);
  const placeholder = sections[1].blocks[0];
  assert.equal(placeholder.title, "INFO TERRENO");
  assert.deepEqual(placeholder.concepts, [], "the block a new valuation stores: nothing in it yet");
});

test("«Con imágenes» means pictures, not empty image places; what it is meant for is read back", () => {
  assert.equal(documentHasImages([section("fotos", [block({ images: [{ id: "i", title: "Foto", src: "", enabled: true }] })])]), false);
  assert.equal(documentHasImages([section("fotos", [block({ apartados: [{ id: "a", title: "", enabled: true, concepts: [], tables: [], images: [{ id: "i", title: "Foto", src: "/api/imagenes/x", enabled: true }] }] })])]), true);
  const stored = { ...buildDocumentTemplate([section("consideraciones", [block()])], { includeImages: true }), propertyTypeKey: "CASA_HABITACION" };
  assert.equal(readDocumentTemplate(JSON.parse(JSON.stringify(stored)))?.propertyTypeKey, "CASA_HABITACION");
  assert.equal(readDocumentTemplate({ ...stored, propertyTypeKey: undefined })?.propertyTypeKey, undefined, "templates of before: any kind");
});

test("the template editor says what is kept, and what each calculation section does in a valuation", () => {
  assert.match(renderToStaticMarkup(createElement(TemplateEditingNotice)), /Editas una plantilla, no un avalúo/);
  assert.match(renderToStaticMarkup(createElement(TemplateCalculationNote, { section: { id: "costos" } })), /En la plantilla no hay cálculo: cada avalúo creado con ella captura y calcula aquí el enfoque de costos/);
  assert.equal(renderToStaticMarkup(createElement(TemplateCalculationNote, { section: { id: "consideraciones" } })), "");
  assert.equal(appliesToLabel("Comercial", null), "Comercial · cualquier tipo de bien");
  assert.equal(appliesToLabel("Hipotecario", "Departamento"), "Hipotecario · Departamento");
});

test("choosing a firm's template proposes the kinds of valuation and property it is meant for", () => {
  const templates: ValuationCreationCatalogs["templates"] = [
    { id: 4, label: "Casa", publicId: "p4", description: null, appraisalTypeId: 2, system: false, document: true, propertyTypeId: 3 },
    { id: 5, label: "Cualquiera", publicId: "p5", description: null, appraisalTypeId: 1, system: false, document: true, propertyTypeId: null },
    { id: 1, label: "Sistema", publicId: "p1", description: null, appraisalTypeId: 1, system: true, document: false, propertyTypeId: null },
  ];
  assert.deepEqual(typesOfTemplate(templates, "4"), { appraisalTypeId: "2", propertyTypeId: "3" });
  assert.deepEqual(typesOfTemplate(templates, "5"), { appraisalTypeId: "1" }, "any kind of property keeps the one chosen");
  assert.deepEqual(typesOfTemplate(templates, "1"), {}, "the system's template changes nothing");
});
