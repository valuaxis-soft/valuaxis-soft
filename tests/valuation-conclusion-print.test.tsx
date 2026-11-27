/**
 * Video 7.1 (V7.1-23, 24 and 26): the conclusion prints as the despacho's
 * book: the resumen de valores in shaded rows, the concluded value large in
 * its box under the name the appraiser gave it, the amount in words, the
 * optional chart, and FIRMAS with the carátula's signatures.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Fragment, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { conclusionValues, signatureConceptValues, withConceptValues, withValueChart } from "../src/features/valuations/calculation/conclusion-document";
import { conclusionInput, type ConclusionCalculationDto } from "../src/features/valuations/calculation/conclusion-types";
import { chartLabel, conclusionBlockFlowItems } from "../src/features/valuations/components/conclusion-preview-modules";
import { documentBlockFlowItems } from "../src/features/valuations/components/document-block-renderer";
import { concludeValue } from "../src/features/valuations/engine/conclusion";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import type { AppSection, Block } from "../src/features/valuations/model";
import { conclusionesSection } from "../src/features/valuations/sections/conclusiones";

const calculation: ConclusionCalculationDto = {
  values: { costos: 8530000, mercado: 8260000, ingresos: 3700000 },
  marketSource: "INMUEBLE_VENTA",
  method: { kind: "single", approach: "mercado" },
  justification: null,
  configured: true,
  locked: false,
};
const FIRMAS = [{ name: "Arq. Persona Inventada", cedula: "1234567", role: "Valuador" }];

/**
 * The conclusion as valuations made before 27 Nov 2026 keep it until their
 * format is refreshed: the resumen and the concluded value in one block, and
 * FIRMAS a block of its own. It still prints as the despacho's book.
 */
function legacy(section: AppSection): AppSection {
  const [conclusion, declarations] = section.blocks;
  const part = (index: number) => conclusion.apartados[index].concepts;
  return {
    ...section,
    blocks: [
      { ...conclusion, concepts: [...part(0), ...part(3), ...part(2).filter((concept) => concept.label === "Observaciones finales")], apartados: [] },
      declarations,
      { ...declarations, id: "conclusiones-block-3-firmas", title: "FIRMAS", concepts: part(4) },
    ],
  };
}

function synced(): AppSection {
  const section = legacy(structuredClone(conclusionesSection));
  const result = concludeValue(conclusionInput(calculation), DEFAULT_ENGINE_CONFIG);
  return withConceptValues(withConceptValues(section, conclusionValues(calculation, result)), signatureConceptValues(FIRMAS));
}

const render = (block: Block, firmas = FIRMAS) => {
  const items = conclusionBlockFlowItems(block, { firmas }, (printed) => documentBlockFlowItems(printed, { renderTitleBar: true }));
  return { ids: items.map((item) => item.id), html: renderToStaticMarkup(createElement(Fragment, null, ...items.map((item) => createElement(Fragment, { key: item.id }, item.node)))) };
};

const renamed = (block: Block, label: string): Block => ({
  ...block,
  concepts: block.concepts.map((concept) => (concept.calculationKey === "conclusion:value" ? { ...concept, label } : concept)),
});

test("V7.1-23: the resumen in its rows, the concluded value in its box under his name, and the amount in words", () => {
  const named = renamed(synced().blocks[0], "Valor de mercado");
  // The appraiser's own text, written: an empty concept prints nothing (FAL-31).
  const block = { ...named, concepts: named.concepts.map((concept) => (concept.label === "Observaciones finales" ? { ...concept, value: "Sin observaciones." } : concept)) };
  const { ids, html } = render(block);
  assert.equal(ids[0], `${block.id}:title`);
  assert.equal(ids[1], `${block.id}:conclusion-value`, "right under the title");
  for (const label of ["VALOR POR ENFOQUE DE COSTOS:", "VALOR POR ENFOQUE DE MERCADO:", "VALOR POR ENFOQUE DE INGRESOS:"]) assert.ok(html.includes(label), label);
  assert.ok(html.includes("8,530,000.00") && html.includes("3,700,000.00"));
  assert.match(html, /data-concluded-value-label[^>]*>VALOR DE MERCADO</);
  assert.ok(html.includes("$8,260,000.00 M.N."), "the amount as the carátula prints it");
  assert.ok(html.includes("(OCHO MILLONES DOSCIENTOS SESENTA MIL PESOS 00/100 M.N.)"));
  // The values print once, in the module: not again as rows of concepts.
  assert.ok(!html.includes("Valor concluido con letra"));
  assert.equal(html.split("8,260,000.00").length - 1, 2, "the market row and the box");
  // The appraiser's own text still prints.
  assert.ok(html.includes("Observaciones finales"));
  assert.ok(!html.includes("data-conclusion-chart"), "the chart is off unless chosen");
});

test("V7.1-26 and 24 Nov 2026: chosen, the chart draws a vertical bar per value of the resumen, at the left of the values", () => {
  const section = withValueChart(synced(), true);
  const { html } = render(section.blocks[0]);
  assert.ok(html.includes("data-conclusion-chart"));
  // The three approaches, not only one, each under its short name.
  const bars = [...html.matchAll(/data-chart-bar="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(bars, ["COSTOS", "MERCADO", "INGRESOS"]);
  // Vertical: the tallest bar is the largest value, the bars grow up from the same line.
  const heights = [...html.matchAll(/<rect [^>]*height="([\d.]+)"/g)].map((match) => Number(match[1]));
  assert.equal(heights.length, 3);
  assert.equal(Math.max(...heights), heights[0], "costos, the largest value, is the tallest");
  assert.ok(heights[2] < heights[1] && heights[1] < heights[0]);
  // In the same row as the values, at their left.
  const row = html.slice(html.indexOf("data-conclusion-values-with-chart"));
  assert.ok(row.indexOf("data-conclusion-chart") < row.indexOf("data-conclusion-summary-rows"));
  // Drawn inline in the palette's strong colour: it prints in the PDF with nothing to load.
  assert.ok(html.includes("<svg") && !/<img|https?:\/\//.test(html));
  assert.ok(html.includes("fill-[var(--caratula-dark-blue,#00285A)]"));
});

test("off, the chart does not print and the values keep their place at the right", () => {
  const { html } = render(synced().blocks[0]);
  assert.ok(!html.includes("data-conclusion-chart") && !html.includes("data-conclusion-values-with-chart"));
  assert.ok(html.includes("ml-auto w-[88%]"));
});

test("24 Nov 2026: the values by approach print as his Excel, each name on the pastel and its value in a white box with «$» at the left", () => {
  const { html } = render(synced().blocks[0]);
  const labels = [...html.matchAll(/<td class="([^"]*)" data-summary-label/g)].map((match) => match[1]);
  const values = [...html.matchAll(/<td class="([^"]*)" data-summary-value/g)].map((match) => match[1]);
  assert.equal(labels.length, 3);
  for (const label of labels) {
    assert.ok(label.includes("bg-[var(--doc-pastel,#BDD7EE)]") && label.includes("text-right"), label);
    assert.ok(!label.includes("caratula-blue"), "not in solid blue");
  }
  for (const value of values) assert.ok(value.includes("bg-white") && value.includes("border border-[var(--caratula-dark-blue,#00285A)]"), value);
  assert.match(html, /<span>\$<\/span><span>8,530,000\.00<\/span>/);
});

test("24 Nov 2026: the concluded value prints in the carátula's box: «VALOR COMERCIAL DEL INMUEBLE», the amount large and its words", () => {
  const { html } = render(synced().blocks[0]);
  assert.match(html, /data-concluded-value-label[^>]*>VALOR COMERCIAL DEL INMUEBLE</);
  assert.match(html, /data-concluded-value-amount[^>]*>\$8,260,000\.00 M\.N\.</);
  const box = html.slice(html.indexOf("data-concluded-value-box") - 300);
  assert.ok(box.includes("border-2 border-[var(--caratula-blue)] bg-[var(--doc-zebra-strong,#E2E8F0CC)]"));
  assert.ok(box.indexOf("data-concluded-value-amount") < box.indexOf("(OCHO MILLONES DOSCIENTOS SESENTA MIL PESOS 00/100 M.N.)"), "the words under the amount");
});

test("the short name of a bar drops «Valor por enfoque de»", () => {
  assert.equal(chartLabel("Valor por enfoque de costos"), "COSTOS");
  assert.equal(chartLabel("VALOR POR EL ENFOQUE DE INGRESOS:"), "INGRESOS");
  assert.equal(chartLabel("Valor de terreno por enfoque de mercado"), "TERRENO POR ENFOQUE DE MERCADO");
  assert.equal(chartLabel("Valor estimado por regresión"), "REGRESIÓN");
  assert.equal(chartLabel("Valor físico"), "VALOR FÍSICO");
});

test("V7.1-24: FIRMAS prints the carátula's signatures, not «Valuador: —»", () => {
  const section = synced();
  const firmas = section.blocks[2];
  const { html } = render(firmas);
  assert.ok(html.includes("Arq. Persona Inventada"));
  assert.ok(html.includes("Cédula profesional 1234567"));
  assert.ok(!html.includes("Firma:") && !html.includes("Registro"), "empty Registro and Firma do not print a dash");
  // Two signatures in the carátula: both sign the conclusion.
  const two = render(firmas, [...FIRMAS, { name: "Ing. Otra Persona", cedula: "7654321", role: "" }]).html;
  assert.ok(two.includes("Ing. Otra Persona") && two.includes("7654321"));
  // Written by hand (unlinked), what the appraiser wrote prints.
  const manual = { ...firmas, concepts: firmas.concepts.map((concept) => (concept.calculationKey === "conclusion:signer-name" ? { ...concept, value: "Nombre a mano", calculationUnlinked: true } : concept)) };
  assert.ok(render(manual).html.includes("Nombre a mano"));
});
