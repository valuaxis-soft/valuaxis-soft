/**
 * Álvaro, 24 Nov 2026 (videos 8.1–8.4) and the Grok audit of 23 Nov: the
 * resumen de valores keeps the approaches when a value is added and gets them
 * back when the last one goes, every value with the rounding of the
 * conclusion; «Desvincular» of a value the conclusion writes; a weighted
 * conclusion reaches the dictamen; the names of the concluded values never
 * speak of intangibles; a kind chosen as «Otro» says which; and a template
 * keeps the carátula's image.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONCLUSION_KEYS,
  conclusionValues,
  withConceptValues,
  withSummaryRowConcepts,
} from "../src/features/valuations/calculation/conclusion-document";
import { conclusionSettingsSchema } from "../src/features/valuations/calculation/conclusion-schemas";
import {
  conclusionEngineConfig,
  conclusionInput,
  summaryRowsWith,
  type ConclusionCalculationDto,
} from "../src/features/valuations/calculation/conclusion-types";
import { concludeValue } from "../src/features/valuations/engine/conclusion";
import type { AppSection } from "../src/features/valuations/model";
import { conclusionesSection } from "../src/features/valuations/sections/conclusiones";
import { conceptContextMenu, type ConceptMenuTarget } from "../src/features/valuations/services/concept-context-menu";
import { readDocumentTemplate } from "../src/features/valuations/services/document-template";
import {
  INTANGIBLE_REFUSAL_MESSAGE,
  conclusiveLabelRefusal,
  intangibleConclusiveName,
  mentionsIntangibles,
} from "../src/features/valuations/services/intangible-labels";
import { isOwnKindKey, missingOwnKindName, ownKindName, readOwnKindNames } from "../src/features/valuations/services/property-kinds";
import { choosesOwnKind } from "../src/features/valuations/components/create-valuation-form";

const calculation = (extra: Partial<ConclusionCalculationDto> = {}): ConclusionCalculationDto => ({
  values: { costos: 8010000, mercado: 7390400, ingresos: 3148754.45 },
  marketSource: "INMUEBLE_VENTA",
  available: { costos: 8010000, "mercado-inmuebles": 7390400, "mercado-terrenos": 1528000, ingresos: 3148754.45 },
  method: { kind: "single", approach: "mercado" },
  justification: null,
  configured: true,
  locked: false,
  ...extra,
});

/** The conclusion section as the dictamen receives it from the calculation (use-calculation-document-sync.ts). */
function synced(section: AppSection, dto: ConclusionCalculationDto): AppSection {
  const result = concludeValue(conclusionInput(dto), conclusionEngineConfig(dto));
  return withConceptValues(withSummaryRowConcepts(section, dto), conclusionValues(dto, result));
}

const rowsOf = (section: AppSection) => section.blocks[0].concepts.map((concept) => [concept.label, concept.value]);

/* ── FAL-03 / FAL-45: the resumen de valores ─────────────────────── */

test("FAL-03: the first value added to the resumen keeps the three approaches the conclusion listed", () => {
  const rows = summaryRowsWith(calculation(), "mercado-terrenos");
  assert.deepEqual(rows.map((row) => row.source), ["costos", "mercado-inmuebles", "ingresos", "mercado-terrenos"]);
  assert.equal(rows[1].label, "Valor por enfoque de mercado", "the market reads as it did");
  // From land when the conclusion takes its market from land; a value already listed is not repeated.
  assert.deepEqual(summaryRowsWith(calculation({ marketSource: "TERRENO_VENTA" }), "costos").map((row) => row.source), ["costos", "mercado-terrenos", "ingresos"]);
  // Further values are added to the rows there are.
  assert.deepEqual(summaryRowsWith(calculation({ summaryRows: [{ source: "costos", label: "Valor físico" }] }), "regresion").map((row) => row.source), ["costos", "regresion"]);
  // A machinery valuation, whose values are not these, starts from the value alone.
  assert.deepEqual(summaryRowsWith(calculation({ marketSource: "MAQUINARIA_VENTA" }), "costos").map((row) => row.source), ["costos"]);
});

test("FAL-03: adding a value leaves the others in the dictamen, and removing the last one brings the approaches back", () => {
  const before = synced(structuredClone(conclusionesSection), calculation());
  const added = synced(before, calculation({ summaryRows: summaryRowsWith(calculation(), "mercado-terrenos") }));
  assert.deepEqual(rowsOf(added).slice(0, 5), [
    ["Valor por enfoque de costos", "8010000.00"],
    ["Valor por enfoque de mercado", "7390000.00"],
    ["Valor por enfoque de ingresos", "3150000.00"],
    ["Valor de terreno por enfoque de mercado", "1530000.00"],
    ["Valor concluido", "7390000.00"],
  ]);

  const removed = synced(added, calculation({ summaryRows: [] }));
  const concepts = removed.blocks[0].concepts;
  assert.equal(concepts.some((concept) => concept.id.startsWith("conclusion-resumen-")), false, "the rows go");
  assert.deepEqual(rowsOf(removed).slice(0, 4), [
    ["Valor por enfoque de costos", "8010000.00"],
    ["Valor por enfoque de mercado", "7390000.00"],
    ["Valor por enfoque de ingresos", "3150000.00"],
    ["Valor concluido", "7390000.00"],
  ], "the approaches come back before the concluded value, with their rounding");
  assert.deepEqual(concepts.slice(0, 3).map((concept) => concept.calculationKey), [CONCLUSION_KEYS.costos, CONCLUSION_KEYS.mercado, CONCLUSION_KEYS.ingresos]);
  // Without rows ever, the block is left as it is.
  const plain = synced(structuredClone(conclusionesSection), calculation());
  assert.equal(withSummaryRowConcepts(plain, calculation()), plain);
});

test("FAL-45: income prints rounded as the conclusion says, in a row of the resumen too; «Sin redondeo» keeps the cents", () => {
  const rows = { summaryRows: [{ source: "ingresos" as const, label: "Valor por enfoque de ingresos" }, { source: "costos" as const, label: "Valor físico" }] };
  const tens = synced(structuredClone(conclusionesSection), calculation(rows));
  assert.equal(tens.blocks[0].concepts.find((concept) => concept.id === "conclusion-resumen-1")!.value, "3150000.00");
  const exact = synced(structuredClone(conclusionesSection), calculation({ ...rows, rounding: null }));
  assert.equal(exact.blocks[0].concepts.find((concept) => concept.id === "conclusion-resumen-1")!.value, "3148754.45");
});

/* ── FAL-19: a weighted conclusion reaches the dictamen ───────────── */

test("FAL-19: concluding 30 % costos and 70 % mercado writes $7,580,000.00 in the dictamen and the carátula", () => {
  const weighted = calculation({ values: { costos: 8010000, mercado: 7390000, ingresos: null }, method: { kind: "weighted", weights: { costos: 0.3, mercado: 0.7 } } });
  const section = synced(structuredClone(conclusionesSection), weighted);
  const concluded = section.blocks[0].concepts.find((concept) => concept.calculationKey === CONCLUSION_KEYS.value)!;
  assert.equal(concluded.value, "7580000.00");
  assert.equal(section.blocks[0].concepts.find((concept) => concept.calculationKey === CONCLUSION_KEYS.words)!.value, "(SIETE MILLONES QUINIENTOS OCHENTA MIL PESOS 00/100 M.N.)");
});

/* ── FAL-16: «Desvincular» of a value the conclusion writes ─────── */

test("FAL-16: the right-click menu of a value linked to the conclusion offers «Desvincular del cálculo», enabled", () => {
  const target: ConceptMenuTarget = {
    generated: false, readOnly: false, takesTextMarks: false, hasValue: true, valueFormat: "enabled", date: false, hasLineBreaks: false,
    canRowStyle: false, canDuplicate: true, canMoveTo: false, canSelect: false, canLink: false, linked: false, canDelete: true,
  };
  const unlink = (extra: Partial<ConceptMenuTarget>) => conceptContextMenu({ ...target, ...extra }).flat().find((item) => item.action === "unlink")!;
  assert.deepEqual(unlink({ calculationLinked: true }), { action: "unlink", label: "Desvincular del cálculo" });
  assert.equal(unlink({ calculationLinked: false }).disabled, true, "a value not linked to anything has nothing to unlink");
  assert.equal(unlink({ calculationLinked: true, readOnly: true }).disabled, true);
});

/* ── Intangibles ────────────────────────────────────────────────── */

test("the names that speak of intangibles, a going concern or a business are recognized, with or without accents", () => {
  for (const name of [
    "Valor de los intangibles", "INTANGIBLE", "Valor del negocio en marcha", "Negocios en marcha", "Valor de la empresa", "valor de empresa",
    "Valor del negocio", "Valor de la marca", "Marcas registradas", "Nombre comercial", "Nombres comerciales", "Goodwill", "good will",
    "Crédito mercantil", "CREDITO MERCANTIL", "Plusvalía mercantil", "Patente", "Patentes", "Franquicia", "franquicias",
    "Concesión minera", "Concesiones", "Derechos de autor", "Secretos industriales", "Software", "Nombres de dominio",
    "Cartera de clientes", "Acuerdos de no competencia", "Valor por enfoque de ingresos (marca)",
  ]) assert.equal(mentionsIntangibles(name), true, name);
});

test("whole words only: «marcador», «Marcos», «comercial» or «empresarial» are not intangibles", () => {
  for (const name of [
    "Marcador de lindero", "Marcos de herrería", "Valor comercial del inmueble", "Valor por enfoque de mercado", "Local comercial",
    "Zona empresarial", "Valor físico", "Desmarcado", "Patentado", "Valor concluido", "Valor de la maquinaria", "Enfoque de ingresos",
  ]) assert.equal(mentionsIntangibles(name), false, name);
  assert.equal(conclusiveLabelRefusal("Valor físico"), null);
  assert.equal(conclusiveLabelRefusal("Valor de la marca"), INTANGIBLE_REFUSAL_MESSAGE);
  assert.match(INTANGIBLE_REFUSAL_MESSAGE, /^Valuaxis Soft es para valuar bienes tangibles/);
});

test("only the names of the concluded values are checked: the conclusion's titles and values, and the carátula's conclusion", () => {
  const section = structuredClone(conclusionesSection);
  assert.equal(intangibleConclusiveName([section]), null);
  const renamed = (label: string) => ({ ...section, blocks: [{ ...section.blocks[0], concepts: section.blocks[0].concepts.map((concept) => (concept.calculationKey === CONCLUSION_KEYS.value ? { ...concept, label } : concept)) }, ...section.blocks.slice(1)] });
  assert.equal(intangibleConclusiveName([renamed("Valor del negocio en marcha")]), "Valor del negocio en marcha");
  assert.equal(intangibleConclusiveName([{ ...section, blocks: [{ ...section.blocks[0], title: "CONCLUSIÓN DEL VALOR DE LA MARCA" }] }]), "CONCLUSIÓN DEL VALOR DE LA MARCA");
  // A row of the resumen.
  assert.equal(intangibleConclusiveName([{ id: "conclusiones", blocks: [{ id: "b", title: "CONCLUSIÓN", concepts: [{ id: "conclusion-resumen-1", label: "Valor de la franquicia" }] }] }]), "Valor de la franquicia");
  // Free texts and other sections may mention them.
  const observation = { ...section, blocks: [{ ...section.blocks[0], concepts: section.blocks[0].concepts.map((concept) => (concept.label === "Observaciones finales" ? { ...concept, value: "No incluye la marca ni el negocio en marcha." } : concept)) }] };
  assert.equal(intangibleConclusiveName([observation]), null);
  assert.equal(intangibleConclusiveName([{ id: "consideraciones", blocks: [{ title: "MARCA DEL EQUIPO", concepts: [{ id: "x", label: "Marca", calculationKey: "conclusion:value" }] }] }]), null);
  // The carátula: its conclusion's title and its value; its other blocks are free.
  assert.equal(intangibleConclusiveName([{ id: "caratula", blocks: [{ id: "caratula-block-6-conclusion", title: "CONCLUSIÓN DEL GOODWILL" }] }]), "CONCLUSIÓN DEL GOODWILL");
  assert.equal(intangibleConclusiveName([{ id: "caratula", blocks: [{ id: "caratula-block-2", title: "MARCA DEL VEHÍCULO" }] }]), null);
});

test("the resumen de valores refuses a name about intangibles with the message", () => {
  const settings = (label: string) => conclusionSettingsSchema.safeParse({ method: { kind: "single", approach: "costos" }, justification: null, summaryRows: [{ source: "costos", label }] });
  assert.equal(settings("Valor físico").success, true);
  const refused = settings("Valor de las patentes");
  assert.equal(refused.success, false);
  assert.equal(refused.error?.issues[0].message, INTANGIBLE_REFUSAL_MESSAGE);
});

/* ── «Otro» in the new valuation ──────────────────────────────── */

test("«Otro» of each catalog asks which, and that name prints instead of «Otro»", () => {
  assert.equal(isOwnKindKey("OTRO"), true);
  assert.equal(isOwnKindKey("otra"), true);
  assert.equal(isOwnKindKey("CASA_HABITACION"), false);
  const options = [{ id: 1, key: "COMERCIAL" }, { id: 5, key: "OTRO" }];
  assert.equal(choosesOwnKind(options, "5"), true);
  assert.equal(choosesOwnKind(options, "1"), false);
  assert.equal(choosesOwnKind(options, ""), false);

  const kinds = (operation: string | undefined) => [
    { key: "OTRO", name: "Kiosco", label: "«Tipo de bien»" },
    { key: "OTRA", name: operation, label: "«Tipo de operación»" },
    { key: "VENTA", name: undefined, label: "«Tipo de avalúo»" },
  ];
  assert.equal(missingOwnKindName(kinds("Dación en pago")), null);
  assert.equal(missingOwnKindName(kinds("   ")), "Elegiste «Otro» en «Tipo de operación»: escribe cuál es.");

  assert.equal(ownKindName({ SClave: "OTRA", SNombre: "Otra" }, "Dación en pago"), "Dación en pago");
  assert.equal(ownKindName({ SClave: "OTRA", SNombre: "Otra" }, undefined), "Otra");
  assert.equal(ownKindName({ SClave: "VENTA", SNombre: "Venta" }, "Dación en pago"), "Venta");
  assert.deepEqual(readOwnKindNames({ tipoBienOtro: " Kiosco ", claseAvaluoOtro: "Arbitraje", otro: 1 }), { tipoBienOtro: "Kiosco", claseAvaluoOtro: "Arbitraje" });
});

/* ── The template keeps the carátula's image ──────────────────── */

test("a template saved with images keeps the carátula's image by its stored file; anything else reads as none", () => {
  const fileId = "6f1d2c1e-6a3b-4f7e-9d43-2b9f7c3a1e55";
  const base = { format: 1, includeData: false, includeImages: true, sections: [] };
  assert.deepEqual(readDocumentTemplate({ ...base, coverImage: { fileId } })?.coverImage, { fileId });
  assert.equal(readDocumentTemplate({ ...base, coverImage: { fileId: "../otra-cosa" } })?.coverImage, undefined);
  assert.equal(readDocumentTemplate(base)?.coverImage, undefined);
});
