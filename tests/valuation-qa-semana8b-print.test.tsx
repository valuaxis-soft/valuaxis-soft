/**
 * QA of week 8 (videos 8.14 and 8.15): the conclusion's signature stays with
 * the concluded value when it fits, and new images take the whole width.
 * Invented data only.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { conclusionValues, signatureConceptValues, withConceptValues, withSummaryRowConcepts } from "../src/features/valuations/calculation/conclusion-document";
import { conclusionInput, type ConclusionCalculationDto } from "../src/features/valuations/calculation/conclusion-types";
import { newCroquisImage } from "../src/features/maps/croquis-document";
import { conclusionBlockFlowItems } from "../src/features/valuations/components/conclusion-preview-modules";
import { documentBlockFlowItems } from "../src/features/valuations/components/document-block-renderer";
import { splitMeasuredDocumentFlowItems } from "../src/features/valuations/components/document-preview-page";
import { concludeValue } from "../src/features/valuations/engine/conclusion";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import type { AppSection, ImageContent } from "../src/features/valuations/model";
import { conclusionesSection } from "../src/features/valuations/sections/conclusiones";
import { replacedImage, resolveImageWidthPercent } from "../src/features/valuations/services/document-image-layout";

const calculation: ConclusionCalculationDto = {
  values: { costos: 4240000, mercado: 8260000, ingresos: 3490000 },
  marketSource: "INMUEBLE_VENTA",
  method: { kind: "single", approach: "mercado" },
  justification: null,
  configured: true,
  locked: false,
};
const FIRMAS = [{ name: "Arq. Persona Inventada", cedula: "7654321", role: "Valuador" }];

function synced(): AppSection {
  const section = structuredClone(conclusionesSection);
  const result = concludeValue(conclusionInput(calculation), DEFAULT_ENGINE_CONFIG);
  return withConceptValues(withConceptValues(withSummaryRowConcepts(section, calculation), conclusionValues(calculation, result)), signatureConceptValues(FIRMAS));
}

const itemsOf = (section: AppSection) => conclusionBlockFlowItems(section.blocks[0], { firmas: FIRMAS }, (printed, options) =>
  documentBlockFlowItems(printed, { renderTitleBar: true, ...options }));

test("video 8.15: the concluded value keeps with the signature that follows it, so the signature never opens a page alone", () => {
  const items = itemsOf(synced());
  const value = items.findIndex((item) => item.id.endsWith("-valor-concluido"));
  const signature = items.findIndex((item) => item.id.endsWith("-firma"));
  assert.ok(value !== -1 && signature === value + 1, items.map((item) => item.id).join(", "));
  assert.equal(items[value].keepWithNext, true);
  assert.ok(!items[signature].keepWithNext);

  // The page of the QA (831 px): the value fits, and the signature under it fits too (what is left is 103 px).
  const heights = items.map((item, index) => ({ item, height: index < value ? (728 - 113) / value : index === value ? 113 : 98 }));
  const fits = splitMeasuredDocumentFlowItems(heights.slice(0, signature + 1), 831);
  assert.equal(fits.length, 1, "the signature stays on the value's page");
  // Really no room: the value goes with it, not the signature alone.
  const full = splitMeasuredDocumentFlowItems(heights.slice(0, signature + 1), 800);
  assert.deepEqual(full.at(-1)!.map((placed) => placed.id), [items[value].id, items[signature].id]);

  // Hidden, the signature does not hold the value back.
  const section = synced();
  const hidden = { ...section, blocks: [{ ...section.blocks[0], apartados: section.blocks[0].apartados.map((apartado) => (apartado.title === "FIRMA" ? { ...apartado, enabled: false } : apartado)) }, ...section.blocks.slice(1)] };
  const withoutSignature = itemsOf(hidden);
  assert.ok(!withoutSignature.find((item) => item.id.endsWith("-valor-concluido"))?.keepWithNext);
});

test("video 8.14, 30:44: an image in an empty frame of the template, and a croquis, take the whole width; a replaced image keeps its own", () => {
  const uploaded: ImageContent = { id: "subida", title: "foto-fachada.jpg", src: "/organizaciones/x/foto.jpg", enabled: true };
  const placeholder: ImageContent = { id: "foto-sujeto-01", title: "FOTOGRAFÍA DEL SUJETO", src: "", enabled: true };
  const first = replacedImage(placeholder, uploaded);
  assert.equal(first.id, placeholder.id);
  assert.equal(first.title, placeholder.title);
  assert.equal(resolveImageWidthPercent(first), 100);
  // A photo he narrowed to 60 % and replaces keeps 60 %.
  const narrowed: ImageContent = { ...uploaded, id: "propia", layoutWidth: "normal", layoutWidthPercent: 60 };
  assert.equal(resolveImageWidthPercent(replacedImage(narrowed, { ...uploaded, id: "otra" })), 60);
  // A croquis from the generator.
  const croquis = newCroquisImage({ kind: "macro" } as Parameters<typeof newCroquisImage>[0], "/organizaciones/x/croquis.png", "croquis-1");
  assert.equal(resolveImageWidthPercent(croquis), 100);
});
