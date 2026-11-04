import assert from "node:assert/strict";
import { test } from "node:test";
import { caratulaConclusionValues, conclusionValues, withConceptValues } from "../src/features/valuations/calculation/conclusion-document";
import { NO_CAPITALIZATION_RATE, NO_UNIT_RENT, incomeDocumentBlocks } from "../src/features/valuations/calculation/income-document";
import { DEFAULT_ANNUITY, DEFAULT_DEDUCTIONS, DEFAULT_MARKET_RATE, toIncomeEngineInput, type IncomeCalculationDto } from "../src/features/valuations/calculation/income-types";
import { concludeValue } from "../src/features/valuations/engine/conclusion";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeIncomeApproach } from "../src/features/valuations/engine/income";
import type { AppSection } from "../src/features/valuations/model";
import { formatConceptValueForDocument } from "../src/features/valuations/services/concept-value-format";

const tch: IncomeCalculationDto = {
  method: "tabla",
  annuity: DEFAULT_ANNUITY,
  marketRate: DEFAULT_MARKET_RATE,
  rentableUnits: [{ description: "Casa habitación", area: 250, unitRent: null }],
  deductions: DEFAULT_DEDUCTIONS,
  ratingColumns: [1, 3, 1, 2, 2, 0, 4],
  appliedRate: 0.0886,
  rentMarket: { adoptedUnitRent: 30, subjectArea: 250, comparables: [], homologation: null },
  configured: true,
  locked: false,
};

test("the income blocks show rents, deductions, the rate table and the value", () => {
  const input = toIncomeEngineInput(tch);
  assert.ok(input.ok);
  const blocks = incomeDocumentBlocks(tch, computeIncomeApproach(input.input, DEFAULT_ENGINE_CONFIG));
  assert.deepEqual(blocks.map((block) => block.id), ["motor-ingresos-rentas", "motor-ingresos-deducciones", "motor-ingresos-tasa", "motor-ingresos-resultado"]);
  const rate = blocks[2].tables[0] as unknown as { rows: string[][] };
  assert.deepEqual(rate.rows[0], ["Edad", "5 a 20", "8 %"]);
  assert.equal(blocks[3].concepts[0].value, "$700,902.93");
});

test("the income approach waits for the rate: the whole table or a captured rate", () => {
  const withoutRate = { ...tch, appliedRate: null, ratingColumns: [1, 3, null, 2, 2, 0, 4] };
  assert.deepEqual(toIncomeEngineInput(withoutRate), { ok: false, reason: "Califica los siete criterios de la tabla de tasa, o captura la tasa." });
});

test("without the rate the blocks print what was captured and «Sin tasa de capitalización», not a dash everywhere", () => {
  // The audit's case (2 Nov 2026): 100 m² at $100 captured, no rate.
  const partial: IncomeCalculationDto = {
    ...tch, appliedRate: null, ratingColumns: [null, null, null, null, null, null, null],
    rentableUnits: [{ description: "Local", area: 100, unitRent: 100 }],
    rentMarket: { adoptedUnitRent: null, subjectArea: null, comparables: [], homologation: null },
  };
  const input = toIncomeEngineInput(partial);
  assert.equal(input.ok, false);
  const blocks = incomeDocumentBlocks(partial, null, input.ok ? "" : input.reason);
  assert.deepEqual(blocks.map((block) => block.id), ["motor-ingresos-rentas", "motor-ingresos-deducciones", "motor-ingresos-tasa", "motor-ingresos-resultado"]);
  const rents = blocks[0].tables[0] as unknown as { rows: string[][] };
  assert.deepEqual(rents.rows[0], ["Local", "100.00 m²", "$100.00 /m²/mes", "$10,000.00"]);
  const values = Object.fromEntries(blocks.flatMap((block) => block.concepts.map((concept) => [concept.id, concept.value])));
  assert.equal(values["motor-ingresos-rentas-bruta"], "$10,000.00");
  assert.equal(values["motor-ingresos-rentas-deducciones"], "31.00 %");
  assert.equal(values["motor-ingresos-rentas-neta-mensual"], "$6,900.00");
  assert.equal(values["motor-ingresos-rentas-neta-anual"], "$82,800.00");
  assert.equal(values["motor-ingresos-tasa-aplicada"], `${NO_CAPITALIZATION_RATE}: califica los siete criterios de la tabla o captura la tasa`);
  assert.equal(values["motor-ingresos-resultado-valor"], "Califica los siete criterios de la tabla de tasa, o captura la tasa.");
  // Without any rent the rents say so; without anything captured the template stays.
  const noRent = incomeDocumentBlocks({ ...partial, rentableUnits: [{ description: "Local", area: 100, unitRent: null }] }, null, "Captura la renta unitaria, o el mercado de rentas.");
  assert.equal(noRent[0].concepts[0].value, NO_UNIT_RENT);
  assert.deepEqual(incomeDocumentBlocks({ ...partial, rentableUnits: [{ description: "", area: null, unitRent: null }] }, null, "Captura la superficie rentable."), []);
  assert.deepEqual(incomeDocumentBlocks(partial, null), [], "without the reason nothing partial prints, as before");
});

test("the concluded value fills the conclusion and carátula concepts and leaves the appraiser's text", () => {
  const result = concludeValue({ values: { costos: 8580000, mercado: 1528000, ingresos: null }, method: { kind: "single", approach: "costos" } }, DEFAULT_ENGINE_CONFIG);
  const calculation = {
    values: { costos: 8580000, mercado: 1528000, ingresos: null },
    marketSource: "TERRENO_VENTA" as const, method: { kind: "single" as const, approach: "costos" as const },
    justification: null, configured: true, locked: false,
  };
  const concept = (id: string, label: string, value = "") => ({ id, label, value, enabled: true });
  const section: AppSection = {
    id: "conclusiones", label: "XI", title: "CONCLUSIÓN", sourceFile: "", enabled: true, required: false,
    blocks: [{
      id: "conclusiones-block-1", title: "CONCLUSIÓN DEL VALOR", sectionLabel: "", enabled: true, required: false, apartados: [], tables: [], images: [],
      concepts: [
        concept("c1", "Valor por enfoque de costos"), concept("c2", "Valor por enfoque de mercado"), concept("c3", "Valor por enfoque de ingresos"),
        concept("c4", "Valor concluido"), concept("c5", "Valor concluido con letra"), concept("c6", "Observaciones finales", "Texto del perito"),
      ],
    }],
  };
  const filled = withConceptValues(section, conclusionValues(calculation, result));
  assert.deepEqual(filled.blocks[0].concepts.map((item) => item.value), [
    "8580000.00", "1530000.00", "NO APLICA", "8580000.00", "(OCHO MILLONES QUINIENTOS OCHENTA MIL PESOS 00/100 M.N.)", "Texto del perito",
  ]);
  // The amounts print with their format: the approaches as money, the concluded value with "M.N.".
  assert.deepEqual(filled.blocks[0].concepts.slice(0, 4).map((item) => formatConceptValueForDocument(item)), [
    "$8,580,000.00", "$1,530,000.00", "NO APLICA", "$8,580,000.00 M.N.",
  ]);
  assert.deepEqual(filled.blocks[0].concepts.slice(0, 4).map((item) => [item.type, item.valueFormat]), [
    ["currency", "mxn"], ["currency", "mxn"], [undefined, undefined], ["currency", "mxn-mn"],
  ]);
  assert.equal(withConceptValues(filled, conclusionValues(calculation, result)), filled, "sin cambios devuelve la misma sección");
  // A format the appraiser chose stays: only the number changes.
  const chosen = { ...filled, blocks: [{ ...filled.blocks[0], concepts: filled.blocks[0].concepts.map((item) => (item.id === "c4" ? { ...item, valueFormat: "mxn" as const } : item)) }] };
  assert.equal(withConceptValues(chosen, conclusionValues(calculation, result)).blocks[0].concepts[3].valueFormat, "mxn");
  assert.deepEqual(caratulaConclusionValues(result)["valor comercial del bien"], { amount: 8580000, valueFormat: "mxn-mn" });
});
