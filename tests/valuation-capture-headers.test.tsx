/**
 * Video 5.3 (8:36): the headers of the capture tables of Costos and Ingresos
 * are renamed and combined as in a configurable table; only how the panel
 * names them changes, never the data captured nor the calculation.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CaptureTableHead } from "../src/features/valuations/components/calculation/capture-table-head";
import { ignoredClose, isPartOfText } from "../src/features/valuations/components/calculation/calc-table-context-menu";
import { demeritHeadColumns } from "../src/features/valuations/components/calculation/cost-calculation-panel";
import { hydrateSectionMetadata, sectionMetadataFromContent } from "../src/features/valuations/metadata";
import {
  captureHeaderLayout,
  readCaptureHeaders,
  withCaptureGroup,
  withCaptureLabel,
  withTableHeaders,
  withoutCaptureGroup,
  type CaptureColumn,
} from "../src/features/valuations/services/capture-headers";

const LAND: CaptureColumn[] = [
  { key: "fraccion", label: "Fracción" },
  { key: "superficie", label: "Superficie de Sujeto (m²)" },
  { key: "negotiation", label: "Neg.", group: "Factores de Homologación" },
  { key: "fre", label: "FRe", group: "Factores de Homologación" },
  { key: "parcial", label: "Valor Parcial $" },
  { key: "acciones", label: "", fixed: true },
];

const shape = (layout: ReturnType<typeof captureHeaderLayout>) => ({
  top: layout.top.map((cell) => (cell.kind === "group" ? `[${cell.title}×${cell.colSpan}]` : `${cell.label}/${cell.rowSpan}`)),
  bottom: layout.bottom.map((cell) => cell.label),
});

test("without anything set, the panel's headers and its double header", () => {
  assert.deepEqual(shape(captureHeaderLayout(LAND, undefined)), {
    top: ["Fracción/2", "Superficie de Sujeto (m²)/2", "[Factores de Homologación×2]", "Valor Parcial $/2", "/2"],
    bottom: ["Neg.", "FRe"],
  });
});

test("a header and a group title renamed; empty, the panel's name again; a fixed column keeps its own", () => {
  let headers = withCaptureLabel(undefined, "negotiation", "Negociación");
  headers = withCaptureLabel(headers, "panel-factores-de-homologacion", "FACTORES");
  headers = withCaptureLabel(headers, "acciones", "Acciones");
  const layout = shape(captureHeaderLayout(LAND, headers));
  assert.deepEqual(layout.bottom, ["Negociación", "FRe"]);
  assert.ok(layout.top.includes("[FACTORES×2]"));
  assert.ok(layout.top.includes("/2"), "the actions column keeps its header");
  assert.deepEqual(captureHeaderLayout(LAND, withCaptureLabel(headers, "negotiation", "  ")).bottom.map((cell) => cell.label), ["Neg.", "FRe"]);
});

test("combining headers makes a double header over the columns chosen; separating it gives them back their own row", () => {
  const headers = withCaptureGroup(undefined, LAND, "fraccion", "superficie", "TERRENO");
  assert.deepEqual(shape(captureHeaderLayout(LAND, headers)), {
    top: ["[TERRENO×2]", "[Factores de Homologación×2]", "Valor Parcial $/2", "/2"],
    bottom: ["Fracción", "Superficie de Sujeto (m²)", "Neg.", "FRe"],
  });
  // Combining over a group takes its columns out of it; a fixed column is never grouped.
  const across = withCaptureGroup(undefined, LAND, "fre", "acciones", "VALORES");
  assert.deepEqual(across.groups?.map((group) => [group.title, group.columns]), [["Factores de Homologación", ["negotiation"]], ["VALORES", ["fre", "parcial"]]]);
  const separated = withoutCaptureGroup(headers, LAND, headers.groups![0].id);
  assert.deepEqual(shape(captureHeaderLayout(LAND, separated)).top.slice(0, 2), ["Fracción/2", "Superficie de Sujeto (m²)/2"]);
});

test("the headers are kept with the section and read back, whatever was stored", () => {
  const headers = withTableHeaders(undefined, "costos.terreno", withCaptureGroup(withCaptureLabel(undefined, "fraccion", "Fracc."), LAND, "fraccion", "superficie", "TERRENO"));
  const saved = JSON.parse(JSON.stringify(sectionMetadataFromContent({ captureHeaders: headers })));
  assert.deepEqual(hydrateSectionMetadata(saved).captureHeaders, headers);
  // A table set back to the panel's headers leaves the section.
  assert.deepEqual(withTableHeaders(headers, "costos.terreno", {}), {});
  // Anything else stored is dropped.
  assert.equal(readCaptureHeaders({ "costos terreno!": { labels: { a: "x" } }, ok: { labels: { "<b>": "x", c: 3 } } }), undefined);
  assert.deepEqual(readCaptureHeaders({ ok: { groups: [{ id: "g", columns: [] }, { id: "h", title: "<T>", columns: ["a", 4] }] } }), { ok: { groups: [{ id: "h", title: "<T>", columns: ["a"] }] } });
  assert.equal(readCaptureHeaders("texto"), undefined);
});

test("the capture header shows each name in a field to write over, the panel's name as its placeholder", () => {
  const html = renderToStaticMarkup(createElement("table", null, createElement(CaptureTableHead, {
    columns: LAND,
    headers: withCaptureLabel(undefined, "fre", "F. Resultante"),
    readOnly: false,
    onChange: () => {},
  })));
  assert.match(html, /aria-label="Encabezado Neg\."[^>]*placeholder="Neg\."|placeholder="Neg\."[^>]*aria-label="Encabezado Neg\."/);
  assert.match(html, /value="F\. Resultante"/);
  assert.match(html, /colSpan="2"/);
  assert.match(html, /<span class="sr-only">Acciones<\/span>/);
});

test("a right click on one capture cell opens the table's menu unless the appraiser had selected part of its text (Chrome for Mac)", () => {
  assert.equal(isPartOfText({ selectionStart: 2, selectionEnd: 2, value: "1250" }), false, "a caret");
  assert.equal(isPartOfText({ selectionStart: 0, selectionEnd: 4, value: "1250" }), false, "the whole text, as Tab leaves it");
  assert.equal(isPartOfText({ selectionStart: 1, selectionEnd: 3, value: "1250" }), true, "part of it, chosen by the appraiser");
  // Opened at the pointer on a cell being edited, the menu does not close because the pointer is "off its trigger".
  assert.equal(ignoredClose({ reason: "trigger-hover" }), true);
  assert.equal(ignoredClose({ reason: "escape-key" }), false);
  assert.equal(ignoredClose(undefined), false);
});

test("the demerit headers of Costos keep their own keys: «Edad» of the type and «Edad» of the factors are two columns", () => {
  const columns = demeritHeadColumns({
    leading: ["Ref.", "Tipo de Construcción", "Clasificación", "Calidad", "Superficie Construida (m²)", "Edad", "Vida útil"],
    remaining: "Vida remanente",
    factors: { other: "Otro", extra: ["Funcional"] },
  });
  const keys = columns.map((column) => column.key);
  assert.equal(new Set(keys).size, keys.length, "every column has a key of its own");
  const layout = captureHeaderLayout(columns, undefined);
  assert.deepEqual(layout.top.flatMap((cell) => (cell.kind === "group" ? [[cell.title, cell.colSpan]] : [])), [["Factores de Demérito", 5]]);
  assert.deepEqual(layout.bottom.map((cell) => cell.label), ["Cons.", "Edad", "Otro", "Funcional", "FRe"]);
});
