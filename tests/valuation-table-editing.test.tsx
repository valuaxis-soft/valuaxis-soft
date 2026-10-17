import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DocumentTable } from "../src/features/valuations/components/document-table";
import { EditableContentLayout } from "../src/features/valuations/components/editor/editable-content-layout-v2";
import { TableEditorItem } from "../src/features/valuations/components/editor/table-editor";
import { TerrenoPreview } from "../src/features/valuations/components/terreno-preview";
import type { Apartado, TableContent } from "../src/features/valuations/model";
import {
  ensureTerrenoSection,
  findBoundaryDistanceColumnId,
  findBoundarySource,
  terrenoSection,
} from "../src/features/valuations/sections/terreno";
import { createHomologationTable, ensureTableV2, moveTableColumnTo, type TableV2 } from "../src/features/valuations/services/table";
import "./support/ssr-portal-shim";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** "Medidas y colindancias" as the template creates it, with what is written in its table. */
function boundariesSection(edit: (apartado: Apartado, table: TableV2) => TableV2 = (_, table) => table) {
  const section = ensureTerrenoSection({ ...structuredClone(terrenoSection), label: "III" });
  const apartado = section.blocks[0].apartados[0];
  const table = ensureTableV2(apartado.tables[0]);
  const [rumbo, distancia, colindancias] = table.columns.map((column) => column.id);
  table.rows[0].cells[distancia] = { kind: "value", value: "12.5" };
  table.rows[0].cells[colindancias] = { kind: "value", value: "Calle Hidalgo" };
  void rumbo;
  apartado.tables[0] = { ...edit(apartado, table), boundaryDistanceFormats: apartado.tables[0].boundaryDistanceFormats } as unknown as TableContent;
  return section;
}

const printed = (section: ReturnType<typeof boundariesSection>) => renderToStaticMarkup(createElement(TerrenoPreview, { header: null, section }));

/* ------------------------------------------------------------------ */
/*  Medidas y colindancias                                             */
/* ------------------------------------------------------------------ */

test("the table of measures prints as the other tables, with its distances in whichever column they were moved to", () => {
  const section = boundariesSection((_, table) => moveTableColumnTo(table, table.columns[1].id, table.columns[2].id));
  const html = printed(section);
  // The header band and the rows of the report tables.
  assert.match(html, /<thead class="bg-\[#BDD7EE\][^"]*">/);
  assert.match(html, /data-split-table-row=""/);
  assert.doesNotMatch(html, /border-slate-400/, "no header style of its own");
  const [firstRow] = html.match(/<tr[^>]*data-split-table-row[\s\S]*?<\/tr>/g)!;
  assert.deepEqual(firstRow.split("</td>").slice(0, -1).map(text), ["Al Norte:", "Calle Hidalgo", "12.5 m"], "the distance keeps its unit after the move");
  assert.match(text(html), /Al Sur: No se proporcionó No se proporcionó/, "what was not written says so");
  assert.equal(findBoundaryDistanceColumnId(section.blocks[0].apartados[0].tables[0]), ensureTableV2(section.blocks[0].apartados[0].tables[0]).columns[2].id);
});

test("the line under the table of measures is the concept titled «Linderos y colindancias según», as edited", () => {
  const section = boundariesSection();
  const apartado = section.blocks[0].apartados[0];
  // A concept the appraiser adds first is printed as his, never as the source of the boundaries.
  apartado.concepts.unshift({ id: "concept-own", label: "Superficie", value: "250 m²" });
  const source = findBoundarySource(apartado)!;
  assert.equal(source.label.startsWith("Linderos y colindancias según"), true);
  source.label = "Linderos y colindancias según";
  source.value = "Escritura 1234 del notario 5";
  let html = text(printed(section));
  assert.match(html, /Linderos y colindancias según: Escritura 1234 del notario 5/);
  assert.match(html, /Superficie/, "the concept added prints with the rest of the apartado");

  // Retitled, it prints with its new title; emptied, the line is not printed.
  source.label = "Medidas según";
  assert.match(text(printed(section)), /Medidas según: Escritura 1234 del notario 5/);
  source.label = "Linderos y colindancias según escritura";
  source.value = "";
  html = text(printed(section));
  assert.doesNotMatch(html, /Linderos y colindancias según/);
  assert.doesNotMatch(html, /Escrituras públicas/, "no text of the template where nothing was written");
});

test("the editor edits the line under the table of measures beside it, not as one more concept", () => {
  const apartado = boundariesSection().blocks[0].apartados[0];
  const callbacks = { onRemove: () => {}, onUpdate: () => {}, onAddColumn: () => {}, onAddRow: () => {} };
  const html = renderToStaticMarkup(createElement(EditableContentLayout, {
    container: apartado,
    allConcepts: apartado.concepts,
    allContainers: [apartado],
    conceptCallbacks: callbacks,
    imageCallbacks: callbacks,
    tableCallbacks: callbacks,
    readOnly: false,
  }));
  const field = html.slice(html.indexOf("data-boundary-source"));
  assert.ok(html.indexOf("data-boundary-source") > html.indexOf("Al Oeste:"), "the field is under the table");
  assert.match(field, /value="Linderos y colindancias según:?"/);
  assert.match(field, /Escrituras públicas\.\.\./);
  assert.equal(html.match(/Escrituras públicas\.\.\./g)?.length, 1, "the concept is not shown twice");

  // Another apartado shows its concepts as always.
  const other = { ...apartado, id: "otro", title: "Otro apartado" };
  const plain = renderToStaticMarkup(createElement(EditableContentLayout, {
    container: other,
    allConcepts: other.concepts,
    allContainers: [other],
    conceptCallbacks: callbacks,
    imageCallbacks: callbacks,
    tableCallbacks: callbacks,
    readOnly: false,
  }));
  assert.doesNotMatch(plain, /data-boundary-source/);
  assert.match(plain, /Escrituras públicas\.\.\./);
});

/* ------------------------------------------------------------------ */
/*  Headers in two lines, editor and print                             */
/* ------------------------------------------------------------------ */

test("a long header prints in two lines instead of widening its column, and a line broken by hand stays broken", () => {
  const table = {
    id: "t-largos",
    title: "Tabla configurable",
    version: 2,
    columns: [
      { id: "c1", name: "Ref" },
      { id: "c2", name: "Valor Unitario Neto $/m²" },
      { id: "c3", name: "Superficie\ndel Sujeto" },
    ],
    rows: [{ id: "r1", cells: { c1: { kind: "value", value: "1" }, c2: { kind: "value", value: "$ 9,000.00" }, c3: { kind: "value", value: "169.78" } } }],
  } as unknown as TableContent;
  const html = renderToStaticMarkup(createElement(DocumentTable, { table, variant: "report" }));
  assert.match(html, />Ref<\/th>/, "a short header is printed as it is");
  assert.match(html, /<span class="inline-block w-min whitespace-pre-line" style="min-width:max\(100%, 12ch\)">Valor Unitario Neto \$\/m²<\/span>/);
  assert.match(html, /style="min-width:max\(100%, 10ch\)">Superficie\ndel Sujeto<\/span>/);
});

test("the editor shows headers that wrap, every column with its handle, and widths after the content", () => {
  const homologation = createHomologationTable();
  const html = renderToStaticMarkup(createElement(TableEditorItem, {
    table: homologation as unknown as TableContent,
    onAddColumn: () => {},
    onAddRow: () => {},
    onRemove: () => {},
    onUpdate: () => {},
    readOnly: false,
  }));
  assert.equal(html.match(/<textarea[^>]*aria-label="Encabezado de la columna/g)?.length, 12, "every header wraps in its own field");
  assert.equal(html.match(/data-column-grip=""/g)?.length, 12, "every column of the homologation can be dragged, fixed ones too");
  const widths = [...html.matchAll(/<col style="width:([\d.]+)%"\/>/g)].map((match) => Number(match[1]));
  assert.equal(widths.length, 12);
  assert.ok(Math.abs(widths.reduce((total, width) => total + width, 0) - 100) < 0.01, "the columns share the whole width");
  assert.ok(widths[1] > widths[3], "«Superficie del Sujeto (m²)» takes more room than «Neg.»");
  assert.match(html, /<table[^>]*class="[^"]*table-fixed[^"]*" style="min-width:\d+px"/, "a table of many columns scrolls instead of squeezing them");
});
