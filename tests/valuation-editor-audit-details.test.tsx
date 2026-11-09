/**
 * The details of the audit of 2 nov 2026 fixed in the editor: deletions that
 * did not ask, a button disabled with no reason, concepts born as texts,
 * headers cut short, browser suggestions in captions, «plantilla maestra»,
 * Ctrl+S and the <b> tags shown in the fields.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { addConstructionDisabledReason } from "../src/features/valuations/calculation/cost-types";
import { IMPORT_TEMPLATE_WORDING, ImportComparablesDialog } from "../src/features/valuations/components/calculation/import-comparables-dialog";
import { conceptPreview } from "../src/features/valuations/components/editor/concept-creation-control";
import { ConceptEditorList } from "../src/features/valuations/components/editor/concept-editor";
import { deleteConfirmation } from "../src/features/valuations/components/editor/delete-confirm";
import { ImageEditorItem } from "../src/features/valuations/components/editor/image-editor";
import { TextMarksField } from "../src/features/valuations/components/editor/text-marks-toolbar";
import { isSaveShortcut } from "../src/features/valuations/components/workspace/model/save-status";
import { storedImagesToDelete } from "../src/features/valuations/components/workspace/model/section-content";
import type { AppSection, Concept } from "../src/features/valuations/model";
import { createInitialSections } from "../src/features/valuations/sections";
import { construccionSection } from "../src/features/valuations/sections/construccion";
import { costosSection } from "../src/features/valuations/sections/costos";
import { COMPANY_HEADER_BLOCK_ID } from "../src/features/valuations/services/caratula-company-header";
import { createHomologationTable } from "../src/features/valuations/services/table";
import { decodeStoredTable } from "../src/features/valuations/services/table-persistence";
import { rawSelectionOf, textSelectionOf, toggleTextMark, withMarkedText } from "../src/features/valuations/services/text-marks";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

const noop = () => {};

/* ------------------------------------------------------------------ */
/*  1–3. Deleting asks first and can be undone                         */
/* ------------------------------------------------------------------ */

test("removing a construction type or a header datum asks with the same dialog, saying how to undo it", () => {
  const type = deleteConfirmation("constructionType", "T-1");
  assert.equal(type.title, "¿Eliminar el tipo de construcción «T-1»?");
  assert.equal(type.confirmLabel, "Eliminar tipo");
  // The types save on their own: what brings one back is the table's Ctrl+Z, not the editor's «Deshacer».
  assert.match(type.description, /Ctrl\+Z/);
  assert.match(type.description, /enfoque de costos/);

  const datum = deleteConfirmation("headerField", "RFC");
  assert.equal(datum.title, "¿Eliminar el dato del encabezado «RFC»?");
  assert.match(datum.description, /Deshacer/);
  assert.equal(deleteConfirmation("image", "Imagen del encabezado").confirmLabel, "Eliminar imagen");
});

const withHeaderImage = (sections: AppSection[], present: boolean) => sections.map((section) =>
  section.id !== "caratula" ? section : {
    ...section,
    blocks: section.blocks.map((block) => (block.id === COMPANY_HEADER_BLOCK_ID
      ? { ...block, images: present ? [{ id: "logo", title: "Logo", src: "/logo.png", enabled: true }] : [] }
      : block)),
  });
const withDatosImage = (sections: AppSection[], imageId: string | null) => sections.map((section) =>
  section.id !== "datos" ? section : {
    ...section,
    blocks: section.blocks.map((block, index) => (index === 0
      ? { ...block, images: imageId ? [{ id: imageId, title: "Fachada", src: "/fachada.png", enabled: true }] : [] }
      : block)),
  });

test("a stored image taken out of the document is deleted from the server only after a save leaves it out", () => {
  const pending = { headerImage: true, datosImageIds: ["foto-1"] };
  const removed = withDatosImage(withHeaderImage(createInitialSections(), false), null);
  assert.deepEqual(storedImagesToDelete(removed, pending), pending, "saved without them: both go");

  // «Deshacer» before saving puts them back: the save keeps them and nothing is deleted.
  const undone = withDatosImage(withHeaderImage(createInitialSections(), true), "foto-1");
  assert.deepEqual(storedImagesToDelete(undone, pending), { headerImage: false, datosImageIds: [] });

  assert.deepEqual(
    storedImagesToDelete(removed, { headerImage: false, datosImageIds: [] }),
    { headerImage: false, datosImageIds: [] },
    "nothing taken out, nothing deleted",
  );
});

/* ------------------------------------------------------------------ */
/*  4. «+ Construcción» says why it is off                             */
/* ------------------------------------------------------------------ */

test("«+ Construcción» disabled says why", () => {
  assert.match(addConstructionDisabledReason(0, 0) ?? "", /Aún no hay tipos de construcción/);
  assert.match(addConstructionDisabledReason(2, 0) ?? "", /ya están en el cálculo/);
  assert.equal(addConstructionDisabledReason(2, 1), null, "with a type out of the calculation it adds a row");
});

/* ------------------------------------------------------------------ */
/*  5. Numeric concepts are born numeric                               */
/* ------------------------------------------------------------------ */

const typeOf = (concepts: Concept[], label: string) => {
  const concept = concepts.find((item) => item.label === label);
  assert.ok(concept, label);
  return { type: concept.type ?? "text", valueFormat: concept.valueFormat };
};

test("the counts and the completion of Construcciones are born as numbers; the descriptions stay texts", () => {
  const concepts = construccionSection.blocks[0].concepts;
  assert.deepEqual(typeOf(concepts, "Número de niveles"), { type: "number", valueFormat: undefined });
  assert.deepEqual(typeOf(concepts, "Unidades susceptibles a rentarse"), { type: "number", valueFormat: undefined });
  assert.deepEqual(typeOf(concepts, "Grado de terminación de obra"), { type: "number", valueFormat: "percent" });
  assert.deepEqual(typeOf(concepts, "Uso actual"), { type: "text", valueFormat: undefined });
  assert.deepEqual(typeOf(concepts, "Estado de conservación"), { type: "text", valueFormat: undefined });
});

test("the surface and the amounts of the cost template are born as number and money", () => {
  const concepts = costosSection.blocks.flatMap((block) => block.concepts);
  assert.equal(typeOf(concepts, "Superficie de terreno").type, "number");
  for (const label of ["Valor unitario de terreno", "Valor de terreno", "Valor del terreno", "Valor de construcciones", "Valor de instalaciones especiales", "Valor físico o directo"]) {
    assert.equal(typeOf(concepts, label).type, "currency", label);
  }
  assert.equal(typeOf(concepts, "Observaciones").type, "text");
});

/* ------------------------------------------------------------------ */
/*  6. Whole homologation headers                                      */
/* ------------------------------------------------------------------ */

test("the homologation table names Clasificación and Factor resultante whole, also in a table saved with «Clas» and «Re»", () => {
  const names = (columns: { id: string; name: string }[]) => Object.fromEntries(columns.map((column) => [column.id, column.name]));
  const created = names(createHomologationTable().columns);
  assert.equal(created["hom-factor-clas"], "Clasificación");
  assert.equal(created["hom-factor-re"], "Factor resultante");

  const stored = (clas: string) => decodeStoredTable({
    id: "homo-1",
    title: "Tabla de Homologación",
    enabled: true,
    columns: [
      { id: "hom-factor-neg", name: "Neg." },
      { id: "hom-factor-clas", name: clas },
      { id: "hom-factor-re", name: "Re" },
    ],
    rows: [],
  });
  assert.deepEqual(stored("Clas").columns.map((column) => column.name), ["Neg.", "Clasificación", "Factor resultante"]);
  assert.equal(stored("Clase").columns[1].name, "Clase", "a header the appraiser renamed stays");
});

/* ------------------------------------------------------------------ */
/*  7. No browser suggestions in captions                              */
/* ------------------------------------------------------------------ */

test("the description and the captions of an image take no browser suggestions", () => {
  const html = renderToStaticMarkup(createElement(ImageEditorItem, {
    image: { id: "img", title: "Fachada", src: "/fachada.png", enabled: true, captions: [{ id: "c1", text: "Vista frontal", position: "bottom", align: "center" }] },
    onRemove: noop,
    onUpdate: noop,
    readOnly: false,
  }));
  assert.match(html, /<input[^>]*aria-label="Descripción de la imagen"[^>]*autoComplete="off"|<input[^>]*autoComplete="off"[^>]*aria-label="Descripción de la imagen"/i);
  assert.match(html, /<input[^>]*aria-label="Leyenda 1"[^>]*autoComplete="off"/i);
});

/* ------------------------------------------------------------------ */
/*  8. «Plantilla», not «plantilla maestra»                            */
/* ------------------------------------------------------------------ */

test("the import of comparables speaks of «plantilla», as the rest of the interface", () => {
  for (const text of Object.values(IMPORT_TEMPLATE_WORDING)) assert.doesNotMatch(text, /maestra/i, text);
  assert.equal(IMPORT_TEMPLATE_WORDING.download, "Descargar plantilla");
  const html = renderToStaticMarkup(createElement(ImportComparablesDialog, { scope: { kind: "base", onImported: noop } }));
  assert.match(html, /Importar Excel/);
  assert.doesNotMatch(html, /maestra/i);
});

/* ------------------------------------------------------------------ */
/*  9. Ctrl+S saves                                                    */
/* ------------------------------------------------------------------ */

test("Ctrl+S and ⌘S are the save of the editor; with Shift or Alt they are not", () => {
  const key = (extra: Partial<KeyboardEvent>) => ({ key: "s", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...extra });
  assert.equal(isSaveShortcut(key({ ctrlKey: true })), true);
  assert.equal(isSaveShortcut(key({ metaKey: true })), true);
  assert.equal(isSaveShortcut(key({ ctrlKey: true, key: "S" })), true, "with Caps Lock on");
  assert.equal(isSaveShortcut(key({ ctrlKey: true, shiftKey: true })), false);
  assert.equal(isSaveShortcut(key({ ctrlKey: true, altKey: true })), false);
  assert.equal(isSaveShortcut(key({})), false, "an s typed in a field");
  assert.equal(isSaveShortcut(key({ ctrlKey: true, key: "z" })), false);
});

/* ------------------------------------------------------------------ */
/*  10. The <b> tags never show in a field                             */
/* ------------------------------------------------------------------ */

test("editing the text of a marked value keeps its marks; what is typed takes the marks around it", () => {
  assert.equal(withMarkedText("<b>PG test</b>", "PG tests"), "<b>PG tests</b>");
  assert.equal(withMarkedText("Casa <b>sola</b>", "Casa sola y"), "Casa <b>sola y</b>", "typed after the bold, it is bold");
  assert.equal(withMarkedText("<i>Casa</i> sola", "La Casa sola"), "<i>La Casa</i> sola", "at the start it takes the marks after it");
  assert.equal(withMarkedText("Casa <b>sola</b> de dos", "Casa de dos"), "Casa de dos", "deleting the marked word deletes its tags");
  assert.equal(withMarkedText("sin marcas", "sin marcas ya"), "sin marcas ya");
  assert.equal(withMarkedText("<u>igual</u>", "igual"), "<u>igual</u>");
});

test("a selection of the text maps to the value as written and back", () => {
  const value = "Casa <b>sola</b> de";
  assert.deepEqual(rawSelectionOf(value, 5, 9), { start: 8, end: 12 });
  assert.deepEqual(textSelectionOf(value, 8, 12), { start: 5, end: 9 });
  // Bold over «sola» selected in the field that shows the text.
  const raw = rawSelectionOf("Casa sola", 5, 9);
  assert.equal(toggleTextMark("Casa sola", "bold", raw.start, raw.end), "Casa <b>sola</b>");
});

test("the field shows the text without tags and the preview shows it as it prints", () => {
  const html = renderToStaticMarkup(
    <TextMarksField value="<b>PG test</b>" onChange={noop} disabled={false}>
      {(marked) => <input aria-label="Dato" value={marked.text} readOnly />}
    </TextMarksField>,
  );
  assert.match(html, /<input aria-label="Dato"[^>]*value="PG test"/);
  assert.doesNotMatch(html, /value="[^"]*&lt;b&gt;/);
  assert.match(html, /<strong>PG test<\/strong>/);
});

test("the concept editor never shows the tags in its fields", () => {
  const concept = (id: string, label: string, value: string, extra: Partial<Concept> = {}): Concept => ({ id, label, value, enabled: true, ...extra });
  const html = renderToStaticMarkup(createElement(ConceptEditorList, {
    concepts: [
      concept("a", "Calle", "<b>Camino</b> a los Sauces"),
      concept("b", "Descripción", "Casa <i>sola</i>", { type: "longText" }),
      concept("p", "", "<u>Texto corrido</u>", { type: "paragraph" }),
    ],
    onRemove: noop,
    onUpdate: noop,
    readOnly: false,
  }));
  assert.match(html, /value="Camino a los Sauces"/);
  assert.match(html, />Casa sola<\/textarea>/);
  assert.match(html, />Texto corrido<\/textarea>/);
  assert.doesNotMatch(html, /value="[^"]*&lt;[biu]&gt;|&lt;[biu]&gt;[^<]*<\/textarea>/);
  assert.equal(conceptPreview("<b>Camino</b> a los Sauces"), "Camino a los Sauces", "the picker of existing concepts lists the text");
});
