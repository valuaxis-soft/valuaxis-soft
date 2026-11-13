/**
 * Observations of videos 5.3, 5.4 and 6.1–6.3 (Nov 2026) on the market panels,
 * the alternative methods and the calculation memory.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { generatedTable, offerOptionsTable } from "../src/features/valuations/calculation/generated-content";
import { findSubjectBuiltArea, findSubjectLandArea, marketDocumentBlocks, suggestedSubjectAreaFor } from "../src/features/valuations/calculation/market-document";
import { marketSettingsSchema, restoreMarketSchema } from "../src/features/valuations/calculation/market-schemas";
import {
  defaultMarketSettings,
  printedStatisticsOf,
  shownStatistics,
  toMarketEngineInput,
  type ComparableDto,
  type MarketCalculationDto,
} from "../src/features/valuations/calculation/market-types";
import { DocumentTable } from "../src/features/valuations/components/document-table";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeMarketApproach } from "../src/features/valuations/engine/market";
import { roundingText } from "../src/features/valuations/memory/calculation-memory";
import type { AppSection, Block, Concept, TableContent } from "../src/features/valuations/model";
import { blockLeftOutOfReport, excludedReportApproaches, previewSectionForReport, sectionForReport, type ReportApproach } from "../src/features/valuations/services/report-approaches";
import { ensureTableV2 } from "../src/features/valuations/services/table";

const block = (id: string): Block => ({ id, title: id, sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [] });
const marketSection = (excludedFromReport?: ReportApproach[]): AppSection => ({
  id: "mercadoVenta", label: "VII", title: "MERCADO", sourceFile: "", enabled: true, required: false,
  blocks: [
    block("motor-mercado-terreno_venta-enfoque"), block("motor-estadistico-terreno_venta"),
    block("motor-mercado-inmueble_venta-enfoque"), block("motor-estadistico-inmueble_venta"), block("plantilla"),
  ],
  ...(excludedFromReport ? { excludedFromReport } : {}),
});

test("V5.4-16: a market left out takes its alternative methods out of the dictamen and of the editor's preview", () => {
  const section = marketSection(["mercado-inmuebles"]);
  const excluded = excludedReportApproaches([section]);
  assert.equal(blockLeftOutOfReport({ id: "motor-estadistico-inmueble_venta" }, excluded), true);
  assert.equal(blockLeftOutOfReport({ id: "motor-estadistico-terreno_venta" }, excluded), false);
  assert.deepEqual(sectionForReport(section, excluded)?.blocks.map((item) => item.id), [
    "motor-mercado-terreno_venta-enfoque", "motor-estadistico-terreno_venta", "plantilla",
  ]);
  // The preview shows what prints: the same blocks; a section left out entirely shows as hidden.
  assert.deepEqual(previewSectionForReport(section, excluded).blocks.map((item) => item.id), sectionForReport(section, excluded)?.blocks.map((item) => item.id));
  const both = marketSection(["mercado-inmuebles", "mercado-terrenos"]);
  assert.equal(previewSectionForReport(both, excludedReportApproaches([both])).enabled, false);
  const all = marketSection();
  assert.equal(previewSectionForReport(all, excludedReportApproaches([all])), all, "nothing left out: the same section");
});

test("V5.4-15: the memory says the rounding in words, with Excel's digit in parentheses", () => {
  assert.equal(roundingText(-4), "Redondeo a decenas de miles (REDONDEAR de Excel, −4)");
  assert.equal(roundingText(-3), "Redondeo a miles (REDONDEAR de Excel, −3)");
  assert.equal(roundingText(0), "Redondeo a pesos (REDONDEAR de Excel, 0)");
  assert.equal(roundingText(2), "Redondeo a centavos (REDONDEAR de Excel, 2)");
});

const concept = (label: string, value: string): Concept => ({ id: label, label, value } as Concept);
const documentWith = (concepts: Concept[]): AppSection[] => [{ ...block("datos"), id: "caratula", label: "", title: "", sourceFile: "", blocks: [{ ...block("datos"), concepts }] } as unknown as AppSection];

test("6.3: each market starts from the subject's real area: land for land, built for buildings", () => {
  const sections = documentWith([concept("Superficie total de terreno", "360.00 m²"), concept("Superficie total de construcción", "245.50 m²")]);
  const areas = { land: findSubjectLandArea(sections), built: findSubjectBuiltArea(sections) };
  assert.deepEqual(areas, { land: 360, built: 245.5 });
  assert.equal(suggestedSubjectAreaFor("TERRENO_VENTA", areas), 360);
  assert.equal(suggestedSubjectAreaFor("TERRENO_RENTA", areas), 360);
  assert.equal(suggestedSubjectAreaFor("INMUEBLE_VENTA", areas), 245.5, "the land's 360 is not the buildings' area");
  assert.equal(suggestedSubjectAreaFor("INMUEBLE_RENTA", areas), 245.5);
  assert.equal(findSubjectBuiltArea(documentWith([concept("Superficie total de terreno", "360")])), null);
});

function comparable(reference: number, area: number, price: number): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Comparable ${reference}`, area, price,
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null,
    sourceName: "Portal inventado", contactName: null, contactPhone: null, url: null, offerDate: null, photos: [],
    factors: [{ type: "NEGOCIACION", value: 0.95, subjectRating: null, comparableRating: null, justification: null }],
  };
}
const land: MarketCalculationDto = {
  settings: { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 200, surfacePower: 6, adoptedUnitValue: 9000 },
  comparables: [comparable(1, 150, 1300000), comparable(2, 190, 1900000), comparable(3, 210, 2000000), comparable(4, 160, 1450000)],
  locked: false,
};
const homologation = (calculation: MarketCalculationDto) => {
  const input = toMarketEngineInput(calculation);
  assert.ok(input.ok);
  const result = computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG);
  return ensureTableV2(marketDocumentBlocks(calculation, result)[0].apartados[1].tables[0]);
};
const box = (table: ReturnType<typeof homologation>, id: string) => table.schema?.summaryBoxes?.find((item) => item.id === id)?.rows ?? [];

test("V5.3-11: the appraiser marks which statistics print and their order; the format's when he has not chosen", () => {
  const before = homologation(land);
  assert.deepEqual(box(before, "dispersion").map((row) => row.label), [
    "Mínimo de oferta ($/m²):", "Máximo de oferta ($/m²):", "Dispersión inicial:", "Mínimo homologado ($/m²):", "Máximo homologado ($/m²):", "Dispersión final:",
  ]);
  assert.deepEqual(box(before, "valores").map((row) => row.label), ["Valor Prom. Homologado ($/m²):", "Valor homologado a utilizar ($/m²):"]);
  assert.ok(box(before, "dispersion").every((row) => row.id === undefined), "no choice: the rows keep their places (labels renamed before stay)");

  const chosen = homologation({
    ...land,
    settings: { ...land.settings, printedStatistics: { order: ["dispersion", "initialDispersion", "median", "mean"], hidden: ["offerMin", "offerMax", "min", "max", "mean"] } },
  });
  assert.deepEqual(box(chosen, "dispersion").map((row) => [row.id, row.label]), [["dispersion", "Dispersión final:"], ["initialDispersion", "Dispersión inicial:"]]);
  assert.deepEqual(box(chosen, "valores").map((row) => row.label), ["Valor Mediana Homologado ($/m²):", "Valor homologado a utilizar ($/m²):"]);
  assert.deepEqual(printedStatisticsOf({ printedStatistics: { order: ["mean"], hidden: [] } }).order.slice(0, 2), ["mean", "offerMin"], "the rest follow in the format's order");
  assert.deepEqual(shownStatistics({}), ["offerMin", "offerMax", "initialDispersion", "min", "max", "dispersion", "mean"], "the median does not print unless marked");
  assert.equal(marketSettingsSchema.safeParse({ ...land.settings, printedStatistics: { order: ["mean"], hidden: ["moda"] } }).success, false);
});

test("V5.3-09: a factor renamed in the homologation table prints with its new name", () => {
  const renamed = homologation({
    ...land,
    settings: { ...land.settings, factorSlots: land.settings.factorSlots.map((slot) => (slot.type === "NEGOCIACION" ? { ...slot, label: "Oferta" } : slot)) },
  });
  assert.ok(renamed.columns.some((column) => column.name === "Oferta"));
});

const render = (table: TableContent) => renderToStaticMarkup(<DocumentTable variant="report" table={table} />);

test("V5.3-13 and V5.3-23: a note right under the table prints before the boxes; a heading prints on its own line", () => {
  const table = generatedTable("t", "T", [{ name: "A" }], [["1"]], {
    summaryBoxes: [{ id: "valor", position: "bottom", rows: [{ label: "VALOR:", value: "$ 1.00" }] }],
    notes: [
      { position: "bottom", heading: true, text: "Justificación de los factores utilizados" },
      { position: "bottom", text: "Texto." },
      { position: "table", text: "Cuando el factor es menor a la unidad…" },
    ],
  });
  const html = render(table);
  const note = html.indexOf("Cuando el factor");
  const value = html.indexOf("VALOR:");
  const heading = html.indexOf("Justificación de los factores utilizados");
  assert.ok(note > html.indexOf("</table>") && note < value, "the legend goes right under the table, before the value");
  assert.ok(heading > value, "the justification goes after the value");
  assert.match(html, /<p class="mt-1 font-bold first:mt-0">Justificación de los factores utilizados<\/p>/);
});

test("V5.3-14: the offer level's «( X )» prints without the blue shading", () => {
  const html = render(offerOptionsTable("oferta", "Nivel de oferta.", ["Alta", "Media", "Baja"], 1));
  assert.match(html, /\( X \)/);
  assert.doesNotMatch(html, /BDD7EE/);
});

test("6.3: undoing «Quitar este mercado» takes the comparables set aside, validated", () => {
  assert.equal(restoreMarketSchema.safeParse({ comparableType: "INMUEBLE_VENTA", comparableIds: ["a", "b"] }).success, true);
  assert.equal(restoreMarketSchema.safeParse({ comparableType: "OTRO", comparableIds: [] }).success, false);
  assert.equal(restoreMarketSchema.safeParse({ comparableType: "INMUEBLE_VENTA", comparableIds: Array.from({ length: 501 }, (_, index) => String(index)) }).success, false);
});
