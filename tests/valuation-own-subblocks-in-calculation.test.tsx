/**
 * Video 8.14, 09:05 (Álvaro, in «Ingresos»): «no puedo agregar subbloque…
 * está limitado». A block the calculation writes (income, markets, costs)
 * takes subbloques of the appraiser's own, with their concepts and tables;
 * they print, and they stay where he put them when the calculation writes
 * the block again. Invented data only.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { captureDisplayBlocks } from "../src/features/valuations/calculation/capture-display";
import { isOwnApartado, withKeptApartados } from "../src/features/valuations/calculation/generated-block-layout";
import { incomeCaptureBlocks, incomeDocumentBlocks, withIncomeBlocks } from "../src/features/valuations/calculation/income-document";
import { DEFAULT_ANNUITY, DEFAULT_MARKET_RATE, toIncomeEngineInput, type IncomeCalculationDto } from "../src/features/valuations/calculation/income-types";
import { replaceGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import { blockToolbarLocks, blockToolbarState, GENERATED_BLOCK_REASON } from "../src/features/valuations/components/editor/block-toolbar";
import { documentBlockFlowItems } from "../src/features/valuations/components/document-block-renderer";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeIncomeApproach } from "../src/features/valuations/engine/income";
import type { Apartado, AppSection, Block } from "../src/features/valuations/model";

const income: IncomeCalculationDto = {
  method: "tabla",
  annuity: DEFAULT_ANNUITY,
  marketRate: DEFAULT_MARKET_RATE,
  rentableUnits: [{ description: "Superficie rentable", area: null, unitRent: null }],
  deductions: [["Vacíos", 0.1], ["Impuesto predial", 0.04], ["Mantenimiento", 0.06]].map(([concept, rate]) => ({ concept: concept as string, rate: rate as number })),
  ratingColumns: [1, 0, 1, 0, 4, 0, 1],
  appliedRate: null,
  rateFromMarket: null,
  weightedRate: null,
  rounding: null,
  rentMarket: { adoptedUnitRent: 120, concludedMonthlyRent: 24000, subjectArea: 200, comparables: [], homologation: null },
  configured: true,
  locked: false,
};

const resultOf = (calculation: IncomeCalculationDto) => {
  const input = toIncomeEngineInput(calculation);
  assert.ok(input.ok, input.ok ? "" : input.reason);
  return computeIncomeApproach(input.input, DEFAULT_ENGINE_CONFIG);
};

const section = (blocks: Block[]): AppSection => ({ id: "ingresos", label: "XIII", title: "ENF. INGRESOS", sourceFile: "", enabled: true, required: false, blocks });

/** A subbloque as «Subbloque» adds it, with a note and a table of his own. */
const own: Apartado = {
  id: "a1b2c3d4-nota-propia",
  title: "NOTAS DEL VALUADOR",
  enabled: true,
  concepts: [{ id: "c-nota", label: "Nota", value: "Renta verificada con el administrador del inmueble." }],
  tables: [{ id: "t-propia", title: "Tabla propia", columns: ["Concepto", "Monto"], rows: [["Cuota de mantenimiento", "$1,500.00"]], enabled: true }],
  images: [],
};

test("«Subbloque» is enabled in a block the calculation writes, and its reason no longer points to the calculation panel", () => {
  const state = blockToolbarState({ kind: "generated" });
  assert.equal(state.subblock.enabled, true);
  assert.equal(blockToolbarLocks(state).subblock, undefined);
  assert.ok(!GENERATED_BLOCK_REASON.includes("panel de cálculo"));
  // Read only, it is disabled as everything else.
  assert.equal(blockToolbarState({ kind: "generated", readOnly: true }).subblock.enabled, false);
});

test("a subbloque of his own in the income block stays, in its place and whole, when the calculation writes the block again", () => {
  const written = withIncomeBlocks(section([]), incomeDocumentBlocks(income, resultOf(income)));
  const block = written.blocks[0];
  assert.ok(block.apartados.length >= 2);
  assert.ok(!block.apartados.some(isOwnApartado), "the calculation's subbloques are not his");
  // He put it after the first subbloque of the calculation.
  const placed = section([{ ...block, apartados: [block.apartados[0], own, ...block.apartados.slice(1)] }]);
  // Another rent: the calculation writes the block again.
  const changed = { ...income, rentMarket: { ...income.rentMarket!, concludedMonthlyRent: 26000 } };
  const again = replaceGeneratedBlocks(placed, (item) => item.id.startsWith("motor-ingresos"), incomeDocumentBlocks(changed, resultOf(changed)));
  const ids = again.blocks[0].apartados.map((apartado) => apartado.id);
  assert.equal(ids[1], own.id);
  assert.deepEqual(again.blocks[0].apartados[1], own);
  assert.equal(ids.length, block.apartados.length + 1);
  // Written again with the same figures, nothing changes.
  assert.equal(replaceGeneratedBlocks(again, (item) => item.id.startsWith("motor-ingresos"), incomeDocumentBlocks(changed, resultOf(changed))), again);
  // Deleted, it is gone: the calculation does not bring it back.
  const deleted = section([{ ...again.blocks[0], apartados: again.blocks[0].apartados.filter((apartado) => apartado.id !== own.id) }]);
  const rewritten = replaceGeneratedBlocks(deleted, (item) => item.id.startsWith("motor-ingresos"), incomeDocumentBlocks(income, resultOf(income)));
  assert.ok(!rewritten.blocks[0].apartados.some((apartado) => apartado.id === own.id));
});

test("the editor shows his subbloque where he put it while the calculation captures in the block's tables", () => {
  const written = withIncomeBlocks(section([]), incomeDocumentBlocks(income, resultOf(income)));
  const block = written.blocks[0];
  const stored = { ...block, apartados: [own, ...block.apartados] };
  const shown = captureDisplayBlocks([stored], { blocks: incomeCaptureBlocks(income, null), placeholderIds: [] });
  assert.equal(shown[0].block.apartados[0].id, own.id);
});

test("his subbloque prints in the dictamen with its concepts and table, numbered as the block's other subbloques", () => {
  const written = withIncomeBlocks(section([]), incomeDocumentBlocks(income, resultOf(income)));
  const block = { ...written.blocks[0], sectionLabel: "XIII", apartados: [...written.blocks[0].apartados, own] };
  const html = renderToStaticMarkup(createElement("div", null, documentBlockFlowItems(block).map((item) => createElement("div", { key: item.id }, item.node))));
  assert.ok(html.includes("NOTAS DEL VALUADOR"));
  assert.ok(html.includes("Renta verificada con el administrador del inmueble."));
  assert.ok(html.includes("Cuota de mantenimiento"));
  assert.ok(html.includes(`XIII.${block.apartados.length}`), "numbered after the calculation's subbloques");
});

test("kept subbloques go after the one before them, else before the one after them, else at the end", () => {
  const a = (id: string): Apartado => ({ id, title: id, enabled: true, concepts: [], tables: [], images: [] });
  const keep = (apartado: Apartado) => isOwnApartado(apartado);
  assert.deepEqual(withKeptApartados([a("motor-1"), a("motor-2")], [a("p0"), a("motor-1"), a("p1"), a("p2"), a("motor-2"), a("p3")], keep).map((item) => item.id),
    ["p0", "motor-1", "p1", "p2", "motor-2", "p3"]);
  // The one before is gone: it goes before the one after it.
  assert.deepEqual(withKeptApartados([a("motor-2")], [a("motor-1"), a("p1"), a("motor-2")], keep).map((item) => item.id), ["p1", "motor-2"]);
  // Neither is there any more: at the end.
  assert.deepEqual(withKeptApartados([a("motor-3")], [a("motor-1"), a("p1")], keep).map((item) => item.id), ["motor-3", "p1"]);
});
