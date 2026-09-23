import assert from "node:assert/strict";
import { test } from "node:test";
import { marketDocumentBlocks, marketPhotoBlocks, withGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import { defaultMarketSettings, toMarketEngineInput, type ComparableDto, type MarketCalculationDto } from "../src/features/valuations/calculation/market-types";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import { computeMarketApproach } from "../src/features/valuations/engine/market";
import type { AppSection, Block, TableContent } from "../src/features/valuations/model";
import { ensureTableV2 } from "../src/features/valuations/services/table";

function comparable(reference: number, area: number, price: number): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Comparable ${reference}`, area, price,
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null,
    sourceName: "Altos 360", contactName: null, contactPhone: "348 249 3129", url: null, offerDate: null,
    photos: reference === 1 ? [{ id: "foto-1", title: "Fachada", url: "/organizaciones/x/foto-1.jpg" }] : [],
    factors: [{ type: "NEGOCIACION", value: 0.95, subjectRating: null, comparableRating: null, justification: null }],
  };
}

const calculation: MarketCalculationDto = {
  settings: { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 169.78, surfacePower: 6, adoptedUnitValue: 9000 },
  comparables: [comparable(1, 140, 1260000), comparable(2, 192.5, 2032590), comparable(3, 196.62, 2261130), comparable(4, 140, 1330000)],
  locked: false,
};

function result() {
  const input = toMarketEngineInput(calculation);
  assert.ok(input.ok);
  return computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG);
}

const templateBlock = (id: string): Block => ({ id, title: id, sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images: [] });
const section = (blocks: Block[]): AppSection => ({ id: "mercadoVenta", label: "VII", title: "MERCADO", sourceFile: "", enabled: true, required: false, blocks });

test("the market blocks show the comparables, the homologation and the summary with the value", () => {
  const blocks = marketDocumentBlocks(calculation, result());
  assert.deepEqual(blocks.map((block) => block.id), [
    "motor-mercado-terreno_venta-comparables",
    "motor-mercado-terreno_venta-homologacion",
    "motor-mercado-terreno_venta-resumen",
  ]);
  const homologation = blocks[1].tables[0] as TableContent & { columns: string[]; rows: string[][] };
  assert.deepEqual(homologation.columns, ["Ref.", "Valor unitario", "Negociación", "Ubicación", "Superficie", "Zona", "Frente", "Uso de suelo", "Factor resultante", "Valor homologado"]);
  assert.equal(homologation.rows.length, 4);
  const value = blocks[2].concepts.find((concept) => concept.label === "Valor comparativo de mercado");
  assert.equal(value?.value, "$1,528,000.00");
});

test("the generated blocks replace the template placeholders, only once there is content", () => {
  const placeholders = ["mercadoVenta-block-1", "mercadoVenta-block-2"];
  const untouched = section([templateBlock("mercadoVenta-block-1"), templateBlock("mercadoVenta-block-2"), templateBlock("nota-del-perito")]);
  assert.equal(withGeneratedBlocks(untouched, "TERRENO_VENTA", [], { placeholderIds: placeholders }), untouched, "sin comparables no cambia");

  const blocks = marketDocumentBlocks(calculation, result());
  const updated = withGeneratedBlocks(untouched, "TERRENO_VENTA", blocks, { placeholderIds: placeholders });
  assert.deepEqual(updated.blocks.map((block) => block.id), [...blocks.map((block) => block.id), "nota-del-perito"]);

  // Saved documents return block ids in lower case.
  const saved = section([templateBlock("mercadoventa-block-1"), templateBlock("nota-del-perito")]);
  const updatedSaved = withGeneratedBlocks(saved, "TERRENO_VENTA", blocks, { placeholderIds: ["mercadoVenta-block-1"] });
  assert.deepEqual(updatedSaved.blocks.map((block) => block.id), [...blocks.map((block) => block.id), "nota-del-perito"]);
});

test("a reloaded document with the same results is left as is, so opening a valuation does not mark it modified", () => {
  const blocks = marketDocumentBlocks(calculation, result());
  // Saving and reloading turns tables into TableV2 and renumbers labels.
  const reloaded = section(blocks.map((block, index) => ({
    ...block,
    sectionLabel: `VII.${index + 1}`,
    tables: block.tables.map((table) => ensureTableV2(table) as unknown as TableContent),
  })));
  assert.equal(withGeneratedBlocks(reloaded, "TERRENO_VENTA", marketDocumentBlocks(calculation, result())), reloaded);

  const changed = { ...calculation, settings: { ...calculation.settings, adoptedUnitValue: 9500 } };
  const input = toMarketEngineInput(changed);
  assert.ok(input.ok);
  const next = withGeneratedBlocks(reloaded, "TERRENO_VENTA", marketDocumentBlocks(changed, computeMarketApproach(input.input, DEFAULT_ENGINE_CONFIG)));
  assert.notEqual(next, reloaded, "otro valor adoptado cambia el dictamen");
});

test("photos go to the annex after the appraiser's own blocks", () => {
  const annex = section([templateBlock("croquis")]);
  const photos = marketPhotoBlocks(calculation);
  assert.equal(photos[0].images.length, 1);
  const updated = withGeneratedBlocks(annex, "TERRENO_VENTA", photos, { kind: "fotos", position: "end" });
  assert.deepEqual(updated.blocks.map((block) => block.id), ["croquis", "motor-mercado-terreno_venta-fotos"]);
  // The photo block and the calculation blocks of the same type do not replace each other.
  const withCalculation = withGeneratedBlocks(updated, "TERRENO_VENTA", marketDocumentBlocks(calculation, result()));
  assert.ok(withCalculation.blocks.some((block) => block.id === "motor-mercado-terreno_venta-fotos"));
});

test("the engine input skips incomplete comparables and explains what is missing", () => {
  assert.deepEqual(toMarketEngineInput({ ...calculation, settings: { ...calculation.settings, subjectArea: null } }), {
    ok: false,
    reason: "Captura la superficie del sujeto.",
  });
  const withDraft = { ...calculation, comparables: [...calculation.comparables, { ...comparable(5, 150, 0), price: null }] };
  const input = toMarketEngineInput(withDraft);
  assert.ok(input.ok);
  assert.equal(input.input.comparables.length, 4);
});
