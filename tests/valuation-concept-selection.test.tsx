import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { documentBlockFlowItems } from "../src/features/valuations/components/document-block-renderer";
import { DocumentThemeProvider } from "../src/features/valuations/components/document-theme";
import { PagePresentationProvider } from "../src/features/valuations/components/page-presentation-context";
import { conceptPreview, ConceptCreationControl } from "../src/features/valuations/components/editor/concept-creation-control";
import { ConceptEditorList } from "../src/features/valuations/components/editor/concept-editor";
import { ConceptSelectionScope, NO_CONCEPTS_TO_SELECT } from "../src/features/valuations/components/editor/concept-selection";
import { conceptDeletionAsksFirst } from "../src/features/valuations/components/editor/delete-confirm";
import { V2RowContent } from "../src/features/valuations/components/editor/editable-content-layout-v2";
import { staysOpenAfterPress } from "../src/features/valuations/components/editor/popover-drag-guard";
import { TextMarksField } from "../src/features/valuations/components/editor/text-marks-toolbar";
import { importBlockSummary, importSectionHeading } from "../src/features/valuations/components/workspace/template-dialogs";
import type { Block, Concept, ContentLayout } from "../src/features/valuations/model";
import { conceptContextMenu, type ConceptMenuTarget } from "../src/features/valuations/services/concept-context-menu";
import { parseIndentOffset, MAX_OFFSET_PX, MIN_OFFSET_PX, setConceptCellsPresentation } from "../src/features/valuations/services/concept-presentation";
import { CONCEPT_CREATION_OPTIONS, conceptDataTypePatch } from "../src/features/valuations/services/concept-types";
import { normalizeContentLayout, rowPrintsAsTags, setConceptRowsTagStyle } from "../src/features/valuations/services/content-layout";
import { DEFAULT_PAGE_PRESENTATION } from "../src/features/valuations/services/page-presentation";

const noop = () => undefined;
const concept = (id: string, label: string, value: string, extra: Partial<Concept> = {}): Concept => ({ id, label, value, enabled: true, ...extra });
const block = (id: string, extra: Partial<Block> = {}): Block => ({
  id, title: id.toUpperCase(), sectionLabel: "", enabled: true, required: false,
  concepts: [], apartados: [], tables: [], images: [], ...extra,
});
const printed = (node: ReactNode) =>
  renderToStaticMarkup(
    <PagePresentationProvider presentation={DEFAULT_PAGE_PRESENTATION}>
      <DocumentThemeProvider variant="standard">{node}</DocumentThemeProvider>
    </PagePresentationProvider>,
  );
const oneRow = (tagStyle: "white" | "shaded" | undefined, items: Array<{ type: "concept" | "image" | "table"; id: string }>): ContentLayout => ({
  version: 2,
  rows: [{ id: "r1", ...(tagStyle ? { tagStyle } : {}), columns: items.map((item, index) => ({ id: `c${index}`, items: [item] })) }],
});

/* ------------------------------------------------------------------ */
/*  V5.2-02, V5.6-02, V5.5-04: one first line, in every container      */
/* ------------------------------------------------------------------ */

test("the first line of a block or subbloque holds «Agregar» on the left and «Seleccionar conceptos» on the right, over a line", () => {
  const html = renderToStaticMarkup(createElement(ConceptSelectionScope, {
    concepts: [concept("a", "Propietario", "Ana")],
    readOnly: false,
    onApplySpacing: noop,
    actions: createElement("button", null, "Agregar"),
  }, createElement("p", null, "contenido")));
  const firstLine = /<div class="([^"]*)" data-container-actions="">([\s\S]*?)<\/div><p>contenido<\/p>/.exec(html);
  assert.ok(firstLine, "the actions are one line, before the content");
  assert.match(firstLine[1], /border-b border-dashed/, "a dashed line sets them apart from the content");
  assert.match(firstLine[2], /^<button>Agregar<\/button><button[^>]*class="[^"]*ml-auto[^"]*"[\s\S]*Seleccionar conceptos<\/button>$/, "Agregar first, the selection pushed to the right");
});

test("«Seleccionar conceptos» shows in a container with no concepts yet, disabled with the reason (V5.5-04)", () => {
  const html = renderToStaticMarkup(createElement(ConceptSelectionScope, { concepts: [], readOnly: false, onApplySpacing: noop, actions: createElement("button", null, "Agregar") }));
  assert.match(html, /<button[^>]*disabled=""[^>]*title="Todavía no hay conceptos aquí[^"]*"[^>]*>[\s\S]*Seleccionar conceptos<\/button>/);
  assert.match(NO_CONCEPTS_TO_SELECT, /Agregar/);
  const readOnly = renderToStaticMarkup(createElement(ConceptSelectionScope, { concepts: [], readOnly: true, onApplySpacing: noop }));
  assert.doesNotMatch(readOnly, /Seleccionar conceptos/);
});

/* ------------------------------------------------------------------ */
/*  V5.6-13, V5.5-03, V5.7-19: «Renglón: Etiquetas» with one concept   */
/* ------------------------------------------------------------------ */

test("a row prints with labels with one concept alone or a long text too, and the editor asks the same question", () => {
  assert.equal(rowPrintsAsTags("shaded", [{ type: "concept" }]), true, "one concept alone");
  assert.equal(rowPrintsAsTags("white", [{ type: "concept" }, { type: "concept" }]), true);
  assert.equal(rowPrintsAsTags("shaded", [{ type: "concept" }, { type: "image" }]), false, "a row with an image prints as columns");
  assert.equal(rowPrintsAsTags(undefined, [{ type: "concept" }]), false);
  assert.equal(rowPrintsAsTags("shaded", []), false);

  // The style is kept when the layout is read back, with one concept in the row.
  assert.equal(normalizeContentLayout(oneRow("shaded", [{ type: "concept", id: "s" }])).rows[0].tagStyle, "shaded");
  // "Renglón" from the selection reaches the row of a concept alone.
  const styled = setConceptRowsTagStyle(oneRow(undefined, [{ type: "concept", id: "s" }]), ["s"], "white");
  assert.equal(styled.rows[0].tagStyle, "white");

  const surface = block("terreno", {
    concepts: [concept("s", "Superficie total de terreno", "250.00 m²"), concept("l", "Colindancias", "Al norte en 20.00 m con lote 14; al sur en 20.00 m con calle Pino; al oriente en 12.50 m con lote 16.", { type: "longText" })],
    contentLayout: { version: 2, rows: [
      { id: "r1", tagStyle: "shaded", columns: [{ id: "c1", items: [{ type: "concept", id: "s" }] }] },
      { id: "r2", tagStyle: "white", columns: [{ id: "c2", items: [{ type: "concept", id: "l" }] }] },
    ] },
  });
  const html = printed(<>{documentBlockFlowItems(surface).map((item) => <div key={item.id}>{item.node}</div>)}</>);
  assert.equal(html.match(/data-concept-tag="shaded"/g)?.length, 1, "the concept alone prints as a shaded label");
  assert.equal(html.match(/data-concept-tag="white"/g)?.length, 1, "the long text prints as a white label");
  assert.match(html, /Colindancias/);

  // The editor marks the same row, and no longer repeats the "Renglón" buttons over it.
  const editorRow = renderToStaticMarkup(createElement(V2RowContent, {
    row: { id: "r1", tagStyle: "shaded", columns: [{ id: "c1", items: [{ type: "concept", id: "s" }] }] },
    rowIndex: 0,
    activeColumnId: null,
    activeTarget: null,
    renderItem: () => createElement("span", null, "concepto"),
    disabled: false,
  }));
  assert.match(editorRow, /data-row-tags="shaded"/);
  assert.match(editorRow, /data-row-tag-note=""[^>]*>Renglón: se imprime con etiquetas sombreadas/);
  assert.doesNotMatch(editorRow, /data-row-tag-control|role="radiogroup"/);
});

/* ------------------------------------------------------------------ */
/*  V5.2-02: N/K/S of a concept only while it is written in             */
/* ------------------------------------------------------------------ */

test("the N/K/S of a concept stay hidden until its field is being written in: not on hover, not because the text has marks", () => {
  const html = renderToStaticMarkup(<TextMarksField value="<b>Casa</b> habitación" onChange={noop} disabled={false}><input readOnly /></TextMarksField>);
  const toolbar = /<div class="([^"]*)" role="toolbar" aria-label="Formato del texto">/.exec(html);
  assert.ok(toolbar);
  assert.match(toolbar[1], /\binvisible\b/);
  assert.match(toolbar[1], /group-focus-within\/marks:visible/);
  assert.doesNotMatch(toolbar[1], /group-hover/);
});

/* ------------------------------------------------------------------ */
/*  V5.6-11, V5.6-14: Sangría with a number that can be typed           */
/* ------------------------------------------------------------------ */

test("the indentation typed as a number is kept within its range, and the selection gives it to the cells of the chosen concepts", () => {
  assert.equal(parseIndentOffset("102"), 102);
  assert.equal(parseIndentOffset("+102 px"), 102);
  assert.equal(parseIndentOffset("-20"), -20);
  assert.equal(parseIndentOffset("12.6"), 13);
  assert.equal(parseIndentOffset("999"), MAX_OFFSET_PX);
  assert.equal(parseIndentOffset("-999"), MIN_OFFSET_PX);
  assert.equal(parseIndentOffset(""), null);
  assert.equal(parseIndentOffset("-"), null, "a sign alone is still being typed");

  const layout = oneRow(undefined, [{ type: "concept", id: "a" }, { type: "concept", id: "b" }, { type: "image", id: "i" }]);
  const indented = setConceptCellsPresentation(layout, new Set(["a"]), { mode: "custom", labelGuideOffsetPx: 40 });
  assert.deepEqual(indented.rows[0].columns.map((column) => column.conceptPresentation), [{ mode: "custom", labelGuideOffsetPx: 40 }, undefined, undefined]);
  const back = setConceptCellsPresentation(indented, new Set(["a"]), undefined);
  assert.equal(back.rows[0].columns[0].conceptPresentation, undefined, "Predeterminada puts back the default");
});

/* ------------------------------------------------------------------ */
/*  V5.6-06: one concept goes at once; more than three ask first        */
/* ------------------------------------------------------------------ */

test("deleting up to three concepts does not ask; more than three do", () => {
  assert.equal(conceptDeletionAsksFirst(1), false);
  assert.equal(conceptDeletionAsksFirst(3), false);
  assert.equal(conceptDeletionAsksFirst(4), true);
});

/* ------------------------------------------------------------------ */
/*  V5.6-08: «Tipo de dato» in the paragraph too                        */
/* ------------------------------------------------------------------ */

test("a paragraph changes its data type, and a text turns into a paragraph", () => {
  assert.ok(CONCEPT_CREATION_OPTIONS.some((option) => option.kind === "paragraph"));
  assert.deepEqual(conceptDataTypePatch({ type: "paragraph" }, "text"), { type: "text", valueFormat: undefined, options: undefined });
  const target: ConceptMenuTarget = {
    generated: false, readOnly: false, takesTextMarks: true, hasValue: true, valueFormat: "unsupported",
    date: false, hasLineBreaks: false, canRowStyle: true, canDuplicate: true, canMoveTo: true, canSelect: true, canDelete: true,
  };
  const dataType = conceptContextMenu(target).flat().find((item) => item.action === "data-type");
  assert.equal(dataType?.disabled, undefined, "enabled for every concept the appraiser writes");

  const html = renderToStaticMarkup(createElement(ConceptEditorList, { concepts: [concept("p", "", "Texto del párrafo", { type: "paragraph" })], onRemove: noop, onUpdate: noop, readOnly: false }));
  assert.match(html, /data-concept-paragraph/);
});

/* ------------------------------------------------------------------ */
/*  V5.6-17, V5.6-18, V5.6-22: the «Concepto» picker                    */
/* ------------------------------------------------------------------ */

test("the picker of existing concepts lists the whole value; its popover stays open when a press that began inside ends outside", () => {
  const long = "Zapopan, Jalisco a 2 de Octubre de 2026 · Calle Pino 123, Colonia Ejemplo";
  assert.equal(conceptPreview(long), long, "not cut at 42 characters");
  assert.equal(conceptPreview("  "), "Sin dato");

  assert.equal(staysOpenAfterPress("outside-press", true), true, "text selected in the search box and let go outside");
  assert.equal(staysOpenAfterPress("outside-press", false), false, "a click outside still closes it");
  assert.equal(staysOpenAfterPress("escape-key", true), false);

  // Closed it renders only its trigger, as large as the other options of «Agregar».
  const html = renderToStaticMarkup(createElement(ConceptCreationControl, { conceptReferences: [], conceptSearch: "", onAddConcept: noop, onConceptSearchChange: noop, readOnly: false, triggerClassName: "h-10 w-full justify-start text-sm" }));
  assert.match(html, /h-10 w-full justify-start text-sm/);
  assert.match(html, /Concepto<\/button>/);
});

/* ------------------------------------------------------------------ */
/*  UNI-04: the format opens from the value                             */
/* ------------------------------------------------------------------ */

test("a number shows its format at the end of its value, and a click there opens «Formato del valor»", () => {
  const html = renderToStaticMarkup(createElement(ConceptEditorList, {
    concepts: [concept("s", "Superficie", "250", { type: "number", valueFormat: "m2" }), concept("t", "Uso", "Habitacional")],
    enableLayoutControls: true,
    onRemove: noop,
    onUpdate: noop,
    readOnly: false,
  }));
  assert.equal(html.match(/data-concept-value-format-chip=""/g)?.length, 1, "only the number, not the plain text");
  assert.match(html, /aria-label="Formato del valor: m²"/);
});

/* ------------------------------------------------------------------ */
/*  V5.6-23, V5.6-24: import and save as template                       */
/* ------------------------------------------------------------------ */

test("importing a block speaks of subbloques and groups the blocks under «Sección: …»", () => {
  const sample = block("b", { concepts: [concept("a", "A", "1"), concept("b", "B", "2")], apartados: [{ id: "ap", title: "AP", enabled: true, concepts: [], tables: [], images: [] }] });
  assert.equal(importBlockSummary(sample), "2 conceptos · 1 subbloque · 0 tablas");
  assert.doesNotMatch(importBlockSummary(sample), /apartado/);
  assert.equal(importSectionHeading("Datos"), "Sección: Datos");
  assert.equal(importSectionHeading(" "), "Sección: Sin título");
});
