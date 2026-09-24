import assert from "node:assert/strict";
import { test } from "node:test";
import { costDocumentBlocks, withConstructionTables } from "../src/features/valuations/calculation/cost-document";
import { DEFAULT_LAND, emptyInstallation, toCostEngineInput, type CostCalculationDto } from "../src/features/valuations/calculation/cost-types";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeCostApproach } from "../src/features/valuations/engine/costs";
import { Trace } from "../src/features/valuations/engine/trace";
import type { AppSection, TableContent } from "../src/features/valuations/model";
import { ensureTableV2 } from "../src/features/valuations/services/table";

const arandas: CostCalculationDto = {
  land: { ...DEFAULT_LAND, subjectArea: 169.78 },
  constructions: [{
    ref: "T-1", description: "Edificio de uso mixto", classification: "Moderno", quality: "Media",
    area: 467.27, age: 2, usefulLife: 70, conservation: 0.98, otherFactor: 1, completion: 1, undivided: 1, unitReplacementCost: 14361.99,
  }],
  installations: ([
    [6, 30, 9000], [1, 30, 35000], [11.55, 70, 14361.99], [3.54, 70, 14361.99],
    [4, 10, 30648], [1, 70, 90000], [4, 20, 4000], [4, 20, 3500],
  ] as const).map(([quantity, usefulLife, unitReplacementCost], index) => ({
    ...emptyInstallation(index), description: `Instalación ${index + 1}`, quantity, age: 2, usefulLife, conservation: 0.975, unitReplacementCost,
  })),
  indirects: [],
  market: { adoptedUnitValue: 9000, subjectArea: 169.78, baseArea: null },
  configured: true,
  locked: false,
};

function compute(calculation: CostCalculationDto) {
  const input = toCostEngineInput(calculation);
  assert.ok(input.ok);
  const trace = new Trace();
  return { result: computeCostApproach(input.input, DEFAULT_ENGINE_CONFIG, trace), trace };
}

test("the cost blocks show land, constructions, installations and the physical value", () => {
  const { result, trace } = compute(arandas);
  const blocks = costDocumentBlocks(arandas, result, trace);
  assert.deepEqual(blocks.map((block) => block.id), [
    "motor-costos-terreno", "motor-costos-construcciones", "motor-costos-instalaciones", "motor-costos-resumen",
  ]);
  const summary = blocks.at(-1)?.concepts.map((concept) => [concept.label, concept.value]);
  assert.deepEqual(summary, [
    ["A) Valor del terreno", "$1,528,000.00"],
    ["B) Valor de las construcciones", "$6,530,000.00"],
    ["C) Instalaciones especiales", "$517,000.00"],
    ["Valor físico o directo", "$8,580,000.00"],
  ]);
  const land = blocks[0].concepts.find((concept) => concept.label === "Valor unitario de mercado");
  assert.equal(land?.value, "$9,000.00 /m²", "el terreno toma el valor adoptado en mercado");
});

const constructionSection = (tables: TableContent[]): AppSection => ({
  id: "construccion", label: "IV", title: "CONSTRUCCIONES", sourceFile: "", enabled: true, required: false,
  blocks: [{
    id: "construccion_descripcion_general", title: "DESCRIPCIÓN", sectionLabel: "", enabled: true, required: false,
    concepts: [], tables: [], images: [],
    apartados: [{ id: "construccion_tipos", title: "TIPOS", enabled: true, concepts: [], images: [], tables }],
  }],
});

const templateTable = (id: string, columns: string[]): TableContent => ({ id, title: id, columns, rows: [columns.map(() => "")], enabled: true });

test("the capture fills the construction section tables once, and a reload leaves them as they are", () => {
  const section = constructionSection([
    templateTable("construccion_tipos", ["Tipo", "Tipo", "Clasificación", "Calidad", "Conservación", "Edad", "VUT", "VUR", "Sup. (m²)", "Descripción"]),
    templateTable("instalaciones_especiales", ["#", "Tipo", "Edad", "VUT", "VUR", "Conservación", "Mantenimiento", "Descripción"]),
  ]);
  const filled = withConstructionTables(section, arandas);
  const [types, installations] = filled.blocks[0].apartados[0].tables as (TableContent & { rows: string[][] })[];
  assert.deepEqual(types.rows[0], ["T-1", "Edificio de uso mixto", "Moderno", "Media", "0.98", "2", "70", "68", "467.27", ""]);
  assert.equal(installations.rows.length, 8);

  const reloaded = { ...filled, blocks: filled.blocks.map((block) => ({
    ...block,
    apartados: block.apartados.map((apartado) => ({ ...apartado, tables: apartado.tables.map((table) => ensureTableV2(table) as unknown as TableContent) })),
  })) };
  assert.equal(withConstructionTables(reloaded, arandas), reloaded);
});

test("without a capture the construction tables the appraiser wrote stay untouched", () => {
  const section = constructionSection([templateTable("construccion_tipos", ["Tipo", "Descripción"])]);
  assert.equal(withConstructionTables(section, { ...arandas, constructions: [], installations: [] }), section);
});
