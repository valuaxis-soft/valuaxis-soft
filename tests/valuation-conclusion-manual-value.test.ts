import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONCLUSION_KEYS,
  caratulaConclusionValues,
  conclusionValues,
  isConclusionCalculatedConcept,
  signatureConceptValues,
  withConceptValues,
  withManualConclusionEdit,
  withSummaryRowConcepts,
  withValueChart,
} from "../src/features/valuations/calculation/conclusion-document";
import { conclusionesSection } from "../src/features/valuations/sections/conclusiones";
import { conclusionInput, type ConclusionCalculationDto } from "../src/features/valuations/calculation/conclusion-types";
import { concludeValue } from "../src/features/valuations/engine/conclusion";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { conceptMetadataFromContent, hydrateConceptMetadata } from "../src/features/valuations/metadata";
import type { AppSection, Concept } from "../src/features/valuations/model";

const calculation = (costos: number): ConclusionCalculationDto => ({
  values: { costos, mercado: 1528000, ingresos: null },
  marketSource: "TERRENO_VENTA",
  method: { kind: "single", approach: "costos" },
  justification: null,
  configured: true,
  locked: false,
});
const resultOf = (dto: ConclusionCalculationDto) => concludeValue(conclusionInput(dto), DEFAULT_ENGINE_CONFIG);
const concept = (id: string, label: string, value = ""): Concept => ({ id, label, value, enabled: true });
const sectionOf = (concepts: Concept[], id = "conclusiones"): AppSection => ({
  id, label: "XI", title: "CONCLUSIÓN", sourceFile: "", enabled: true, required: false,
  blocks: [{ id: `${id}-block-1`, title: "CONCLUSIÓN DEL VALOR", sectionLabel: "", enabled: true, required: false, apartados: [], tables: [], images: [], concepts }],
});
const sync = (section: AppSection, dto: ConclusionCalculationDto) => withConceptValues(section, conclusionValues(dto, resultOf(dto)));
const valueOf = (section: AppSection, id: string) => section.blocks[0].concepts.find((item) => item.id === id)?.value;

/** The appraiser types in a concept, as the editor's update does. */
const edit = (section: AppSection, id: string, value: string): AppSection => ({
  ...section,
  blocks: section.blocks.map((block) => ({
    ...block,
    concepts: block.concepts.map((item) => (item.id === id ? { ...item, ...withManualConclusionEdit("CONCLUSIONES", item, { value }) } : item)),
  })),
});

const template = () => sectionOf([
  concept("c1", "Valor por enfoque de costos"), concept("c2", "Valor por enfoque de mercado"), concept("c3", "Valor por enfoque de ingresos"),
  concept("c4", "Valor concluido"), concept("c5", "Valor concluido con letra"), concept("c6", "Observaciones finales", "Texto del perito"),
]);

test("a concluded value written by hand stays through the next syncs; the linked ones keep following the calculation", () => {
  const synced = sync(template(), calculation(8580000));
  assert.equal(valueOf(synced, "c4"), "8580000.00");

  const written = edit(synced, "c4", "9000000.00");
  assert.equal(written.blocks[0].concepts[3].calculationUnlinked, true, "writing it by hand unlinks it");

  // The calculation changes: the hand-written value stays, the others follow.
  const next = sync(written, calculation(8700000));
  assert.equal(valueOf(next, "c4"), "9000000.00");
  assert.equal(valueOf(next, "c1"), "8700000.00");
  assert.equal(valueOf(next, "c5"), "(OCHO MILLONES SETECIENTOS MIL PESOS 00/100 M.N.)");
  // And again on opening the valuation: nothing changed, nothing is written.
  assert.equal(sync(next, calculation(8700000)), next);
});

test("an unlinked concept keeps its value until it is linked again, then takes the calculation's", () => {
  const synced = sync(template(), calculation(8580000));
  const unlinked = { ...synced, blocks: [{ ...synced.blocks[0], concepts: synced.blocks[0].concepts.map((item) => (item.id === "c5" ? { ...item, calculationUnlinked: true } : item)) }] };
  const next = sync(unlinked, calculation(8700000));
  assert.equal(valueOf(next, "c5"), "(OCHO MILLONES QUINIENTOS OCHENTA MIL PESOS 00/100 M.N.)");

  const relinked = { ...next, blocks: [{ ...next.blocks[0], concepts: next.blocks[0].concepts.map(({ calculationUnlinked: _unlinked, ...item }) => item) }] };
  assert.equal(valueOf(sync(relinked, calculation(8700000)), "c5"), "(OCHO MILLONES SETECIENTOS MIL PESOS 00/100 M.N.)");
});

test("only the values the conclusion fills unlink when written by hand", () => {
  const observations = concept("c6", "Observaciones finales", "Texto del perito");
  assert.deepEqual(withManualConclusionEdit("CONCLUSIONES", observations, { value: "Otro texto" }), { value: "Otro texto" });
  const concluded = concept("c4", "Valor concluido", "8580000.00");
  assert.deepEqual(
    withManualConclusionEdit("CONCLUSIONES", concluded, { label: "Valor final" }),
    { label: "Valor final", calculationKey: CONCLUSION_KEYS.value },
    "renaming is not writing the value: it stays linked and takes its key with it",
  );
  assert.deepEqual(withManualConclusionEdit("CONCLUSIONES", concluded, { value: "8580000.00" }), { value: "8580000.00" }, "the same value is no edit");
  assert.deepEqual(withManualConclusionEdit("COSTOS", concluded, { value: "1" }), { value: "1" }, "other sections are not the conclusion's");
  assert.equal(isConclusionCalculatedConcept("CARATULA", concept("v", "Valor comercial del bien")), true);
  assert.equal(isConclusionCalculatedConcept("CARATULA", concept("v", "Valor concluido")), false);
  assert.equal(isConclusionCalculatedConcept("CONCLUSIONES", concept("conclusion-resumen-1", "Valor de terreno")), true);
});

test("the carátula value written by hand stays too", () => {
  const caratula = sectionOf([concept("k1", "Valor comercial del bien"), concept("k2", "Cifra en letras")], "caratula");
  const values = (dto: ConclusionCalculationDto) => caratulaConclusionValues(resultOf(dto));
  const synced = withConceptValues(caratula, values(calculation(8580000)));
  const written = {
    ...synced,
    blocks: [{ ...synced.blocks[0], concepts: synced.blocks[0].concepts.map((item) => (item.id === "k1" ? { ...item, ...withManualConclusionEdit("CARATULA", item, { value: "9000000.00" }) } : item)) }],
  };
  const next = withConceptValues(written, values(calculation(8700000)));
  assert.equal(valueOf(next, "k1"), "9000000.00");
  assert.equal(valueOf(next, "k2"), "(OCHO MILLONES SETECIENTOS MIL PESOS 00/100 M.N.)");
});

test("the rows of the resumen de valores take their values, and one written by hand stays", () => {
  const dto: ConclusionCalculationDto = {
    ...calculation(8580000),
    summaryRows: [{ source: "costos", label: "Valor físico" }, { source: "mercado-terrenos", label: "Valor de terreno por enfoque de mercado" }],
    available: { costos: 8580000, "mercado-terrenos": 1528000 },
  };
  const rows = withSummaryRowConcepts(template(), dto);
  const synced = sync(rows, dto);
  assert.equal(valueOf(synced, "conclusion-resumen-1"), "8580000.00");
  // A cost or market row lists the value as its approach printed it: one figure per value (FAL-14).
  assert.equal(valueOf(synced, "conclusion-resumen-2"), "1528000.00");

  const written = edit(synced, "conclusion-resumen-2", "1600000.00");
  const next = sync(withSummaryRowConcepts(written, dto), { ...dto, available: { costos: 8580000, "mercado-terrenos": 1700000 } });
  assert.equal(valueOf(next, "conclusion-resumen-2"), "1600000.00");
});

test("the unlinking is stored with the concept's configuration", () => {
  const stored = conceptMetadataFromContent({ ...concept("c4", "Valor concluido"), calculationUnlinked: true });
  assert.equal(hydrateConceptMetadata({ kind: "concept", payload: stored }).calculationUnlinked, true);
  assert.equal(hydrateConceptMetadata({ kind: "concept", payload: conceptMetadataFromContent(concept("c4", "Valor concluido")) }).calculationUnlinked, undefined);
});

/* V7.3-28: «el valor concluido debería de poderse ajustar, el nombre que ellos decidan». */

test("V7.3-28: a concluded value renamed by the appraiser still receives the value, saved before the key or after", () => {
  // Saved before the key existed: recognized by its template label once, and the key is written.
  const synced = sync(template(), calculation(8580000));
  const concluded = synced.blocks[0].concepts.find((item) => item.id === "c4")!;
  assert.equal(concluded.calculationKey, CONCLUSION_KEYS.value);
  assert.equal(synced.blocks[0].concepts.find((item) => item.id === "c6")!.calculationKey, undefined, "the appraiser's text takes no key");
  // Renamed afterwards: still linked, still written.
  const renamed = { ...synced, blocks: [{ ...synced.blocks[0], concepts: synced.blocks[0].concepts.map((item) => (item.id === "c4" ? { ...item, label: "Valor de mercado" } : item)) }] };
  const next = sync(renamed, calculation(8700000));
  assert.equal(valueOf(next, "c4"), "8700000.00");
  assert.equal(next.blocks[0].concepts[3].label, "Valor de mercado");
  // Renamed in the editor before any sync (the edit carries the key): the same.
  const early = template();
  const edited = { ...early, blocks: [{ ...early.blocks[0], concepts: early.blocks[0].concepts.map((item) => (item.id === "c4" ? { ...item, ...withManualConclusionEdit("CONCLUSIONES", item, { label: "Valor comercial" }) } : item)) }] };
  assert.equal(valueOf(sync(edited, calculation(8580000)), "c4"), "8580000.00");
  // A value written by hand and then the concept renamed: it stays the appraiser's (#80).
  const manual = edit(synced, "c4", "9000000.00");
  const manualRenamed = { ...manual, blocks: [{ ...manual.blocks[0], concepts: manual.blocks[0].concepts.map((item) => (item.id === "c4" ? { ...item, label: "Valor de mercado" } : item)) }] };
  assert.equal(valueOf(sync(manualRenamed, calculation(8700000)), "c4"), "9000000.00");
  // The key is stored with the concept's configuration.
  const stored = conceptMetadataFromContent(concluded);
  assert.equal(hydrateConceptMetadata({ kind: "concept", payload: stored }).calculationKey, CONCLUSION_KEYS.value);
});

test("a new valuation's template carries the keys of what the calculation writes, and only those", () => {
  const keys = conclusionesSection.blocks.flatMap((block) => block.concepts.map((item) => [item.label, item.calculationKey ?? null]));
  assert.deepEqual(keys, [
    ["Valor por enfoque de costos", CONCLUSION_KEYS.costos], ["Valor por enfoque de mercado", CONCLUSION_KEYS.mercado], ["Valor por enfoque de ingresos", CONCLUSION_KEYS.ingresos],
    ["Valor concluido", CONCLUSION_KEYS.value], ["Valor concluido con letra", CONCLUSION_KEYS.words], ["Observaciones finales", null],
    ["Declaración del valuador", null], ["Alcance del avalúo", null], ["Limitaciones", null], ["Fecha de emisión", null],
    ["Valuador", CONCLUSION_KEYS.signerName], ["Cédula profesional", CONCLUSION_KEYS.signerCedula], ["Registro", null], ["Firma", null],
  ]);
});

test("with one row in the resumen and «lleva el nombre de la fila», the concluded value prints under that row's name", () => {
  const dto: ConclusionCalculationDto = {
    ...calculation(8580000),
    summaryRows: [{ source: "mercado-terrenos", label: "Valor de terreno por enfoque de mercado" }],
    available: { "mercado-terrenos": 1528000 },
  };
  assert.equal(withSummaryRowConcepts(template(), dto).blocks[0].concepts.find((item) => item.id === "c4")!.label, "Valor concluido", "off: his name stays");
  const named = withSummaryRowConcepts(template(), { ...dto, concludedNameFromRow: true });
  const concluded = named.blocks[0].concepts.find((item) => item.id === "c4")!;
  assert.equal(concluded.label, "Valor de terreno por enfoque de mercado");
  assert.equal(valueOf(sync(named, dto), "c4"), "1530000.00", "renamed so, it still receives the value (rounded as the conclusion)");
  assert.equal(withSummaryRowConcepts(named, { ...dto, concludedNameFromRow: true }), named, "nothing changed: the same section");
});

test("V7.1-24: FIRMAS takes the carátula's signatures, linked as the values are", () => {
  const firmas = sectionOf([concept("f1", "Valuador"), concept("f2", "Cédula profesional"), concept("f3", "Registro"), concept("f4", "Firma")]);
  const signed = withConceptValues(firmas, signatureConceptValues([{ name: "Arq. Persona Inventada", cedula: "1234567" }, { name: "Ing. Otra Persona", cedula: "7654321" }]));
  assert.deepEqual(signed.blocks[0].concepts.map((item) => item.value), ["Arq. Persona Inventada, Ing. Otra Persona", "1234567, 7654321", "", ""]);
  assert.equal(isConclusionCalculatedConcept("CONCLUSIONES", concept("f1", "Valuador")), true);
  assert.equal(isConclusionCalculatedConcept("CONCLUSIONES", concept("f3", "Registro")), false);
  // Written by hand: it stays.
  const written = { ...signed, blocks: [{ ...signed.blocks[0], concepts: signed.blocks[0].concepts.map((item) => (item.id === "f1" ? { ...item, ...withManualConclusionEdit("CONCLUSIONES", item, { value: "Otro nombre" }) } : item)) }] };
  assert.equal(valueOf(withConceptValues(written, signatureConceptValues([{ name: "Cambio", cedula: "1" }])), "f1"), "Otro nombre");
});

test("V7.1-26: the chart of the values is chosen for the block of the concluded value only", () => {
  const section = sectionOf([concept("c4", "Valor concluido")]);
  const withChart = withValueChart(section, true);
  assert.equal(withChart.blocks[0].valueChart, true);
  assert.equal(withValueChart(withChart, true), withChart);
  assert.equal(withValueChart(withChart, false).blocks[0].valueChart, undefined);
  const other = sectionOf([concept("o1", "Observaciones finales")]);
  assert.equal(withValueChart(other, true), other);
});
