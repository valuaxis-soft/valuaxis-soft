import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { activeTextMarks, applyTextMark, hasTextMarks, parseTextMarks, stripTextMarks, toggleTextMark } from "../src/features/valuations/services/text-marks";
import { TextMarksField } from "../src/features/valuations/components/editor/text-marks-toolbar";
import { draftFactsFor } from "../src/features/valuations/services/draft-facts";
import { ConceptEditorList } from "../src/features/valuations/components/editor/concept-editor";
import { commonSpacingAfter, ConceptSelectionScope } from "../src/features/valuations/components/editor/concept-selection";
import { createConcept } from "../src/features/valuations/components/workspace/model/content-factories";
import { hydrateConceptMetadata } from "../src/features/valuations/metadata";
import type { Concept } from "../src/features/valuations/model";

const concept = (id: string, label: string, value: string, extra: Partial<Concept> = {}): Concept => ({ id, label, value, enabled: true, ...extra });
const noop = () => {};

/* ------------------------------------------------------------------ */
/*  Marks in a value                                                   */
/* ------------------------------------------------------------------ */

test("marks are read as runs of text and stripped for plain-text readers", () => {
  assert.deepEqual(parseTextMarks("Casa <b>sola</b> de <i>dos <u>niveles</u></i>"), [
    { text: "Casa ", bold: false, italic: false, underline: false },
    { text: "sola", bold: true, italic: false, underline: false },
    { text: " de ", bold: false, italic: false, underline: false },
    { text: "dos ", bold: false, italic: true, underline: false },
    { text: "niveles", bold: false, italic: true, underline: true },
  ]);
  assert.deepEqual(parseTextMarks("sin marcas"), [{ text: "sin marcas", bold: false, italic: false, underline: false }]);
  assert.deepEqual(parseTextMarks(""), []);
  // A tag left open lasts to the end; anything that is not one of ours is text.
  assert.deepEqual(parseTextMarks("<b>abierta <span>x</span>"), [{ text: "abierta <span>x</span>", bold: true, italic: false, underline: false }]);

  assert.equal(stripTextMarks("Casa <b>sola</b> de <i>dos <u>niveles</u></i>"), "Casa sola de dos niveles");
  assert.equal(stripTextMarks("7 < 10 y <b>a</b>"), "7 < 10 y a", "a lone angle bracket stays");
  assert.equal(hasTextMarks("<u>x</u>"), true);
  assert.equal(hasTextMarks("<span>x</span>"), false);
});

test("a mark toggles on the selection, or on the whole value when nothing is selected", () => {
  assert.equal(toggleTextMark("Casa sola", "bold"), "<b>Casa sola</b>");
  assert.equal(toggleTextMark("<b>Casa sola</b>", "bold"), "Casa sola", "the whole value loses the mark it had");
  assert.equal(toggleTextMark("Casa sola", "italic", 5, 9), "Casa <i>sola</i>");
  assert.equal(toggleTextMark("Casa <i>sola</i>", "italic", 5, 16), "Casa sola", "selecting the marked text with its tags removes them");
  assert.equal(toggleTextMark("Casa <i>sola</i>", "italic", 8, 12), "Casa sola", "selecting only the text inside the tags removes them too");
  assert.equal(toggleTextMark("Casa sola", "underline", 9, 5), "Casa <u>sola</u>", "a backwards selection reads the same");
  assert.equal(toggleTextMark("Casa sola de", "bold", 4, 10), "Casa <b>sola</b> de", "blank edges stay outside the mark");
  assert.equal(toggleTextMark("Casa sola", "bold", 4, 5), "Casa sola", "a blank selection changes nothing");
  assert.equal(toggleTextMark("", "bold"), "");
  assert.equal(toggleTextMark("<b>Casa</b> sola", "italic", 3, 7), "<b><i>Casa</i></b> sola", "marks nest");
});

test("a mark comes off as easily as it goes on, whatever the selection takes of its tags", () => {
  const bold = "Casa <b>sola de dos</b> niveles";
  // Only a word inside the bold: that word loses it, the rest keeps it.
  assert.equal(toggleTextMark(bold, "bold", 16, 19), "Casa <b>sola de </b>dos niveles");
  assert.equal(toggleTextMark(bold, "bold", 8, 12), "Casa sola<b> de dos</b> niveles");
  // Half a tag or a tag and a half in the selection read as the text alone.
  assert.equal(toggleTextMark(bold, "bold", 6, 22), "Casa sola de dos niveles");
  assert.equal(toggleTextMark(bold, "bold", 5, 23), "Casa sola de dos niveles");
  // Bold over text that is partly bold makes all of it bold, without nesting tags.
  assert.equal(toggleTextMark(bold, "bold"), "<b>Casa sola de dos niveles</b>");
  assert.equal(toggleTextMark(toggleTextMark(bold, "bold"), "bold"), "Casa sola de dos niveles", "and once more takes it off");
  // Only the caret inside a bold stretch: the button takes the bold off that stretch.
  assert.equal(toggleTextMark(bold, "bold", 10, 10), "Casa sola de dos niveles");
  assert.equal(toggleTextMark("Casa sola", "italic", 2, 2), "<i>Casa sola</i>", "outside any, the whole value");
  assert.equal(toggleTextMark("<b><i>Casa</i></b>", "italic", 6, 6), "<b>Casa</b>", "the other marks stay");

  // The selection follows the text it worked on.
  assert.deepEqual(applyTextMark("Casa sola", "bold", 5, 9), { value: "Casa <b>sola</b>", selectionStart: 8, selectionEnd: 12 });
  assert.deepEqual(applyTextMark("Casa <b>sola</b>", "bold", 8, 12), { value: "Casa sola", selectionStart: 5, selectionEnd: 9 });
});

test("the buttons know which marks the text they would work on already has", () => {
  const value = "Casa <b>sola <i>de</i></b> dos";
  const none = { bold: false, italic: false, underline: false };
  assert.deepEqual(activeTextMarks(value), none, "the whole value is not bold throughout");
  assert.deepEqual(activeTextMarks("<u><b>Casa</b> sola</u>"), { ...none, underline: true });
  assert.deepEqual(activeTextMarks(value, 8, 12), { ...none, bold: true }, "the selected word");
  assert.deepEqual(activeTextMarks(value, 16, 18), { ...none, bold: true, italic: true });
  assert.deepEqual(activeTextMarks(value, 2, 12), none, "a selection only partly bold");
  assert.deepEqual(activeTextMarks(value, 8, 13), { ...none, bold: true }, "a blank edge does not count");
  // The caret: the character before it decides, at the start of a stretch the one after.
  assert.deepEqual(activeTextMarks(value, 10, 10), { ...none, bold: true });
  assert.deepEqual(activeTextMarks(value, 17, 17), { ...none, bold: true, italic: true });
  assert.deepEqual(activeTextMarks(value, 2, 2), none);
  assert.deepEqual(activeTextMarks("<b>Casa</b>", 0, 0), { ...none, bold: true });
  assert.deepEqual(activeTextMarks(""), none);
});

test("the format buttons show themselves pressed and the marked text shows as it prints", () => {
  const render = (value: string) => renderToStaticMarkup(
    <TextMarksField value={value} onChange={noop} disabled={false}>
      <textarea value={value} readOnly />
    </TextMarksField>,
  );
  const marked = render("<b>Casa sola</b> de dos");
  assert.match(marked, /aria-label="Negrita" aria-pressed="false"/, "only part of the value is bold");
  assert.match(marked, /data-text-marks-preview=""[^>]*><span[^>]*><span><strong>Casa sola<\/strong><\/span><span> de dos<\/span><\/span><\/p>/);

  const whole = render("<i>Casa sola</i>");
  assert.match(whole, /aria-label="Cursiva" aria-pressed="true" data-active=""/);
  assert.match(whole, /aria-label="Negrita" aria-pressed="false"/);

  assert.doesNotMatch(render("Casa sola"), /data-text-marks-preview/, "plain text needs no preview");
});

test("the facts an AI draft is written from carry the text without marks", () => {
  const container = [
    concept("target", "Descripción", ""),
    concept("uso", "Uso", "Habitacional <b>unifamiliar</b>"),
    concept("niveles", "Niveles", "2", { type: "text", valueFormat: "plain" }),
  ];
  assert.deepEqual(draftFactsFor(container[0], container, container), [
    { label: "Uso", value: "Habitacional unifamiliar" },
    { label: "Niveles", value: "2" },
  ]);
});

/* ------------------------------------------------------------------ */
/*  Paragraph in the editor                                            */
/* ------------------------------------------------------------------ */

test("a new paragraph is a concept with no label that the saved metadata keeps as a paragraph", () => {
  const paragraph = createConcept(undefined, "paragraph");
  assert.equal(paragraph.type, "paragraph");
  assert.equal(paragraph.label, "");
  assert.equal(paragraph.value, "");
  assert.equal(hydrateConceptMetadata({ type: "paragraph" }).type, "paragraph");
  assert.equal(hydrateConceptMetadata({ payload: { type: "paragraph" } }).type, "paragraph");
  assert.equal(hydrateConceptMetadata({ type: "texto" }).type, undefined);
});

test("the editor shows a paragraph as one text field with its format buttons and no title", () => {
  const html = renderToStaticMarkup(createElement(ConceptEditorList, {
    concepts: [concept("p", "", "Texto corrido", { type: "paragraph" }), concept("d", "Niveles", "2")],
    onRemove: noop,
    onUpdate: noop,
    readOnly: false,
  }));
  const [paragraphRow] = html.split('aria-label="Mover concepto"').slice(1);
  assert.match(paragraphRow, /<textarea[^>]*aria-label="Párrafo"[^>]*>Texto corrido<\/textarea>/);
  assert.doesNotMatch(paragraphRow.split("data-concept-name")[0], /placeholder="Título"|value="Niveles"/);
  assert.match(html, /data-concept-paragraph=""/);
  assert.equal(html.match(/role="toolbar" aria-label="Formato del texto"/g)?.length, 2, "the paragraph and the text concept both take marks");
  assert.match(html, /aria-label="Negrita"[^>]*>N<\/button>/);
  assert.match(html, /aria-label="Cursiva"[^>]*>K<\/button>/);
  assert.match(html, /aria-label="Subrayado"[^>]*>S<\/button>/);

  // A date or a number reads as one value: no marks.
  const dated = renderToStaticMarkup(createElement(ConceptEditorList, {
    concepts: [concept("f", "Fecha", "2024-02-12", { type: "date" }), concept("s", "Superficie", "160", { type: "text", valueFormat: "m2" })],
    onRemove: noop,
    onUpdate: noop,
    readOnly: false,
  }));
  assert.doesNotMatch(dated, /aria-label="Negrita"[^>]*>N<\/button>/);
});

/* ------------------------------------------------------------------ */
/*  Choosing several concepts for one spacing                          */
/* ------------------------------------------------------------------ */

test("a container with concepts offers to select several of them; a read-only one does not", () => {
  const concepts = [concept("a", "Propietario", "Juan", { spacingAfter: 15 }), concept("b", "Solicitante", "Ana", { spacingAfter: 15 })];
  const html = renderToStaticMarkup(createElement(ConceptSelectionScope, {
    concepts,
    readOnly: false,
    onApplySpacing: noop,
    actions: createElement("button", null, "Agregar"),
  }, createElement("p", null, "filas")));
  assert.match(html, /Agregar<\/button>[\s\S]*Seleccionar conceptos<\/button><\/div><p>filas<\/p>/);

  const readOnly = renderToStaticMarkup(createElement(ConceptSelectionScope, { concepts, readOnly: true, onApplySpacing: noop }, createElement("p", null, "filas")));
  assert.doesNotMatch(readOnly, /Seleccionar conceptos/);
  const single = renderToStaticMarkup(createElement(ConceptSelectionScope, { concepts: concepts.slice(0, 1), readOnly: false, onApplySpacing: noop }, createElement("p", null, "filas")));
  assert.doesNotMatch(single, /Seleccionar conceptos/);

  assert.equal(commonSpacingAfter(concepts), 15);
  assert.equal(commonSpacingAfter([concepts[0], concept("c", "Objeto", "")]), null, "0 and 15 differ");
  assert.equal(commonSpacingAfter([concept("c", "Objeto", ""), concept("d", "Fin", "", { spacingAfter: 0 })]), 0);
  assert.equal(commonSpacingAfter([]), null);
});
