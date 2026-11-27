/**
 * Álvaro, videos 8.13 (04:10), 8.14 (from 42:00) and 8.15, 27 Nov 2026:
 * B) «Valor de las construcciones» missing from the physical value, values of
 * his own that count in it, indirects typed in %, an amount «en letra» as a
 * value format, and the conclusion in subbloques as his Excel. The figures of
 * the costs are the firm's TCH book (VI. ENF. COSTOS: A 750,000, B 2,950,000,
 * C 38,000, physical value 3,740,000).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Fragment, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { captureReadable } from "../src/features/valuations/calculation/construction-capture";
import { COST_PHYSICAL_VALUE_BOX, costDocumentBlocks, costPhysicalValueTable } from "../src/features/valuations/calculation/cost-document";
import { costInputSchema } from "../src/features/valuations/calculation/cost-schemas";
import {
  COST_PERCENT_FIELDS,
  DEFAULT_LAND,
  costColumnsOf,
  costEngineConfig,
  emptyInstallation,
  missingCostFields,
  toCostEngineInput,
  type CostCalculationDto,
} from "../src/features/valuations/calculation/cost-types";
import {
  CONCLUSION_KEYS,
  conclusionSourceLabels,
  conclusionValues,
  signatureConceptValues,
  withConceptValues,
  withSummaryRowConcepts,
  withValueChart,
} from "../src/features/valuations/calculation/conclusion-document";
import { conclusionInput, type ConclusionCalculationDto } from "../src/features/valuations/calculation/conclusion-types";
import { conclusionBlockFlowItems } from "../src/features/valuations/components/conclusion-preview-modules";
import { documentBlockFlowItems } from "../src/features/valuations/components/document-block-renderer";
import { concludeValue } from "../src/features/valuations/engine/conclusion";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeCostApproach } from "../src/features/valuations/engine/costs";
import { Trace } from "../src/features/valuations/engine/trace";
import type { AppSection, Block, Concept } from "../src/features/valuations/model";
import { conclusionesSection } from "../src/features/valuations/sections/conclusiones";
import { NUMERIC_VALUE_FORMAT_OPTIONS, formatNumericValue } from "../src/features/valuations/services/concept-value-format";
import { LAYOUT_STEPS, refreshDocumentLayout, revertLayoutRefresh } from "../src/features/valuations/services/layout-refresh";
import { ensureTableV2, type TableV2 } from "../src/features/valuations/services/table";

/* ── The firm's TCH book, VI. ENF. COSTOS ───────────────────────── */

const tchType = { ref: "T-1", description: "Casa habitación 2 niveles", classification: "", quality: "", area: 250, age: 7, usefulLife: 70 };

const tch: CostCalculationDto = {
  // Lote tipo 140 m², subject 160 m², $5,000/m², Neg. 0.95, Ubic. 0.90, Serv. 1.05; Sup. as the book's L18 (its orientation is a setting).
  land: {
    ...DEFAULT_LAND, subjectArea: 160, referenceArea: 140, unitValue: 5000, surfacePower: 3, surfaceFactor: 1.0455159171494204,
    factors: { ...DEFAULT_LAND.factors, negotiation: 0.95, location: 0.9, services: 1.05 },
  },
  types: [tchType],
  constructions: [{ ...tchType, conservation: 0.98, conservationRating: null, ageFactor: null, otherFactor: 1, resultantFactor: null, completion: 1, undivided: 1, unitReplacementCost: 12550 }],
  installations: [
    { ...emptyInstallation(0), ref: "1", share: "P", description: "Malla ciclónica con tubular de aluminio", unit: "ml", quantity: 140, age: 15, usefulLife: 30, conservation: 0.975, completion: 0.5, unitReplacementCost: 550 },
    { ...emptyInstallation(1), ref: "2", share: "C", description: "Bomba para pozo artesano", unit: "lote", quantity: 1, age: 7, usefulLife: 20, conservation: 0.975, unitReplacementCost: 20000 },
  ],
  indirects: [],
  // The book rounds the land to tens of thousands (V20), the constructions too (V41), the installations to thousands (V65).
  rounding: { land: -4, constructions: -4, installations: -3, physicalValue: -4 },
  market: { adoptedUnitValue: null, subjectArea: 160, baseArea: null },
  configured: true,
  typesCaptured: true,
  locked: false,
};

function compute(calculation: CostCalculationDto) {
  const input = toCostEngineInput(calculation);
  assert.ok(input.ok, input.ok ? "" : input.reason);
  const trace = new Trace();
  return { result: computeCostApproach(input.input, costEngineConfig(calculation), trace), trace };
}

const boxRows = (blocks: Block[]) => {
  const tableId = costPhysicalValueTable(blocks);
  assert.ok(tableId, "the page closes with the physical value");
  const table = blocks.flatMap((block) => block.apartados.flatMap((apartado) => apartado.tables)).find((item) => item.id === tableId)!;
  const box = (ensureTableV2(table) as TableV2).schema!.summaryBoxes!.find((item) => item.id === COST_PHYSICAL_VALUE_BOX)!;
  return box.rows.map((row) => [row.label, row.value]);
};

test("the physical value adds A, B and C as the firm's book: $3,740,000 (VI. ENF. COSTOS, U69)", () => {
  const { result } = compute(tch);
  assert.equal(result.land, 750000, "A) ROUND(750,889.53, -4)");
  assert.equal(result.constructions, 2950000, "B) ROUND(2,952,342.00, -4)");
  assert.equal(result.specialInstallations, 38000, "C) ROUND(38,328.78, -3)");
  assert.equal(result.physicalValue, 3740000);
});

test("video 8.14, 42:27: the summary always lists A, B and C, so a missing B shows instead of silently adding A + C", () => {
  const withB = compute(tch);
  const page = costDocumentBlocks(tch, withB.result, withB.trace);
  assert.deepEqual(boxRows(page), [
    ["A) Valor del Terreno:", "$ 750,000.00"],
    ["B) Valor de las Construcciones:", "$ 2,950,000.00"],
    ["VALOR FÍSICO DE REPOSICIÓN (A+B+C):", "$ 3,740,000.00"],
  ], "C closes its own table right above");

  // Without any construction (his valuation had none), B still reads, at zero, and the sum says A+B+C.
  const noB: CostCalculationDto = { ...tch, types: [], constructions: [] };
  const without = compute(noB);
  assert.equal(without.result.physicalValue, 790000);
  assert.deepEqual(boxRows(costDocumentBlocks(noB, without.result, without.trace)), [
    ["A) Valor del Terreno:", "$ 750,000.00"],
    ["B) Valor de las Construcciones:", "$ 0.00"],
    ["VALOR FÍSICO DE REPOSICIÓN (A+B+C):", "$ 790,000.00"],
  ]);
  // Being captured, the page has B) with its tables, empty: the place to add a construction.
  const captured = costDocumentBlocks(noB, without.result, without.trace, { capture: true })[0];
  const b = captured.apartados.find((apartado) => apartado.title === "B) CONSTRUCCIONES");
  assert.ok(b, "B) is on the page being captured");
  assert.deepEqual(b.tables.map((table) => ensureTableV2(table).rows.length), [0, 0]);
  // The printed dictamen does not print an empty B) table.
  assert.ok(!costDocumentBlocks(noB, without.result, without.trace)[0].apartados.some((apartado) => apartado.title === "B) CONSTRUCCIONES"));
});

test("a construction captured in the cost table carries its type's data, and what it lacks is marked", () => {
  const row = { ...tch.constructions[0], area: null, age: null, usefulLife: null };
  assert.deepEqual(missingCostFields(row, "constructions").sort(), ["age", "area", "usefulLife"]);
  assert.deepEqual(missingCostFields(tch.constructions[0], "constructions"), []);
  // The payload of a construction whose type is new carries it, and the schema takes it.
  const parsed = costInputSchema.safeParse({
    land: tch.land, installations: [], indirects: [],
    constructions: [{ ref: "T-1", description: "Casa", area: 250, age: 7, usefulLife: 70, conservation: 0.98, otherFactor: 1, completion: 1, undivided: 1, unitReplacementCost: 12550, ageFactor: null, resultantFactor: null }],
  });
  assert.ok(parsed.success, parsed.success ? "" : parsed.error.message);
});

test("video 8.14, 43:50: values of his own added to the summary count in the physical value, with the next letter", () => {
  const columns = { ...costColumnsOf(null), extraValues: [{ id: "v1", label: "Obras de urbanización", amount: 100000 }, { id: "v2", label: "Sin importe", amount: null }] };
  const withExtra: CostCalculationDto = { ...tch, columns };
  const { result, trace } = compute(withExtra);
  assert.equal(result.physicalValue, 3840000, "ROUND(750,000 + 2,950,000 + 38,000 + 100,000, -4)");
  assert.equal(result.additions, 100000);
  assert.deepEqual(boxRows(costDocumentBlocks(withExtra, result, trace)).slice(-2), [
    ["E) Obras de urbanización:", "$ 100,000.00"],
    ["VALOR FÍSICO DE REPOSICIÓN (A+B+C+E):", "$ 3,840,000.00"],
  ]);
  // Kept as stored, the empty one too; the schema takes them.
  assert.deepEqual(costColumnsOf(columns).extraValues, columns.extraValues);
  assert.ok(costInputSchema.safeParse({ land: tch.land, constructions: [], installations: [], indirects: [], columns }).success);
  // Only extra values make a physical value with nothing else captured.
  const onlyExtra = toCostEngineInput({ ...tch, land: { ...DEFAULT_LAND }, market: { ...tch.market, subjectArea: null }, constructions: [], installations: [], columns });
  assert.ok(onlyExtra.ok);
});

test("video 8.14, 45:09 and 47:05: an indirect's percentage is typed in % and kept as its fraction; the message speaks of %", () => {
  assert.equal(COST_PERCENT_FIELDS("indirects.0.percentage"), true, "a formula typed in it gives the percentage");
  const indirect = (percentage: number) => costInputSchema.safeParse({ land: tch.land, constructions: [], installations: [], indirects: [{ concept: "Proyecto", percentage, base: null }] });
  assert.ok(indirect(0.1).success, "10 % travels as 0.1");
  assert.ok(indirect(1).success, "100 %");
  const refused = indirect(10);
  assert.ok(!refused.success);
  assert.equal(refused.error?.issues[0].message, "El porcentaje de un indirecto va de 0 % a 100 %.");
});

test("a capture table whose reference column can no longer be found is not read as empty (it would delete every type)", () => {
  const table = { id: "construccion_tipos", title: "Tipos", columns: ["Tipo", "Tipo", "Superficie"], columnKeys: ["tipo", "tipo_construccion", "sup_m2"], rows: [["T-1", "Casa", "250"]] };
  assert.equal(captureReadable(table as never, "types"), true);
  // Its other columns known, the reference's gone: nothing to read the types by.
  const noRef = { ...table, columns: ["Clasificación", "Calidad", "Edad"], columnKeys: ["clasificacion", "calidad", "edad"], rows: [["Moderno", "Media", "7"]] };
  assert.equal(captureReadable(noRef as never, "types"), false);
});

/* ── Values in words ──────────────────────────────────────────────── */

test("video 8.14, 49:30: «En letra» is a value format of any amount, as the firm's CIFRAENLETRAS writes it", () => {
  assert.ok(NUMERIC_VALUE_FORMAT_OPTIONS.some((option) => option.value === "words" && option.label === "En letra"));
  assert.equal(formatNumericValue("8500000", { valueFormat: "words" }), "(OCHO MILLONES QUINIENTOS MIL PESOS 00/100 M.N.)");
  assert.equal(formatNumericValue("3750000.00", { valueFormat: "words" }), "(TRES MILLONES SETECIENTOS CINCUENTA MIL PESOS 00/100 M.N.)", "TCH X. CONCLUSION B56");
  assert.equal(formatNumericValue("8000000", { valueFormat: "words" }), "(OCHO MILLONES DE PESOS 00/100 M.N.)");
  assert.equal(formatNumericValue("NO APLICA", { valueFormat: "words" }), "NO APLICA", "a text stays as it is");
});

/* ── The conclusion in subbloques ────────────────────────────────── */

const calculation: ConclusionCalculationDto = {
  values: { costos: 8530000, mercado: 8260000, ingresos: 3700000 },
  marketSource: "INMUEBLE_VENTA",
  method: { kind: "single", approach: "mercado" },
  justification: null,
  configured: true,
  locked: false,
};
const FIRMAS = [{ name: "Arq. Persona Inventada", cedula: "1234567", role: "Valuador" }];

function synced(section: AppSection = structuredClone(conclusionesSection), dto = calculation): AppSection {
  const result = concludeValue(conclusionInput(dto), DEFAULT_ENGINE_CONFIG);
  return withConceptValues(withConceptValues(withSummaryRowConcepts(section, dto), conclusionValues(dto, result)), signatureConceptValues(FIRMAS));
}

const render = (block: Block) => {
  const items = conclusionBlockFlowItems(block, { firmas: FIRMAS }, (printed, options) => documentBlockFlowItems(printed, { renderTitleBar: true, ...options }));
  return renderToStaticMarkup(createElement(Fragment, null, ...items.map((item) => createElement(Fragment, { key: item.id }, item.node))));
};

test("video 8.15: the conclusion is one block of subbloques in his order, the concluded value a subbloque with no printed title", () => {
  const [conclusion] = conclusionesSection.blocks;
  assert.deepEqual(conclusion.concepts, []);
  assert.deepEqual(conclusion.apartados.map((apartado) => [apartado.title, Boolean(apartado.titleHidden), Boolean(apartado.valueChart)]), [
    ["RESUMEN DE VALORES", false, false],
    ["GRÁFICA DE VALORES", false, true],
    ["CÓMO SE CONCLUYE", false, false],
    ["VALOR CONCLUIDO", true, false],
    ["FIRMA", true, false],
  ]);
  assert.deepEqual(conclusion.apartados[3].concepts.map((concept) => concept.calculationKey), [CONCLUSION_KEYS.value, CONCLUSION_KEYS.words]);
});

test("each subbloque prints in its place: resumen, chart, how it concludes, the value with its words, then the signature", () => {
  const html = render(synced().blocks[0]);
  const at = (marker: string) => html.indexOf(marker);
  for (const marker of ["data-conclusion-summary-rows", "data-conclusion-chart-subblock", "Se considera que el Valor", "data-concluded-value-box", "data-conclusion-signatures"]) {
    assert.ok(at(marker) > -1, marker);
  }
  assert.ok(at("data-conclusion-summary-rows") < at("data-conclusion-chart-subblock"));
  assert.ok(at("data-conclusion-chart-subblock") < at("Se considera que el Valor"));
  assert.ok(at("Se considera que el Valor") < at("data-concluded-value-box"));
  assert.ok(at("data-concluded-value-box") < at("data-conclusion-signatures"));
  assert.ok(html.includes("$8,260,000.00 M.N.") && html.includes("(OCHO MILLONES DOSCIENTOS SESENTA MIL PESOS 00/100 M.N.)"));
  assert.ok(html.includes("Arq. Persona Inventada"));
  // Each value once: the market row and the box (video 8.15, 3:36: «no necesito tener tantas veces esto»).
  assert.equal(html.split("8,260,000.00").length - 1, 2);
  assert.ok(!html.includes("Valor concluido con letra"), "the words are not printed again as a concept");
  // The concluded value's subbloque prints no title nor number.
  assert.ok(!html.includes("VALOR CONCLUIDO<"));
});

test("moving a subbloque moves it in the dictamen; hiding one hides it", () => {
  const block = synced().blocks[0];
  const [resumen, grafica, ...rest] = block.apartados;
  const moved = render({ ...block, apartados: [grafica, resumen, ...rest] });
  assert.ok(moved.indexOf("data-conclusion-chart-subblock") < moved.indexOf("data-conclusion-summary-rows"));
  const hidden = render({ ...block, apartados: block.apartados.map((apartado) => (apartado.valueChart ? { ...apartado, enabled: false } : apartado)) });
  assert.ok(!hidden.includes("data-conclusion-chart"));
  const noValue = render({ ...block, apartados: block.apartados.map((apartado) => (apartado.title === "VALOR CONCLUIDO" ? { ...apartado, enabled: false } : apartado)) });
  assert.ok(!noValue.includes("data-concluded-value-box"));
});

test("the rows of the resumen print in the order they were moved to in the editor", () => {
  const block = synced().blocks[0];
  const resumen = block.apartados[0];
  const ids = resumen.concepts.map((concept) => concept.id);
  const reordered = { ...resumen, contentLayout: { version: 2 as const, rows: [...ids].reverse().map((id, index) => ({ id: `r${index}`, columns: [{ id: `c${index}`, items: [{ type: "concept" as const, id }] }] })) } };
  const html = render({ ...block, apartados: [reordered, ...block.apartados.slice(1)] });
  assert.ok(html.indexOf("VALOR POR ENFOQUE DE INGRESOS:") < html.indexOf("VALOR POR ENFOQUE DE COSTOS:"));
});

test("video 8.15, 3:10: the chart takes a style of its own: vertical bars, bars in relief, or horizontal bars", () => {
  const block = synced().blocks[0];
  const styled = (style: "bars" | "bars-3d" | "horizontal") => render({ ...block, apartados: block.apartados.map((apartado) => (apartado.valueChart ? { ...apartado, valueChartStyle: style } : apartado)) });
  const bars = styled("bars");
  assert.deepEqual([...bars.matchAll(/data-chart-bar="([^"]+)"/g)].map((match) => match[1]), ["COSTOS", "MERCADO", "INGRESOS"]);
  assert.ok(!bars.includes("<polygon"));
  assert.ok(styled("bars-3d").includes("<polygon"), "the faces of the relief");
  assert.ok(styled("horizontal").includes('data-chart-style="horizontal"'));
  assert.ok(!/<img|https?:\/\//.test(styled("bars-3d")), "drawn inline: it prints with nothing to load");
});

test("the panel's «Imprimir la gráfica» does not touch a conclusion whose chart is a subbloque", () => {
  const section = synced();
  assert.equal(withValueChart(section, true), section);
});

test("the rows the appraiser picks for the resumen go in the resumen's subbloque; removing them brings the approaches back there", () => {
  const rows = { summaryRows: [{ source: "costos" as const, label: "Valor físico" }, { source: "mercado-terrenos" as const, label: "Valor del terreno" }], available: { costos: 8530000, "mercado-terrenos": 1528000 } };
  const withRows = synced(undefined, { ...calculation, ...rows });
  assert.deepEqual(withRows.blocks[0].apartados[0].concepts.map((concept) => [concept.label, concept.value]), [["Valor físico", "8530000.00"], ["Valor del terreno", "1528000.00"]]);
  assert.deepEqual(withRows.blocks[0].concepts, [], "nothing goes to the block");
  const back = synced(withRows, calculation);
  assert.deepEqual(back.blocks[0].apartados[0].concepts.map((concept) => concept.calculationKey), [CONCLUSION_KEYS.costos, CONCLUSION_KEYS.mercado, CONCLUSION_KEYS.ingresos]);
});

test("video 8.14, 49:02: the badge of a linked value says which value it is linked to", () => {
  const sources = conclusionSourceLabels(calculation);
  assert.equal(sources[CONCLUSION_KEYS.value], "Enfoque de mercado");
  assert.equal(sources[CONCLUSION_KEYS.words], "Enfoque de mercado, en letra");
  assert.equal(sources[CONCLUSION_KEYS.costos], "Enfoque de costos");
  const weighted = conclusionSourceLabels({ ...calculation, method: { kind: "weighted", weights: { costos: 0.3, mercado: 0.7 } } });
  assert.equal(weighted[CONCLUSION_KEYS.value], "Ponderación de enfoques (enfoque de costos 30 %, enfoque de mercado 70 %)");
  const single = conclusionSourceLabels({ ...calculation, summaryRows: [{ source: "mercado-terrenos", label: "Terreno" }], available: { "mercado-terrenos": 1 } });
  assert.equal(single[CONCLUSION_KEYS.value], "Valor de terreno por enfoque de mercado");
});

/* ── Valuations of before: the refresh arranges their conclusion ──── */

const concept = (id: string, label: string, value = "", extra: Partial<Concept> = {}): Concept => ({ id, label, value, enabled: true, ...extra });

function oldConclusion(): AppSection {
  const fresh = structuredClone(conclusionesSection);
  return {
    ...fresh,
    blocks: [{
      ...fresh.blocks[0],
      id: "conclusiones-block-1",
      title: "RESUMEN DE VALORES",
      valueChart: true,
      apartados: [],
      concepts: [
        concept("c-0", "Texto", "Se considera que el Valor que nos arroja es un indicador adecuado.", { type: "paragraph" }),
        concept("c-1", "Valor por enfoque de mercado", "8260000.00", { calculationKey: CONCLUSION_KEYS.mercado }),
        concept("c-2", "Valor por enfoque de costos", "8530000.00", { calculationKey: CONCLUSION_KEYS.costos }),
        concept("c-3", "Valor concluido", "8260000.00", { calculationKey: CONCLUSION_KEYS.value, valueFormat: "mxn-mn" }),
        concept("c-4", "Valor concluido con letra", "(OCHO MILLONES…)", { calculationKey: CONCLUSION_KEYS.words, calculationUnlinked: true }),
        concept("c-5", "Observaciones finales", "Sin observaciones."),
      ],
    }, fresh.blocks[1]],
  };
}

test("an old conclusion is arranged in subbloques, keeping every concept, value, name and flag; once; «Deshacer» puts it back", () => {
  const sections = [oldConclusion()];
  const step = LAYOUT_STEPS.filter((item) => item.id === "conclusion-subblocks");
  const { sections: refreshed, changes } = refreshDocumentLayout(sections, step);
  const block = refreshed[0].blocks[0];
  assert.deepEqual(block.concepts, []);
  assert.equal(block.valueChart, undefined, "the chart is its subbloque now");
  assert.deepEqual(block.apartados.map((apartado) => [apartado.title, apartado.concepts.map((item) => item.id), apartado.enabled, Boolean(apartado.titleHidden)]), [
    ["RESUMEN DE VALORES", ["c-1", "c-2"], true, true],
    ["GRÁFICA DE VALORES", [], true, false],
    ["CÓMO SE CONCLUYE", ["c-0", "c-5"], true, false],
    ["VALOR CONCLUIDO", ["c-3", "c-4"], true, true],
  ]);
  assert.equal(block.apartados[3].concepts[1].calculationUnlinked, true, "a value written by hand stays so");
  assert.equal(refreshDocumentLayout(refreshed, step).changes.length, 0, "idempotent");

  // Printed: his values, his text and the box.
  const html = render(block);
  assert.ok(html.includes("VALOR POR ENFOQUE DE MERCADO:") && html.includes("Se considera que el Valor") && html.includes("data-concluded-value-box"));

  // «Deshacer» takes the content back to the block, with what he wrote since.
  const edited = refreshed.map((section) => ({
    ...section,
    blocks: section.blocks.map((item, index) => (index ? item : {
      ...item,
      apartados: item.apartados.map((apartado) => ({ ...apartado, concepts: apartado.concepts.map((entry) => (entry.id === "c-5" ? { ...entry, value: "Escrito después" } : entry)) })),
    })),
  }));
  const reverted = revertLayoutRefresh(edited, changes)[0].blocks[0];
  assert.deepEqual(reverted.concepts.map((item) => item.id), ["c-0", "c-1", "c-2", "c-3", "c-4", "c-5"]);
  assert.equal(reverted.concepts[5].value, "Escrito después");
  assert.deepEqual(reverted.apartados, []);
  assert.equal(reverted.valueChart, true);
});

test("an old conclusion without the chart keeps it hidden in its subbloque", () => {
  const old = oldConclusion();
  const { valueChart: _chart, ...block } = old.blocks[0];
  const { sections } = refreshDocumentLayout([{ ...old, blocks: [block, old.blocks[1]] }], LAYOUT_STEPS.filter((item) => item.id === "conclusion-subblocks"));
  assert.equal(sections[0].blocks[0].apartados[1].enabled, false);
});
