/**
 * The labels of the boxes and concepts the calculation writes in the
 * dictamen, renamed by the appraiser ("Valor físico de reposición" as "Valor
 * neto de reposición"), and the rent market's dispersion in the income approach.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { costDocumentBlocks } from "../src/features/valuations/calculation/cost-document";
import { DEFAULT_LAND, emptyInstallation, toCostEngineInput, type CostCalculationDto } from "../src/features/valuations/calculation/cost-types";
import { figureColumn, generatedTable, printedTable } from "../src/features/valuations/calculation/generated-content";
import {
  applyTableLayout,
  layoutOf,
  summaryCaptionKey,
  summaryRowKey,
  withBoxLabel,
  withConceptLabel,
} from "../src/features/valuations/calculation/generated-table-layout";
import { incomeDocumentBlocks } from "../src/features/valuations/calculation/income-document";
import { DEFAULT_INCOME, rentMarketStats, toIncomeEngineInput, type IncomeCalculationDto } from "../src/features/valuations/calculation/income-types";
import { replaceGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeCostApproach } from "../src/features/valuations/engine/costs";
import { SURFACE_SLOT, type CapturedFactor } from "../src/features/valuations/engine/factors";
import { computeIncomeApproach } from "../src/features/valuations/engine/income";
import { homologate, type ComparableInput } from "../src/features/valuations/engine/market";
import { Trace } from "../src/features/valuations/engine/trace";
import type { AppSection, Block, TableContent } from "../src/features/valuations/model";
import { ensureTableV2, type TableSummaryBox } from "../src/features/valuations/services/table";
import { serializeTableForSave } from "../src/features/valuations/services/table-persistence";

/* ── Boxes of the cost approach ─────────────────────────────────── */

const casa = { ref: "T-1", description: "Casa", classification: "Moderno", quality: "Media", area: 120, age: 10, usefulLife: 60 };
const costs = (unitReplacementCost: number): CostCalculationDto => ({
  land: { ...DEFAULT_LAND },
  types: [casa],
  constructions: [{ ...casa, conservation: 0.9, conservationRating: null, ageFactor: 0.8, otherFactor: 1, resultantFactor: null, completion: 1, undivided: 1, unitReplacementCost }],
  installations: [{ ...emptyInstallation(0), ref: "1", description: "Cisterna", quantity: 1, age: 10, usefulLife: 30, conservation: 1, ageFactor: 0.5, unitReplacementCost: 20000 }],
  indirects: [],
  market: { adoptedUnitValue: null, subjectArea: null, baseArea: null },
  configured: true,
  typesCaptured: true,
  locked: false,
});

function costBlocks(calculation: CostCalculationDto) {
  const input = toCostEngineInput(calculation);
  assert.ok(input.ok);
  const trace = new Trace();
  return costDocumentBlocks(calculation, computeCostApproach(input.input, DEFAULT_ENGINE_CONFIG, trace), trace);
}

/** The table that closes the cost page, with the physical value under it. */
const closingTable = (blocks: Block[]) => blocks[0].apartados.flatMap((apartado) => apartado.tables)
  .find((table) => ensureTableV2(table).schema?.summaryBoxes?.some((box) => box.id === "valor-fisico"))!;
const boxRows = (table: TableContent, id: string) =>
  ensureTableV2(table).schema?.summaryBoxes?.find((box) => box.id === id)?.rows.map((row) => [row.label, row.value]);

const costSection = (blocks: Block[]): AppSection => ({ id: "costos", label: "", title: "COSTOS", sourceFile: "", enabled: true, required: false, blocks });
const ownsCosts = (block: Block) => block.id.startsWith("motor-costos");

/** The blocks with one table put in place of the one with the same id. */
const withTable = (blocks: Block[], next: TableContent): Block[] => blocks.map((block) => ({
  ...block,
  apartados: block.apartados.map((apartado) => ({ ...apartado, tables: apartado.tables.map((table) => (table.id === next.id ? next : table)) })),
}));

test("the physical value prints under the appraiser's name and keeps it when the calculation writes the page again", () => {
  const written = costBlocks(costs(10000));
  const closing = closingTable(written);
  const box = ensureTableV2(closing).schema!.summaryBoxes!.find((item) => item.id === "valor-fisico")!;
  const total = box.rows.findIndex((row) => row.emphasis === "total");
  assert.match(box.rows[total].label, /^VALOR FÍSICO DE REPOSICIÓN \(/);
  const key = summaryRowKey(box, box.rows[total], total);
  assert.equal(key, "valor-fisico.total", "the row is named, not counted");

  const renamed = applyTableLayout(closing, withBoxLabel(layoutOf(closing), key, "VALOR NETO DE REPOSICIÓN:"));
  const before = boxRows(renamed, "valor-fisico")!;
  assert.equal(before.at(-1)![0], "VALOR NETO DE REPOSICIÓN:");
  assert.equal(before.at(-1)![1], boxRows(closing, "valor-fisico")!.at(-1)![1], "the figure stays the calculation's");
  assert.deepEqual(before.slice(0, -1), boxRows(closing, "valor-fisico")!.slice(0, -1), "the other rows as written");

  // The cost changes: the page is written again with the new figure under the appraiser's name.
  const section = costSection(withTable(written, renamed));
  const next = replaceGeneratedBlocks(section, ownsCosts, costBlocks(costs(12000)));
  const rewritten = boxRows(closingTable(next.blocks), "valor-fisico")!;
  assert.equal(rewritten.at(-1)![0], "VALOR NETO DE REPOSICIÓN:");
  assert.notEqual(rewritten.at(-1)![1], before.at(-1)![1]);
  assert.equal(rewritten.at(-1)![1], boxRows(closingTable(costBlocks(costs(12000))), "valor-fisico")!.at(-1)![1]);
  // Written again the same, the section is left as it is.
  assert.equal(replaceGeneratedBlocks(next, ownsCosts, costBlocks(costs(12000))), next);

  // An empty name gives back the calculation's.
  const restored = applyTableLayout(renamed, withBoxLabel(layoutOf(renamed), key, " "));
  assert.deepEqual(printedTable(restored), printedTable(closing));
});

test("a renamed box label follows its row when a row before it comes and goes, and travels in the saved table", () => {
  const box = (additional: boolean): TableSummaryBox => ({
    id: "valor",
    position: "bottom",
    align: "end",
    caption: "Resumen",
    rows: [
      { id: "subtotal", label: "Subtotal:", value: "$ 100.00" },
      ...(additional ? [{ id: "adicional", label: "Monto adicional a considerar:", value: "$ 5.00" }] : []),
      { id: "valor", label: "VALOR COMPARATIVO DE MERCADO (TERRENOS):", value: additional ? "$ 105.00" : "$ 100.00", emphasis: "total" as const },
    ],
  });
  const table = (additional: boolean) => generatedTable("motor-mercado-terreno_venta-tabla-valor", "Valor", [figureColumn("REF")], [["1"]], { summaryBoxes: [box(additional)] });
  const layout = withBoxLabel(withBoxLabel(withBoxLabel({}, "valor.valor", "VALOR DE MERCADO:"), "valor.adicional", "Monto adicional:"), summaryCaptionKey(box(true)), "Conclusión");
  const owns = (block: Block) => block.id.startsWith("motor-mercado-terreno_venta");
  const marketBlock = (item: TableContent): Block => ({
    id: "motor-mercado-terreno_venta", title: "ENFOQUE", sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [item], images: [],
  });
  const section: AppSection = { id: "mercado", label: "", title: "MERCADO", sourceFile: "", enabled: true, required: false, blocks: [marketBlock(applyTableLayout(table(true), layout))] };
  assert.deepEqual(boxRows(section.blocks[0].tables[0], "valor"), [["Subtotal:", "$ 100.00"], ["Monto adicional:", "$ 5.00"], ["VALOR DE MERCADO:", "$ 105.00"]]);

  // The additional amount leaves the box: the value keeps its name.
  const next = replaceGeneratedBlocks(section, owns, [marketBlock(table(false))]);
  const printed = next.blocks[0].tables[0];
  assert.deepEqual(boxRows(printed, "valor"), [["Subtotal:", "$ 100.00"], ["VALOR DE MERCADO:", "$ 100.00"]]);
  assert.equal(ensureTableV2(printed).schema?.summaryBoxes?.[0].caption, "Conclusión");

  const payload = serializeTableForSave(printed);
  assert.deepEqual(payload.schema?.generated?.layout.boxLabels, layout.boxLabels);
  assert.equal(payload.schema?.summaryBoxes?.[0].rows.at(-1)?.label, "VALOR DE MERCADO:");
});

/* ── Concepts of the income approach ─────────────────────────────── */

const fixed = (key: string, value: number): CapturedFactor => ({ key, label: key, value });
const rent = (id: string, price: number, area: number): ComparableInput => ({ id, price, area, factors: [fixed("negociacion", 0.95), SURFACE_SLOT, fixed("zona", id === "3" ? 1.05 : 1)] });
const rents = [rent("1", 3500, 260), rent("2", 3200, 250), rent("3", 3400, 240), rent("4", 3100, 230)];

const income = (patch: Partial<IncomeCalculationDto> = {}): IncomeCalculationDto => ({
  ...DEFAULT_INCOME,
  rentableUnits: [{ description: "Casa habitación", area: 160, unitRent: null }],
  ratingColumns: [1, 3, 1, 2, 2, 0, 4],
  appliedRate: 0.0886,
  rentMarket: {
    adoptedUnitRent: 14, subjectArea: 160,
    comparables: rents.map((row) => ({ reference: Number(row.id), location: `Casa ${row.id}`, area: row.area, price: row.price })),
    homologation: { subjectArea: 160, surfacePower: 6, comparables: rents },
  },
  configured: true,
  locked: false,
  ...patch,
});

function incomeBlocks(calculation: IncomeCalculationDto) {
  const input = toIncomeEngineInput(calculation);
  assert.ok(input.ok);
  return incomeDocumentBlocks(calculation, computeIncomeApproach(input.input, DEFAULT_ENGINE_CONFIG));
}

test("a concept of the income approach printed under the appraiser's name keeps it when the value changes", () => {
  const written = incomeBlocks(income());
  const result = written.find((block) => block.id === "motor-ingresos-resultado")!;
  assert.equal(result.concepts[0].id, "motor-ingresos-resultado-valor");
  const renamed = { ...result, concepts: result.concepts.map((concept) => withConceptLabel(concept, "Valor por ingresos")) };
  assert.deepEqual([renamed.concepts[0].label, renamed.concepts[0].generatedLabel], ["Valor por ingresos", "Valor por capitalización de rentas"]);

  const owns = (block: Block) => block.id.startsWith("motor-ingresos");
  const section: AppSection = {
    id: "ingresos", label: "", title: "INGRESOS", sourceFile: "", enabled: true, required: false,
    blocks: written.map((block) => (block.id === result.id ? renamed : block)),
  };
  const next = replaceGeneratedBlocks(section, owns, incomeBlocks(income({ appliedRate: 0.09 })));
  const concept = next.blocks.find((block) => block.id === "motor-ingresos-resultado")!.concepts[0];
  assert.equal(concept.label, "Valor por ingresos");
  assert.equal(concept.generatedLabel, "Valor por capitalización de rentas");
  assert.notEqual(concept.value, renamed.concepts[0].value, "the value is the new calculation's");

  // The same name as the calculation's, or none, is no rename.
  const { generatedLabel: _renamed, ...plain } = concept;
  assert.deepEqual(withConceptLabel(concept, ""), { ...plain, label: "Valor por capitalización de rentas" });
  assert.equal(withConceptLabel(concept, "Valor por capitalización de rentas").generatedLabel, undefined);
});

/* ── Dispersion of the rent market in the income approach ─────────── */

test("the income approach shows the rent market's initial and final dispersion and its lowest and highest rents", () => {
  const calculation = income();
  const stats = rentMarketStats(calculation, null);
  assert.ok(stats);
  // The same homologation the rent market makes.
  const expected = homologate(calculation.rentMarket.homologation!, DEFAULT_ENGINE_CONFIG.surfaceOrientation.income, new Trace(), "ingresos.rentas").stats;
  assert.deepEqual(stats, expected);
  assert.equal(stats.offerMin, 3200 / 250);
  assert.equal(stats.offerMax, 3400 / 240);
  assert.equal(stats.initialDispersion, (3400 / 240) / (3200 / 250));
  assert.equal(stats.dispersion, stats.max / stats.min);

  const blocks = incomeBlocks(calculation);
  assert.equal(blocks[0].id, "motor-ingresos-dispersion", "before the capitalization");
  assert.equal(blocks[0].title, "DISPERSIÓN DEL MERCADO DE RENTAS");
  assert.deepEqual(blocks[0].concepts.map((concept) => concept.label), [
    "Mínimo de oferta", "Máximo de oferta", "Dispersión inicial", "Mínimo homologado", "Máximo homologado", "Dispersión final",
  ]);
  assert.equal(blocks[0].concepts[0].value, "$12.80 /m²/mes");
  assert.equal(blocks[0].concepts[2].value, stats.initialDispersion.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  assert.equal(blocks[0].concepts[5].value, stats.dispersion.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  // The market-rate method homologates the rents itself: the same statistics.
  const marketRate = income({ method: "mercado", marketRate: { negotiation: 0, vacancy: 0, salePrices: { 1: 500000, 2: 480000, 3: 520000, 4: 450000 } } });
  const input = toIncomeEngineInput(marketRate);
  assert.ok(input.ok);
  const result = computeIncomeApproach(input.input, DEFAULT_ENGINE_CONFIG);
  assert.deepEqual(rentMarketStats(marketRate, result), result.rentMarket!.stats);
  assert.deepEqual(rentMarketStats(marketRate, result), stats);

  // Without rent comparables there is nothing to show.
  const withoutMarket = income({ rentMarket: { adoptedUnitRent: 14, subjectArea: 160, comparables: [], homologation: null } });
  assert.equal(rentMarketStats(withoutMarket, null), null);
  assert.ok(!incomeBlocks(withoutMarket).some((block) => block.id === "motor-ingresos-dispersion"));
});
