/**
 * QA of videos 8.13 and 8.14 (27 Nov 2026), what the editor shows whole: the
 * value in words of the conclusion read «(CU…» and the concluded value only
 * «M.N.», squeezed by «Vinculado con: …» in the same row (8.14, 49:13); the
 * label of the box where the market's «valor homologado a utilizar» is typed
 * was cut (8.13, 04:14).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CONCLUSION_KEYS, readsInWords } from "../src/features/valuations/calculation/conclusion-document";
import { generatedTable, moneyColumn } from "../src/features/valuations/calculation/generated-content";
import { ConceptCalculationLinkScope, ConceptEditorList, ConclusionSourcesScope } from "../src/features/valuations/components/editor/concept-editor";
import { GeneratedTableEditor } from "../src/features/valuations/components/editor/generated-table-editor";
import type { Concept } from "../src/features/valuations/model";

const noop = () => undefined;
const WORDS = "(OCHO MILLONES QUINIENTOS MIL PESOS 00/100 M.N.)";
const concluded: Concept = { id: "valor", label: "Valor concluido", value: "8500000.00", type: "currency", valueFormat: "mxn-mn", calculationKey: CONCLUSION_KEYS.value, enabled: true };
const inWords: Concept = { id: "letra", label: "Valor concluido con letra", value: WORDS, calculationKey: CONCLUSION_KEYS.words, enabled: true };

const conclusionHtml = (concepts: Concept[]) => renderToStaticMarkup(
  <ConclusionSourcesScope value={{ [CONCLUSION_KEYS.value]: "Enfoque de costos", [CONCLUSION_KEYS.words]: "Enfoque de costos, en letra" }}>
    <ConceptCalculationLinkScope value={{ isCalculated: () => true, onSetLinked: noop }}>
      <ConceptEditorList concepts={concepts} layout="caratulaGrid" enableLayoutControls onRemove={noop} onUpdate={noop} readOnly={false} />
    </ConceptCalculationLinkScope>
  </ConclusionSourcesScope>,
);

/** The rows of a concept: its grid, and the cells of the grid in order. */
const rowOf = (html: string, id: string) => {
  const start = html.indexOf(`data-concept-id="${id}"`);
  assert.ok(start >= 0, `concept ${id}`);
  const next = html.indexOf("data-concept-id=", start + 1);
  return html.slice(start, next === -1 ? undefined : next);
};

test("the value in words is a field that wraps, with the whole text (QA of video 8.14, 49:13)", () => {
  assert.equal(readsInWords(inWords), true);
  assert.equal(readsInWords({ label: "Cifra en letras", value: "" } as Concept), true, "the carátula's, saved before it carried its key");
  assert.equal(readsInWords({ ...concluded, valueFormat: "words" }), true, "an amount with the format «En letra»");
  assert.equal(readsInWords(concluded), false);

  const row = rowOf(conclusionHtml([inWords]), "letra");
  const field = row.match(/<textarea[^>]*data-value-in-words=""[^>]*>([^<]*)<\/textarea>/);
  assert.ok(field, "a textarea, not a one-line input cut at its width");
  assert.equal(field[1], WORDS);
  assert.match(field[0], /rows="1"/);
  assert.doesNotMatch(row, /<input[^>]*value="\(OCHO/, "no one-line input with the words");

  // An amount printed «En letra» shows its words whole too; it is typed as its figure.
  const amount = rowOf(conclusionHtml([{ ...concluded, valueFormat: "words" }]), "valor");
  assert.match(amount, /<textarea[^>]*data-value-in-words=""[^>]*>\(OCHO MILLONES QUINIENTOS MIL PESOS 00\/100 M\.N\.\)<\/textarea>/);
});

test("«Vinculado con: …» goes on its own line under the value, not beside it taking its width (QA of video 8.14, 49:13)", () => {
  const html = conclusionHtml([concluded, inWords]);
  for (const id of ["valor", "letra"]) {
    const row = rowOf(html, id);
    const badgeRow = row.match(/<div[^>]*data-calculation-link-row=""[^>]*>/);
    assert.ok(badgeRow, `${id}: the badge has a row of its own`);
    assert.match(badgeRow[0], /col-span-2 col-start-3/, "under the value and the menu");
    // The badge is after the ⋮ menu: the value's column is not shared with it.
    assert.ok(row.indexOf("data-calculation-link-row") > row.indexOf('aria-label="Opciones del concepto'), `${id}: after the actions`);
  }
  assert.match(rowOf(html, "valor"), /Vinculado con: Enfoque de costos</);
  assert.match(rowOf(html, "letra"), /Vinculado con: Enfoque de costos, en letra</);
  // The concluded value is still the one-line field with its figure.
  assert.match(rowOf(html, "valor"), /<input[^>]*value="\$8,500,000\.00 M\.N\."/);

  // A concept no calculation writes has no extra line.
  const plain = renderToStaticMarkup(createElement(ConceptEditorList, { concepts: [inWords], layout: "caratulaGrid", onRemove: noop, onUpdate: noop, readOnly: false }));
  assert.doesNotMatch(plain, /data-calculation-link-row/);
});

test("the label of a box row is as wide as its text: «Valor homologado a utilizar» whole beside the figure he types (QA of video 8.13, 04:14)", () => {
  for (const label of ["Valor homologado a utilizar:", "Renta homologada a utilizar:"]) {
    const table = generatedTable("motor-mercado-tabla-homologacion", "Homologación", [moneyColumn("Valor")], [["$ 1.00"]], {
      summaryBoxes: [{ id: "adoptado", position: "bottom", align: "end", rows: [{ id: "valor", label, value: "$ 35,000.00", emphasis: "strong" }] }],
    });
    const html = renderToStaticMarkup(createElement(GeneratedTableEditor, { table, readOnly: false, onUpdate: noop }));
    const field = html.match(new RegExp(`<input[^>]*value="${label}"[^>]*>`));
    assert.ok(field, label);
    assert.match(field[0], /field-sizing-content/, "the field grows with its text");
  }
});
