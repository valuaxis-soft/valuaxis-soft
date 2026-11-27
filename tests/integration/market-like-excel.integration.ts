/**
 * The market as the appraiser's Excel (videos 8.9 and 8.10): the names of the
 * card's data, the data linked as columns and the statistics of his own are
 * kept with the market's settings (JConfiguracion, no migration), a client
 * that does not send them leaves them as stored, and a capture saved with
 * «Homologar» off homologates with its factors. The comparables are invented.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { ComparableInputPayload, MarketSettingsPayload } from "../../src/features/valuations/calculation/market-schemas";
import { marketSettingsSchema } from "../../src/features/valuations/calculation/market-schemas";
import { createComparable, getMarketCalculation, saveMarketSettings } from "../../src/features/valuations/calculation/market.service";
import { marketDocumentBlocks, marketTableId } from "../../src/features/valuations/calculation/market-document";
import { cardFieldLabel } from "../../src/features/valuations/calculation/market-table-columns";
import { defaultMarketSettings, marketEngineConfig, toMarketEngineInput } from "../../src/features/valuations/calculation/market-types";
import { computeMarketApproach } from "../../src/features/valuations/engine/market";
import { ensureTableV2 } from "../../src/features/valuations/services/table";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

const comparable = (location: string, price: number): ComparableInputPayload => ({
  location, area: 200, price,
  factors: [{ type: "NEGOCIACION", value: 0.9, subjectRating: null, comparableRating: null, justification: null }],
  landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
  notes: null, sourceName: "Portal inventado", contactName: "Contacto inventado", contactPhone: "33 0000 0000", url: null, offerDate: null,
});

const settings = (patch: Record<string, unknown> = {}) =>
  marketSettingsSchema.parse({ ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 200, ...patch }) as MarketSettingsPayload;

test("the names of the card's data, the linked columns and the own statistics are kept, and print", async () => {
  const fixture = await createValuationFixture();
  await saveMarketSettings(fixture.publicId, fixture.user, settings({
    fieldLabels: { sourceName: "Portal", "spec.frontage": "Frente del bien valuado" },
    linkedColumns: { ofertas: ["url"], caracteristicas: ["blockPosition"] },
    printedStatistics: {
      order: ["mean", "median", "custom:moda"], hidden: ["offerMin"],
      labels: { mean: "Promedio" },
      extra: [{ id: "custom:moda", label: "Moda", kind: "mode" }],
    },
    typicalFrontage: 12,
  }));
  for (const price of [2_000_000, 2_000_000, 2_200_000, 2_400_000]) {
    await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable(`Lote ${price}`, price));
  }
  const market = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.deepEqual(market.settings.fieldLabels, { sourceName: "Portal", "spec.frontage": "Frente del bien valuado" });
  assert.deepEqual(market.settings.linkedColumns, { ofertas: ["url"], caracteristicas: ["blockPosition"] });
  assert.equal(market.settings.printedStatistics?.extra?.[0].kind, "mode");
  assert.equal(cardFieldLabel(market.settings, "sourceName"), "Portal");

  const input = toMarketEngineInput(market);
  assert.ok(input.ok);
  const result = computeMarketApproach(input.input, marketEngineConfig(market.settings, market.precision));
  const blocks = marketDocumentBlocks(market, result);
  const table = (name: "ofertas" | "caracteristicas" | "homologacion") =>
    ensureTableV2(blocks.flatMap((block) => block.apartados.flatMap((apartado) => apartado.tables)).find((item) => item.id === marketTableId("TERRENO_VENTA", name))!);
  assert.deepEqual(table("ofertas").columns.map((column) => column.name).slice(0, 2), ["REF.", "PORTAL"]);
  assert.equal(table("ofertas").columns.at(-1)?.name, "LIGA DEL ANUNCIO");
  assert.equal(table("caracteristicas").columns.at(-1)?.name, "UBICACIÓN EN MANZANA");
  const boxes = table("homologacion").schema?.summaryBoxes ?? [];
  assert.equal(boxes.find((box) => box.id === "zona")?.rows[0].label, "Frente del bien valuado:");
  assert.deepEqual(boxes.find((box) => box.id === "valores")?.rows.map((row) => row.label).slice(0, 2), ["Promedio:", "Valor Mediana Homologado ($/m²):"]);
  assert.equal(boxes.find((box) => box.id === "dispersion")?.rows.find((row) => row.id === "custom:moda")?.value, "$ 9,000.00", "two offers of $10,000/m² homologated alike, with the negotiation of 0.9");

  // A client that does not send them leaves them as stored.
  const { fieldLabels: _labels, linkedColumns: _linked, ...older } = settings({ adoptedUnitValue: 9_500 });
  await saveMarketSettings(fixture.publicId, fixture.user, older as MarketSettingsPayload);
  const again = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.deepEqual(again.settings.fieldLabels, { sourceName: "Portal", "spec.frontage": "Frente del bien valuado" });
  assert.deepEqual(again.settings.linkedColumns, { ofertas: ["url"], caracteristicas: ["blockPosition"] });
});

test("a market saved with «Homologar» off homologates with its factors (video 8.10, 03:25)", async () => {
  const fixture = await createValuationFixture();
  await saveMarketSettings(fixture.publicId, fixture.user, settings({ homologate: false }));
  for (const price of [2_000_000, 2_000_000, 2_200_000, 2_200_000]) {
    await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable(`Lote ${price}`, price));
  }
  const market = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  const input = toMarketEngineInput(market);
  assert.ok(input.ok);
  const result = computeMarketApproach(input.input, marketEngineConfig(market.settings, market.precision));
  // $10,000/m² with a negotiation of 0.9 (and the subject's same surface): $9,000/m².
  assert.equal(Math.round(result.homologation.comparables[0].homologatedUnitValue), 9_000);
});
