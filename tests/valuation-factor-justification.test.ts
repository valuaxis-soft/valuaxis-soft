import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FACTOR_ANNEX_PREFIX,
  FACTOR_ANNEX_TEMPLATE_BLOCK_IDS,
  factorJustificationBlocks,
  marketsInReport,
} from "../src/features/valuations/calculation/factor-justification-document";
import { DEFAULT_MACHINERY_MARKET, emptyOffer } from "../src/features/valuations/calculation/machinery-types";
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

test("the annex sums up each factor of a market: the range of its values and the justifications, once each with their comparables", () => {
  const land = market("TERRENO_VENTA", [
    comparable(1, [factor("NEGOCIACION", 0.95), factor("ZONA", 1.05, "Zona superior")]),
    comparable(2, [factor("NEGOCIACION", 0.9), factor("ZONA", 1.05, "Zona superior")]),
    comparable(3, [factor("NEGOCIACION", 0.95), factor("ZONA", 0.95, "Zona inferior")], "Lote en esquina"),
  ], { showFactorJustification: false, justification: "Factores del catálogo del despacho." });
  const blocks = factorJustificationBlocks([land]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].id, FACTOR_ANNEX_PREFIX);
  assert.equal(blocks[0].apartados[0].title, "Terrenos en venta", "the part of the market, under its title");
  assert.deepEqual(rows(blocks), [
    ["Negociación", "0.90 – 0.95", "—"],
    ["Zona", "0.95 – 1.05", "Comparables 1 y 2: Zona superior Comparable 3: Zona inferior"],
  ]);
  const notes = ensureTableV2(blocks[0].apartados[0].tables[0] as TableContent).schema?.notes ?? [];
  assert.deepEqual(notes.map((note) => [note.heading ?? false, note.label, note.text]), [
    [true, undefined, "Justificación de los factores utilizados"],
    [false, undefined, "Factores del catálogo del despacho."],
    [false, "Comparable 3:", "Lote en esquina"],
  ]);
  assert.ok(notes.every((note) => note.justification && note.fromApproach && note.position === "table"), "in the toned frame of the justification, written in its approach");
});

/* Video 8.14, 35:41: «sepárenme aparte por tipo de enfoque o de cálculo… un resumen de lo que ya escribieron». */
test("V8.14: one part per kind of calculation, in the dictamen's order, each with the summary of what was written there, also when it prints in its approach", () => {
  const houses = market("INMUEBLE_VENTA", [
    comparable(1, [factor("ZONA", 1.1)], "Ubicación superior, sobre avenida."),
    comparable(2, [factor("ZONA", 1.1)], "Conservación regular."),
    comparable(3, [factor("ZONA", 1)], "Ubicación superior, sobre avenida."),
  ]);
  const rents = market("INMUEBLE_RENTA", [comparable(1, [factor("NEGOCIACION", 0.95)], "Casa con alberca.")]);
  const land = market("TERRENO_VENTA", [comparable(1, [factor("NEGOCIACION", 0.95)])], { justification: "Lotes de la misma colonia." });
  const [block] = factorJustificationBlocks([rents, houses, land]);
  assert.deepEqual(block.apartados.map((apartado) => apartado.title), ["Terrenos en venta", "Inmuebles en venta", "Inmuebles en renta"]);
  const written = (index: number) => (ensureTableV2(block.apartados[index].tables[0] as TableContent).schema?.notes ?? [])
    .filter((note) => !note.heading).map((note) => `${note.label ? `${note.label} ` : ""}${note.text}`);
  assert.deepEqual(written(0), ["Lotes de la misma colonia."]);
  assert.deepEqual(written(1), ["Comparables 1 y 3: Ubicación superior, sobre avenida.", "Comparable 2: Conservación regular."]);
  assert.deepEqual(written(2), ["Comparable 1: Casa con alberca."]);
});

test("V8.14: the machinery market has its part too, after the real estate markets: the FEd and its factors, with what was written", () => {
  const offer = (index: number, conservation: number) => ({ ...emptyOffer(index), price: 500_000, age: 5, rating: 8, conservation });
  const [block] = factorJustificationBlocks([], {
    ...DEFAULT_MACHINERY_MARKET,
    offers: [offer(0, 0.9), offer(1, 0.85)],
    justification: "La conservación se calificó en sitio.",
  });
  assert.deepEqual(block.apartados.map((apartado) => apartado.title), ["Maquinaria y equipo"]);
  assert.deepEqual(rows([block]).slice(0, 2).map((row) => row.slice(0, 2)), [["Edad FEd", "—"], ["FCo", "0.85 – 0.90"]]);
  const notes = ensureTableV2(block.apartados[0].tables[0] as TableContent).schema?.notes ?? [];
  assert.deepEqual(notes.map((note) => note.text), ["Justificación de los factores utilizados", "La conservación se calificó en sitio."]);
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

test("a market turned off with «Agregar al informe» leaves the annex and the memoria técnica", () => {
  const markets = [market("TERRENO_VENTA", []), market("INMUEBLE_VENTA", []), market("INMUEBLE_RENTA", []), market("TERRENO_RENTA", [])];
  const types = (excluded: Parameters<typeof marketsInReport>[1]) => marketsInReport(markets, excluded).map((item) => item.settings.comparableType);
  assert.deepEqual(types(new Set()), ["TERRENO_VENTA", "INMUEBLE_VENTA", "INMUEBLE_RENTA", "TERRENO_RENTA"]);
  assert.deepEqual(types(new Set(["mercado-terrenos"])), ["INMUEBLE_VENTA", "INMUEBLE_RENTA", "TERRENO_RENTA"]);
  assert.deepEqual(types(new Set(["mercado-rentas", "costos"])), ["TERRENO_VENTA", "INMUEBLE_VENTA"], "the rent market holds land and buildings for rent");
});
