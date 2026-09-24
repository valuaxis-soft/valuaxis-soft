import assert from "node:assert/strict";
import { test } from "node:test";
import { caratulaConclusionValues, conclusionValues, withConceptValues } from "../src/features/valuations/calculation/conclusion-document";
import { incomeDocumentBlocks } from "../src/features/valuations/calculation/income-document";
import { DEFAULT_DEDUCTIONS, toIncomeEngineInput, type IncomeCalculationDto } from "../src/features/valuations/calculation/income-types";
import { concludeValue } from "../src/features/valuations/engine/conclusion";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeIncomeApproach } from "../src/features/valuations/engine/income";
import type { AppSection } from "../src/features/valuations/model";

const tch: IncomeCalculationDto = {
  rentableUnits: [{ description: "Casa habitación", area: 250, unitRent: null }],
  deductions: DEFAULT_DEDUCTIONS,
  ratingColumns: [1, 3, 1, 2, 2, 0, 4],
  appliedRate: 0.0886,
  rentMarket: { adoptedUnitRent: 30, subjectArea: 250 },
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
    "$8,580,000.00", "$1,530,000.00", "NO APLICA", "$8,580,000.00", "( OCHO MILLONES QUINIENTOS OCHENTA MIL PESOS 00/100 M. N.)", "Texto del perito",
  ]);
  assert.equal(withConceptValues(filled, conclusionValues(calculation, result)), filled, "sin cambios devuelve la misma sección");
  assert.equal(caratulaConclusionValues(result)["valor comercial del bien"], "$8,580,000.00");
});
