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
