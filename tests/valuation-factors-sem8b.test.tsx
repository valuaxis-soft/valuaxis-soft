/**
 * The homologation factors after videos 8.13 and 8.14 (27 Nov 2026): six
 * factors in machinery too, the justification of the factors right under the
 * homologation table in the tones of the document's palette, written in its
 * own fields and not repeated among the table's notes, and no sentence about
 * the precision over the table.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { figureColumn, generatedTable } from "../src/features/valuations/calculation/generated-content";
import { machineryInputSchema } from "../src/features/valuations/calculation/machinery-schemas";
import {
  LEGACY_MAX_MACHINERY_FACTORS,
  MACHINERY_FACTOR_LIMIT_MESSAGE,
  MAX_MACHINERY_FACTORS,
  machineryFactorCountAllowed,
} from "../src/features/valuations/calculation/machinery-types";
import { precisionExplanation } from "../src/features/valuations/components/calculation/calculation-precision-control";
import { DocumentTable } from "../src/features/valuations/components/document-table";
import { TableNotesEditor } from "../src/features/valuations/components/editor/table-notes-editor";
import type { TableNote } from "../src/features/valuations/services/table";

const JUSTIFICATION: TableNote[] = [
  { position: "table", justification: true, heading: true, text: "Justificación de los factores utilizados" },
  { position: "table", justification: true, label: "Comparable 1:", text: "Frente menor al del sujeto." },
];

test("V8.13 18:01: machinery takes six factors too, the FEd among them; one saved with more keeps them and adds none", () => {
  assert.equal(MAX_MACHINERY_FACTORS + 1, 6, "the FEd and five more");
  assert.match(MACHINERY_FACTOR_LIMIT_MESSAGE, /hasta 6 factores contando el FEd, sin contar el FRe/);
  assert.equal(machineryFactorCountAllowed(5, 4), true);
  assert.equal(machineryFactorCountAllowed(6, 5), false, "a seventh with the FEd is not added");
  assert.equal(machineryFactorCountAllowed(8, 8), true, "one saved with more keeps them");
  const columns = (count: number) => Array.from({ length: count }, (_, index) => ({ key: `xf${index}`, label: `F${index}` }));
  assert.equal(machineryInputSchema.safeParse({ market: { offerLevel: null, usefulLife: null, offers: [], characteristics: [], rounding: null, factorColumns: columns(LEGACY_MAX_MACHINERY_FACTORS) } }).success, true);
  const beyond = machineryInputSchema.safeParse({ market: { offerLevel: null, usefulLife: null, offers: [], characteristics: [], rounding: null, factorColumns: columns(LEGACY_MAX_MACHINERY_FACTORS + 1) } });
  assert.equal(beyond.success, false);
});

test("V8.13 02:02 / V8.14 36:16: the justification prints under the table, before its boxes, in a frame of the palette's tones", () => {
  const table = generatedTable("t", "Homologación", [figureColumn("REF"), figureColumn("FRe")], [["1", "0.95"]], {
    notes: [{ position: "table", text: "Cuando el factor de homologación es menor a la unidad…" }, ...JUSTIFICATION],
    summaryBoxes: [{ id: "valor", position: "bottom", rows: [{ id: "valor", label: "VALOR COMPARATIVO:", value: "$ 1.00" }] }],
  });
  const html = renderToStaticMarkup(createElement(DocumentTable, { variant: "report", table }));
  const frame = html.indexOf("data-factor-justification");
  assert.ok(frame > 0, "the toned frame");
  assert.ok(frame < html.indexOf("VALOR COMPARATIVO"), "before the boxes and the market's value");
  assert.ok(html.indexOf("Cuando el factor") < frame, "after the legend of the table");
  const frameHtml = html.slice(html.lastIndexOf("<div", frame), html.indexOf("</div>", frame));
  assert.match(frameHtml, /var\(--doc-pastel-soft,#E7EEF7\)/, "the palette's soft tone, the default palette's when none was chosen");
  assert.match(frameHtml, /var\(--doc-apartado,#2F5495\)/);
  assert.match(frameHtml, /var\(--doc-on-pastel-soft,#00285A\)[^>]*>Comparable 1:/, "the comparable in the strong colour");
  assert.doesNotMatch(frameHtml, /#[0-9A-Fa-f]{6}(?!\))/, "no fixed colour outside a var() fallback");
});

test("the justification is written in its own fields under the table, not repeated among the table's notes", () => {
  const notes = [{ position: "table" as const, text: "Cuando el factor de homologación es menor a la unidad…" }, ...JUSTIFICATION];
  const html = renderToStaticMarkup(createElement(TableNotesEditor, { notes, readOnly: false, onChange: () => undefined }));
  assert.match(html, /Cuando el factor de homologación/);
  assert.doesNotMatch(html, /Frente menor al del sujeto|Justificación de los factores utilizados/);
  // The annex's summary is seen as it prints, and said where it is written.
  const summary = renderToStaticMarkup(createElement(TableNotesEditor, {
    notes: JUSTIFICATION.map((note) => ({ ...note, fromApproach: true })), readOnly: false, onChange: () => undefined,
  }));
  assert.match(summary, /data-justification-summary[\s\S]*Comparable 1: [\s\S]*Frente menor al del sujeto\.[\s\S]*se cambia allá/);
  assert.doesNotMatch(summary, /aria-label="Nota 1 de la tabla"/, "not as an editable note");
  // The capture writes the justification in its slot under the notes, before the boxes, in every market and in machinery.
  const editor = readFileSync("src/features/valuations/components/editor/generated-table-editor.tsx", "utf8");
  assert.ok(editor.indexOf('part: "notes"') > editor.indexOf("<TableNotesEditor"));
  assert.ok(editor.indexOf('part: "notes"') < editor.indexOf("<GeneratedBoxLabels"));
  for (const panel of ["market-calculation-panel.tsx", "machinery-calculation-panel.tsx"]) {
    const source = readFileSync(`src/features/valuations/components/calculation/${panel}`, "utf8");
    const slot = source.indexOf('part: "notes" }} fallback>');
    assert.ok(slot > 0, panel);
    assert.ok(source.indexOf("<FactorJustificationCapture", slot) - slot < 200, `${panel}: the justification in that slot`);
  }
});

test("V8.13 18:34: what the precision means, in plain words, for either choice", () => {
  assert.match(precisionExplanation({ decimals: 2, calculateWithShown: true }), /2 decimales y se multiplican tal como se ven/);
  assert.match(precisionExplanation({ decimals: 4, calculateWithShown: false }), /4 decimales, pero se multiplican con todos sus decimales/);
});
