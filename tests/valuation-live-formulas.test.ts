/**
 * Live formulas of the calculation panels (V5.2-08, WA-04, nov 2026): a
 * numeric field that reads a concept or a cell of the valuation keeps the
 * reference and follows it when the data changes; a deleted reference or a
 * circular one keeps the last value and says why; the formulas with numbers
 * of before ("=20*2") still compute. Values are invented.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { formulaOfText, reconcileFormulas } from "../src/features/valuations/calculation/captured-formulas";
import { parseDecimal } from "../src/features/valuations/calculation/free-formula";
import { comparableFormulaValues, type ComparableDto } from "../src/features/valuations/calculation/market-types";
import type { StatisticalComparableDto, StatisticalSettingsDto } from "../src/features/valuations/calculation/statistical-types";
import type { AppSection, Block, Concept, TableContent } from "../src/features/valuations/model";
import { buildFormulaIndex } from "../src/features/valuations/services/formula-references";
import {
  downstreamOf,
  followComparableFormulas,
  followStatisticalFormulas,
  formulaWithLastValues,
  hasLiveReferences,
  liveFormulaText,
  liveFormulaWarning,
  readableFormulaText,
  resolveCaptureFormulas,
  resolveLiveFormula,
  sectionLiveFormulaOwner,
  withValueAtPath,
} from "../src/features/valuations/services/live-formulas";
import type { TableV2 } from "../src/features/valuations/services/table";

const concept = (id: string, label: string, value: string, extra: Partial<Concept> = {}): Concept => ({ id, label, value, type: "number", ...extra });

function tableOf(id: string, title: string, rows: string[][]): TableV2 {
  return {
    id,
    title,
    version: 2,
    columns: [{ id: "c1", name: "Lote" }, { id: "c2", name: "Superficie" }],
    rows: rows.map((row, rowIndex) => ({
      id: `r${rowIndex + 1}`,
      cells: Object.fromEntries(row.map((value, columnIndex) => [`c${columnIndex + 1}`, { kind: "value" as const, value }])),
    })),
  };
}

function block(id: string, title: string, concepts: Concept[], tables: TableV2[] = []): Block {
  return { id, title, sectionLabel: "", enabled: true, required: false, concepts, apartados: [], tables: tables as unknown as TableContent[], images: [] };
}

function valuation(options: { area?: string; lots?: string[][]; withArea?: boolean; costValue?: string; concluded?: string } = {}): AppSection[] {
  const terrain = block("bloque-terreno", "Terreno", options.withArea === false ? [] : [concept("c-superficie", "Superficie total de terreno", options.area ?? "20")],
    [tableOf("t-lotes", "Lotes", options.lots ?? [["A", "600"], ["B", "650"]])]);
  return [
    { id: "terreno", label: "TERRENO", title: "TERRENO", sourceFile: "", enabled: true, required: false, blocks: [terrain] },
    {
      id: "costos", label: "COSTOS", title: "ENFOQUE DE COSTOS", sourceFile: "", enabled: true, required: false,
      blocks: [block("motor-costos-resumen", "Resumen", [concept("c-fisico", "Valor físico total", options.costValue ?? "1000000")])],
    },
    {
      id: "conclusiones", label: "CONCLUSIONES", title: "CONCLUSIONES", sourceFile: "", enabled: true, required: false,
      blocks: [block("conclusion-valor", "Valor", [concept("c-concluido", "Valor concluido", options.concluded ?? "2200000")])],
    },
  ];
}

const tagged = (text: string, sections = valuation()) => {
  const result = liveFormulaText(text, buildFormulaIndex(sections));
  assert.ok(result.ok, result.ok ? "" : result.message);
  return result.text;
};

test("a reference typed in a panel field is kept with its id and the number it read", () => {
  const index = buildFormulaIndex(valuation());
  const text = tagged("=[Superficie total de terreno]*2");
  assert.equal(text, "={c:c-superficie|20}*2");
  assert.ok(hasLiveReferences(text));
  // The panel, the server's check and the memory compute it as the formula with values of before.
  assert.equal(parseDecimal(text), 40);
  assert.equal(formulaOfText(text), text);
  assert.equal(formulaWithLastValues(text), "=20*2");
  // The appraiser reads and corrects it with its names.
  assert.equal(readableFormulaText(text, index), "=[Superficie total de terreno]*2");
});

test("cells of another table are kept by row and column, also inside a function", () => {
  const index = buildFormulaIndex(valuation());
  const text = tagged("=SUMA([Lotes]!B1:B2)/2");
  assert.equal(parseDecimal(text), 625);
  assert.equal(readableFormulaText(text, index), "=SUMA([Lotes]!B1; [Lotes]!B2)/2");
});

test("arithmetic and formulas with numbers stay as typed (compatibility)", () => {
  const index = buildFormulaIndex(valuation());
  assert.deepEqual(liveFormulaText("=20*2", index), { ok: true, text: "=20*2" });
  assert.deepEqual(liveFormulaText("=(1345*235)^(1/6)", index), { ok: true, text: "=(1345*235)^(1/6)" });
  // A stored "=20*2" has nothing to follow: resolving leaves it, and it still computes.
  assert.deepEqual(resolveLiveFormula("=20*2", index, "COSTOS"), { text: "=20*2", changed: false, problems: [] });
  assert.equal(parseDecimal("=20*2"), 40);
});

test("when the concept changes, the field follows it", () => {
  const text = tagged("=[Superficie total de terreno]*2");
  const resolved = resolveLiveFormula(text, buildFormulaIndex(valuation({ area: "35" })), "COSTOS");
  assert.equal(resolved.changed, true);
  assert.deepEqual(resolved.problems, []);
  assert.equal(resolved.text, "={c:c-superficie|35}*2");
  assert.equal(parseDecimal(resolved.text), 70);
  // The same document again: nothing to change.
  assert.equal(resolveLiveFormula(resolved.text, buildFormulaIndex(valuation({ area: "35" })), "COSTOS").changed, false);
});

test("a renamed concept is the same reference; its new name is read", () => {
  const text = tagged("=[Superficie total de terreno]*2");
  const renamed = valuation({ area: "30" });
  renamed[0].blocks[0].concepts[0] = { ...renamed[0].blocks[0].concepts[0], label: "Superficie según escrituras" };
  const index = buildFormulaIndex(renamed);
  assert.equal(parseDecimal(resolveLiveFormula(text, index, "COSTOS").text), 60);
  assert.equal(readableFormulaText(text, index), "=[Superficie según escrituras]*2");
});

test("a deleted reference keeps the last value and says so, without blocking", () => {
  const text = tagged("=[Superficie total de terreno]*2");
  const index = buildFormulaIndex(valuation({ withArea: false }));
  const resolved = resolveLiveFormula(text, index, "COSTOS");
  assert.equal(resolved.changed, false);
  assert.equal(resolved.text, text);
  assert.equal(parseDecimal(resolved.text), 40);
  assert.deepEqual(resolved.problems.map((problem) => problem.kind), ["broken"]);
  assert.match(liveFormulaWarning(resolved.problems) ?? "", /ya no existe.*último valor \(20\)/);
  assert.equal(readableFormulaText(text, index), "=#REF!*2");
});

test("a cell that lost its number, or a deleted row, keep the last value", () => {
  const text = tagged("=[Lotes]!B2*3");
  const emptied = resolveLiveFormula(text, buildFormulaIndex(valuation({ lots: [["A", "600"], ["B", ""]] })), "COSTOS");
  assert.deepEqual(emptied.problems.map((problem) => problem.kind), ["empty"]);
  assert.equal(parseDecimal(emptied.text), 1950);
  const removed = resolveLiveFormula(text, buildFormulaIndex(valuation({ lots: [["A", "600"]] })), "COSTOS");
  assert.deepEqual(removed.problems.map((problem) => problem.kind), ["broken"]);
  assert.equal(parseDecimal(removed.text), 1950);
});

test("a field that reads what its own calculation produces is circular: it keeps its value and warns", () => {
  // A cost field reading the concluded value: the conclusion is computed with the costs.
  const concluded = tagged("=[Valor concluido]*0.1");
  const later = buildFormulaIndex(valuation({ concluded: "3000000" }));
  const fromConclusion = resolveLiveFormula(concluded, later, "COSTOS");
  assert.deepEqual(fromConclusion.problems.map((problem) => problem.kind), ["circular"]);
  assert.equal(parseDecimal(fromConclusion.text), 220000);
  assert.match(liveFormulaWarning(fromConclusion.problems) ?? "", /Referencia circular/);
  // A cost field reading the cost approach's own generated block.
  const own = tagged("=[Valor físico total]/2");
  assert.deepEqual(resolveLiveFormula(own, buildFormulaIndex(valuation({ costValue: "5" })), "COSTOS").problems.map((problem) => problem.kind), ["circular"]);
  // The income approach may read the cost approach: that one is not circular.
  const income = resolveLiveFormula(own, buildFormulaIndex(valuation({ costValue: "5" })), "INGRESOS");
  assert.deepEqual(income.problems, []);
  assert.equal(parseDecimal(income.text), 2.5);
});

test("circularity follows the field's own market, not the section: the buildings market may read the cost pages", () => {
  const own = tagged("=[Valor físico total]/2");
  const index = buildFormulaIndex(valuation({ costValue: "8" }));
  // The buildings for sale market does not feed the cost approach: no warning, and it follows.
  const buildings = resolveLiveFormula(own, index, "MERCADO:INMUEBLE_VENTA");
  assert.deepEqual(buildings.problems, []);
  assert.equal(parseDecimal(buildings.text), 4);
  // The land for sale market does (the land of the cost approach is valued with it): circular.
  assert.deepEqual(resolveLiveFormula(own, index, "MERCADO:TERRENO_VENTA").problems.map((problem) => problem.kind), ["circular"]);
  // A market section names no calculation of its own: each market's panel names its own.
  assert.equal(sectionLiveFormulaOwner("MERCADO_VENTA", false), null);
  assert.equal(sectionLiveFormulaOwner("MERCADO_RENTAS", false), null);
  assert.equal(sectionLiveFormulaOwner("COSTOS", false), "COSTOS");
  assert.equal(sectionLiveFormulaOwner("COSTOS", true), "MAQUINARIA");
});

test("circularity also goes through the document's own formulas", () => {
  const sections = valuation();
  // A concept of the document computed from the cost approach's block.
  sections[0].blocks[0].concepts.push(concept("c-mitad", "Mitad del físico", "500000", {
    formula: { expression: { type: "binary", operator: "DIVIDE", left: { type: "operand", operand: { type: "concept", conceptId: "c-fisico" } }, right: { type: "constant", value: 2 } } },
  }));
  const text = tagged("=[Mitad del físico]+1", sections);
  assert.deepEqual(resolveLiveFormula(text, buildFormulaIndex(sections), "COSTOS").problems.map((problem) => problem.kind), ["circular"]);
});

test("the chain of calculations: what a change of the land market reaches", () => {
  const reached = downstreamOf(["MERCADO:TERRENO_VENTA"]);
  assert.ok(reached.has("COSTOS") && reached.has("CONCLUSION"));
  assert.ok(!reached.has("INGRESOS"));
  assert.ok(downstreamOf(["INGRESOS"]).has("CONCLUSION"));
});

test("a capture's formulas read again give the new values of the fields, a percentage as its fraction", () => {
  const formulas = { "land.unitValue": tagged("=[Superficie total de terreno]*100"), "indirects.0.percentage": tagged("=[Superficie total de terreno]/2"), "land.subjectArea": "=20*2" };
  const update = resolveCaptureFormulas(formulas, buildFormulaIndex(valuation({ area: "30" })), "COSTOS", (path) => path.endsWith("percentage"));
  assert.deepEqual(update.values, { "land.unitValue": 3000, "indirects.0.percentage": 0.15 });
  assert.equal(update.formulas["land.subjectArea"], "=20*2");
  assert.deepEqual(update.warnings, {});
  // The server's check takes the new formula with the new value.
  const next = withValueAtPath({ land: { unitValue: 2000, subjectArea: 40 }, indirects: [{ percentage: 0.1 }] }, "land.unitValue", 3000);
  const checked = reconcileFormulas({
    next: withValueAtPath(next, "indirects.0.percentage", 0.15),
    sent: update.formulas,
    previous: {},
    previousFormulas: {},
    percent: (path) => path.endsWith("percentage"),
  });
  assert.equal(checked.ok, true);
});

test("a reference without a number is refused when typed, with the reason", () => {
  const sections = valuation();
  sections[0].blocks[0].concepts.push(concept("c-colonia", "Colonia", "Centro", { type: "text" }));
  const result = liveFormulaText("=[Colonia]*2", buildFormulaIndex(sections));
  assert.equal(result.ok, false);
  assert.equal(liveFormulaText("=[No existe]*2", buildFormulaIndex(sections)).ok, false);
});

/* ------------------------------------------------------------------ */
/*  The cells of the capture tables and the comparable's card          */
/* ------------------------------------------------------------------ */

type CardComparable = Pick<ComparableDto, "factors" | "formulas" | "area" | "price" | "frontage" | "depth">;

const comparable = (formulas: Record<string, string>): CardComparable => ({
  area: 40, price: 1_000_000, frontage: 10, depth: null,
  factors: [
    { type: "NEGOCIACION", value: 0.9 / 1.05, subjectRating: null, comparableRating: null, justification: "Oferta" },
    { type: "UBICACION", value: 1.2, subjectRating: 1.2, comparableRating: 1, justification: null },
  ],
  formulas,
});

test("a comparable's card and homologation cells follow the concepts they read; numbers of before stay", () => {
  const formulas = {
    area: tagged("=[Superficie total de terreno]*2"),
    "factors.UBICACION": tagged("=[Superficie total de terreno]/20"),
    "factors.NEGOCIACION": "=0.9/1.05",
  };
  // Nothing changed: nothing to save.
  assert.equal(followComparableFormulas(comparable(formulas), buildFormulaIndex(valuation()), "MERCADO:TERRENO_VENTA"), null);
  // The concept goes from 20 to 30: the area 60, the location factor 1.5, the negotiation as it was.
  const next = followComparableFormulas(comparable(formulas), buildFormulaIndex(valuation({ area: "30" })), "MERCADO:TERRENO_VENTA");
  assert.ok(next);
  assert.equal(next.area, 60);
  assert.equal(next.formulas?.area, "={c:c-superficie|30}*2");
  assert.deepEqual(next.factors.find((factor) => factor.type === "UBICACION"), { type: "UBICACION", value: 1.5, subjectRating: null, comparableRating: null, justification: null });
  assert.equal(next.factors.find((factor) => factor.type === "NEGOCIACION")?.value, 0.9 / 1.05);
  assert.equal(next.formulas?.["factors.NEGOCIACION"], "=0.9/1.05");
  // The server's check of the comparable takes the new formulas with the new values.
  const checked = reconcileFormulas({ next: comparableFormulaValues(next as ComparableDto), sent: next.formulas, previous: {}, previousFormulas: {} });
  assert.equal(checked.ok, true);
});

test("a comparable whose reference was deleted or is circular keeps its last values", () => {
  const formulas = { "factors.UBICACION": tagged("=[Superficie total de terreno]/20"), price: tagged("=[Valor físico total]/2") };
  // The concept is gone; the cost pages are produced with the land market: nothing follows.
  assert.equal(followComparableFormulas(comparable(formulas), buildFormulaIndex(valuation({ withArea: false, costValue: "4" })), "MERCADO:TERRENO_VENTA"), null);
  const resolved = resolveLiveFormula(formulas.price, buildFormulaIndex(valuation({ costValue: "4" })), "MERCADO:TERRENO_VENTA");
  assert.match(liveFormulaWarning(resolved.problems) ?? "", /Referencia circular/);
  // The buildings market does not feed the cost approach: its comparable follows the cost pages.
  assert.equal(followComparableFormulas(comparable(formulas), buildFormulaIndex(valuation({ costValue: "4" })), "MERCADO:INMUEBLE_VENTA")?.price, 2);
});

test("the alternative methods' cells follow: values, prices, bases and ratings", () => {
  const index = buildFormulaIndex(valuation({ area: "30" }));
  const calculation: { settings: Pick<StatisticalSettingsDto, "subject" | "variables">; comparables: Array<Pick<StatisticalComparableDto, "price" | "priceFormula" | "values">> } = {
    settings: {
      subject: { area: tagged("=[Superficie total de terreno]"), age: "12" },
      variables: [
        { key: "age", coding: "CONTRARY", base: 20, baseFormula: tagged("=[Superficie total de terreno]") },
        { key: "custom:zona", coding: "SCALE", scaleMode: "FREE", scale: [{ label: "Buena", value: 20, formula: tagged("=[Superficie total de terreno]") }, { label: "Mala", value: 1 }] },
      ],
    },
    comparables: [
      { price: 2000, priceFormula: tagged("=[Superficie total de terreno]*100"), values: { area: "=20*2", age: tagged("=[Superficie total de terreno]/2") } },
      { price: 900, values: { area: "45" } },
    ],
  };
  const next = followStatisticalFormulas(calculation, index, "ESTADISTICO:TERRENO_VENTA");
  assert.ok(next);
  assert.equal(parseDecimal(next.settings.subject.area), 30);
  assert.equal(next.settings.subject.age, "12");
  assert.equal(next.settings.variables[0].base, 30);
  assert.equal(next.settings.variables[1].scale?.[0].value, 30);
  assert.deepEqual(next.settings.variables[1].scale?.[1], { label: "Mala", value: 1 });
  assert.equal(next.comparables[0].price, 3000);
  assert.equal(next.comparables[0].values.area, "=20*2", "a formula with numbers stays as typed");
  assert.equal(parseDecimal(next.comparables[0].values.age), 15);
  assert.deepEqual(next.comparables[1], calculation.comparables[1]);
  // The same document as when they were typed: nothing to save.
  assert.equal(followStatisticalFormulas(calculation, buildFormulaIndex(valuation()), "ESTADISTICO:TERRENO_VENTA"), null);
});

test("a stored live formula copied along a row reads as the appraiser writes it", () => {
  const index = buildFormulaIndex(valuation());
  const stored = tagged("=[Superficie total de terreno]*2");
  assert.deepEqual(liveFormulaText(stored, index), { ok: true, text: stored });
});
