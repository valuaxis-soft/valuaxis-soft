/**
 * FAL-01/02 of the audit of week 8: the surface factor follows the
 * appraiser's rule (answers of 30 Sep 2026) and reads the same in the editor,
 * the dictamen and the memoria, in his words: «superficie del sujeto»,
 * «superficie del lote tipo» and «superficie del comparable», never
 * «superficie base».
 */
import assert from "node:assert/strict";
import test from "node:test";
import { factorJustificationBlocks } from "../src/features/valuations/calculation/factor-justification-document";
import { defaultMarketSettings, marketSurfaceFormula, type ComparableDto, type MarketCalculationDto } from "../src/features/valuations/calculation/market-types";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { SURFACE_SLOT } from "../src/features/valuations/engine/factors";
import { homologate } from "../src/features/valuations/engine/market";
import { Trace } from "../src/features/valuations/engine/trace";
import { ensureTableV2 } from "../src/features/valuations/services/table";
import type { TableContent } from "../src/features/valuations/model";

const DIRECT = "Fsup = (superficie del sujeto / superficie del comparable)^(1/n)";
const INDIRECT = "Fsup = (superficie del lote tipo / superficie del comparable)^(1/n)";

function homologated(baseArea?: number) {
  const trace = new Trace();
  const result = homologate({
    subjectArea: 205,
    ...(baseArea === undefined ? {} : { baseArea }),
    surfacePower: 3,
    comparables: [{ id: "1", price: 6_300_000, area: 260.77, factors: [SURFACE_SLOT] }],
  }, DEFAULT_ENGINE_CONFIG.surfaceOrientation.market, trace, "mercado");
  return { factor: result.comparables[0].surfaceFactor, step: trace.find("mercado.comparables.1.factorSuperficie")! };
}

test("direct: (sujeto / comparable)^(1/n), as the appraiser's rule; a comparable larger than the subject takes a factor below 1", () => {
  const { factor, step } = homologated();
  // 205 m² of the subject and 260.77 m² of comparable C1 of PTTCH10-0020: (205 / 260.77)^(1/3).
  assert.ok(Math.abs(factor - 0.922923) < 1e-6, String(factor));
  assert.equal(step.formula, DIRECT);
  assert.deepEqual(step.inputs, { superficieDelSujeto: 205, superficieDelComparable: 260.77, n: 3 });
});

test("indirect: (lote tipo / comparable)^(1/n)", () => {
  const { factor, step } = homologated(300);
  assert.ok(Math.abs(factor - (300 / 260.77) ** (1 / 3)) < 1e-12);
  assert.equal(step.formula, INDIRECT);
  assert.deepEqual(step.inputs, { superficieDelLoteTipo: 300, superficieDelComparable: 260.77, n: 3 });
});

test("the editor, the annex of the dictamen and the memoria write the same formula", () => {
  const direct = defaultMarketSettings("TERRENO_VENTA");
  const indirect = { ...direct, homologationBasis: "LOTE_TIPO" as const, baseArea: 300 };
  assert.equal(marketSurfaceFormula(direct), DIRECT);
  assert.equal(marketSurfaceFormula(indirect), INDIRECT);

  const comparable = { id: "c-1", reference: 1, location: "C1", area: 260.77, price: 6_300_000, factors: [], photos: [] } as unknown as ComparableDto;
  const market: MarketCalculationDto = { settings: { ...direct, showFactorJustification: false }, comparables: [comparable], locked: false, configured: true };
  const table = ensureTableV2(factorJustificationBlocks([market])[0].apartados[0].tables[0] as TableContent);
  const texts = table.rows.flatMap((row) => Object.values(row.cells).map((cell) => (cell.kind === "value" ? cell.value : "")));
  assert.ok(texts.includes(`Calculado: ${DIRECT}.`), texts.join(" | "));
  assert.ok(!texts.some((text) => /superficie base|de la base/.test(text)));
});
