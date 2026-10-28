import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FACTOR_ANNEX_PREFIX,
  FACTOR_ANNEX_TEMPLATE_BLOCK_IDS,
  IN_EACH_APPROACH,
  factorJustificationBlocks,
} from "../src/features/valuations/calculation/factor-justification-document";
import { replaceGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import { defaultMarketSettings, type ComparableDto, type ComparableFactorDto, type MarketCalculationDto } from "../src/features/valuations/calculation/market-types";
import { homologacionSection } from "../src/features/valuations/sections/homologacion";
import { ensureTableV2 } from "../src/features/valuations/services/table";
import type { AppSection, TableContent } from "../src/features/valuations/model";

const factor = (type: ComparableFactorDto["type"], value: number, justification: string | null = null): ComparableFactorDto =>
  ({ type, value, subjectRating: null, comparableRating: null, justification });

function comparable(reference: number, factors: ComparableFactorDto[], factorJustification: string | null = null): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Comparable ${reference}`, area: 100, price: 1_000_000, landUse: null, shape: null, zone: null,
    frontage: null, depth: null, topography: null, services: null, notes: null, sourceName: null, contactName: null, contactPhone: null,
    url: null, offerDate: null, photos: [], factors, factorJustification,
  };
}

function market(type: MarketCalculationDto["settings"]["comparableType"], comparables: ComparableDto[], settings: Partial<MarketCalculationDto["settings"]> = {}): MarketCalculationDto {
  const base = defaultMarketSettings(type);
  return {
    settings: { ...base, factorSlots: [{ type: "NEGOCIACION", label: "Negociación" }, { type: "ZONA", label: "Zona" }], ...settings },
    comparables,
    locked: false,
    configured: true,
  };
}

const rows = (blocks: ReturnType<typeof factorJustificationBlocks>) => {
  const table = ensureTableV2(blocks[0].apartados[0].tables[0] as TableContent);
  return table.rows.map((row) => table.columns.map((column) => {
    const cell = row.cells[column.id];
    return cell?.kind === "value" ? cell.value : "";
  }));
};

test("the annex sums up each factor: approach, range of values and the justifications, once each with their comparables", () => {
  const land = market("TERRENO_VENTA", [
    comparable(1, [factor("NEGOCIACION", 0.95), factor("ZONA", 1.05, "Zona superior")]),
    comparable(2, [factor("NEGOCIACION", 0.9), factor("ZONA", 1.05, "Zona superior")]),
    comparable(3, [factor("NEGOCIACION", 0.95), factor("ZONA", 0.95, "Zona inferior")], "Lote en esquina"),
  ], { showFactorJustification: false, justification: "Factores del catálogo del despacho." });
  const blocks = factorJustificationBlocks([land]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].id, FACTOR_ANNEX_PREFIX);
  assert.deepEqual(rows(blocks), [
    ["Negociación", "Terrenos en venta", "0.90 – 0.95", "—"],
    ["Zona", "Terrenos en venta", "0.95 – 1.05", "Comp. 1, 2: Zona superior Comp. 3: Zona inferior"],
  ]);
  const notes = ensureTableV2(blocks[0].apartados[0].tables[0] as TableContent).schema?.notes ?? [];
  assert.deepEqual(notes.map((note) => [note.label, note.text]), [["Terrenos en venta:", "Factores del catálogo del despacho. Comp. 3: Lote en esquina"]]);
});

test("a market whose justification prints in its approach is not repeated: the annex says so", () => {
  const shown = market("TERRENO_VENTA", [comparable(1, [factor("ZONA", 1.05, "Zona superior")])]);
  const blocks = factorJustificationBlocks([shown]);
  assert.equal(blocks[0].apartados[0].tables.length, 0);
  assert.deepEqual(blocks[0].apartados[0].concepts.map((concept) => concept.value), [IN_EACH_APPROACH]);

  const hidden = market("INMUEBLE_VENTA", [comparable(1, [factor("ZONA", 1.1, "Mejor ubicación")])], { showFactorJustification: false });
  const mixed = factorJustificationBlocks([hidden, shown]);
  assert.deepEqual(rows(mixed).map((row) => row[1]), ["Inmuebles en venta"], "only the market not shown in its approach");
  const notes = ensureTableV2(mixed[0].apartados[0].tables[0] as TableContent).schema?.notes ?? [];
  assert.equal(notes[0].text, "Las justificaciones de terrenos en venta se presentan en su enfoque.");
});

test("no comparables, no annex; the generated block takes the place of the template table and goes away with it", () => {
  assert.deepEqual(factorJustificationBlocks([market("TERRENO_VENTA", [])]), []);
  const section = { ...homologacionSection, label: "XII", enabled: true } as unknown as AppSection;
  assert.deepEqual(section.blocks.map((block) => block.id), FACTOR_ANNEX_TEMPLATE_BLOCK_IDS);
  const blocks = factorJustificationBlocks([market("TERRENO_VENTA", [comparable(1, [factor("ZONA", 1)])], { showFactorJustification: false })]);
  const written = replaceGeneratedBlocks(section, (block) => block.id.startsWith(FACTOR_ANNEX_PREFIX), blocks, { placeholderIds: FACTOR_ANNEX_TEMPLATE_BLOCK_IDS });
  assert.deepEqual(written.blocks.map((block) => block.id), [FACTOR_ANNEX_PREFIX]);
  assert.equal(replaceGeneratedBlocks(written, (block) => block.id.startsWith(FACTOR_ANNEX_PREFIX), blocks, { placeholderIds: FACTOR_ANNEX_TEMPLATE_BLOCK_IDS }), written, "the same content leaves the section alone");
});
