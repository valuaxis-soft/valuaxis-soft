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
import { conclusionBlockFlowItems } from "../src/features/valuations/components/conclusion-preview-modules";
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

function synced(): AppSection {
  const section = structuredClone(conclusionesSection);
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
  const block = renamed(synced().blocks[0], "Valor de mercado");
  const { ids, html } = render(block);
  assert.equal(ids[0], `${block.id}:title`);
  assert.equal(ids[1], `${block.id}:conclusion-value`, "right under the title");
  for (const label of ["VALOR POR ENFOQUE DE COSTOS:", "VALOR POR ENFOQUE DE MERCADO:", "VALOR POR ENFOQUE DE INGRESOS:"]) assert.ok(html.includes(label), label);
  assert.ok(html.includes("8,530,000.00") && html.includes("3,700,000.00"));
  assert.match(html, /data-concluded-value-label[^>]*>VALOR DE MERCADO:</);
  assert.ok(html.includes("8,260,000.00"));
  assert.ok(html.includes("(OCHO MILLONES DOSCIENTOS SESENTA MIL PESOS 00/100 M.N.)"));
  // The values print once, in the module: not again as rows of concepts.
  assert.ok(!html.includes("Valor concluido con letra"));
  assert.equal(html.split("8,260,000.00").length - 1, 2, "the market row and the box");
  // The appraiser's own text still prints.
  assert.ok(html.includes("Observaciones finales"));
  assert.ok(!html.includes("data-conclusion-chart"), "the chart is off unless chosen");
});

test("V7.1-26: chosen, the chart draws a bar per value of the resumen and the concluded value", () => {
  const section = withValueChart(synced(), true);
  const { html } = render(section.blocks[0]);
  assert.ok(html.includes("data-conclusion-chart"));
  assert.equal(html.split("grid-cols-[38%_1fr]").length - 1, 4);
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
