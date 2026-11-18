/**
 * V7.3-10 and V7.3-12 (video 7.3, 16 nov 2026): «Buscar comparables» asked
 * for at most 200 m² and its map showed 260 and 300, because the map got no
 * filter; and «Superficie» mixed the land and the built area. The search and
 * its map now take the same filters, the land and the built area apart.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { listComparablePins } from "../../src/features/maps/base-map/base-map.service";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { createComparable } from "../../src/features/valuations/calculation/market.service";
import type { ComparableType } from "../../src/features/valuations/calculation/market-types";
import { parseComparableListParams } from "../../src/features/valuations/comparable-base/comparable-list-params";
import { searchMapQuery, type SearchMapFilters } from "../../src/features/valuations/comparable-search/map-query";
import { parseComparableSearchQuery } from "../../src/features/valuations/comparable-search/schemas";
import { ownBaseSource } from "../../src/features/valuations/comparable-search/sources/own-base.source";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

const PERLA: [number, number] = [20.63442, -103.40239];
const METER = 1 / 111_195;

function comparable(location: string, area: number, price: number, extra: Partial<ComparableInputPayload> = {}): ComparableInputPayload {
  return {
    location, area, price, factors: [],
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
    notes: null, sourceName: "Portal inventado", contactName: null, contactPhone: null, url: null, offerDate: null,
    ...extra,
  };
}

/** The query string of the dialog's map, read as the map's API reads it. */
function mapParams(type: ComparableType, filters: SearchMapFilters) {
  const query = new URLSearchParams(searchMapQuery(type, filters));
  return parseComparableListParams(Object.fromEntries([...new Set(query.keys())].map((key) => {
    const values = query.getAll(key);
    return [key, values.length > 1 ? values : values[0]];
  })));
}

test("the search and its map show the same comparables: land up to 200 m² leaves out 260 and 408", async () => {
  const fixture = await createValuationFixture();
  const { publicId, user, organizationId } = fixture;
  const add = (type: ComparableType, payload: ComparableInputPayload, north: number) =>
    createComparable(publicId, user, type, { ...payload, latitude: PERLA[0] + north * METER, longitude: PERLA[1] });
  await add("TERRENO_VENTA", comparable("Terreno inventado de 150", 150, 1_200_000), 100);
  await add("TERRENO_VENTA", comparable("Terreno inventado de 260", 260, 2_000_000), 200);
  await add("TERRENO_VENTA", comparable("Terreno inventado de 408", 408, 3_100_000), 300);
  // A house with 180 m² of land and 300 m² built: «Superficie» alone would have counted its 300.
  await add("INMUEBLE_VENTA", comparable("Casa inventada", 300, 4_000_000, { landArea: 180, bedrooms: 3, bathrooms: 2 }), 400);

  const context = { organizationId, valuationId: -1, signal: new AbortController().signal };
  const search = async (params: Record<string, string>) => {
    const parsed = parseComparableSearchQuery(new URLSearchParams(params));
    assert.ok(parsed.ok, JSON.stringify(parsed));
    return (await ownBaseSource.search(parsed.query, context)).map((result) => result.comparable.location).sort();
  };
  const pins = async (type: ComparableType, filters: SearchMapFilters) =>
    (await listComparablePins(organizationId, mapParams(type, filters), { withThumbnails: false })).pins.map((pin) => pin.location).sort();

  assert.deepEqual(await search({ tipo: "TERRENO_VENTA", terrenoMax: "200" }), ["Terreno inventado de 150"]);
  assert.deepEqual(await pins("TERRENO_VENTA", { text: "", priceMin: null, priceMax: null, landAreaMax: 200 }), ["Terreno inventado de 150"]);

  // The built area apart from the land: the house has 180 m² of land and 300 built.
  assert.deepEqual(await search({ tipo: "INMUEBLE_VENTA", terrenoMax: "200" }), ["Casa inventada"]);
  assert.deepEqual(await search({ tipo: "INMUEBLE_VENTA", construidaMax: "200" }), []);
  assert.deepEqual(await search({ tipo: "INMUEBLE_VENTA", construidaMin: "250", recamaras: "3" }), ["Casa inventada"]);
  assert.deepEqual(await pins("INMUEBLE_VENTA", { text: "", priceMin: null, priceMax: null, builtAreaMin: 250, bedrooms: 3 }), ["Casa inventada"]);

  // Before a search the map shows the market's type only, as the list would.
  assert.deepEqual(await pins("TERRENO_VENTA", { text: "", priceMin: null, priceMax: null }), ["Terreno inventado de 150", "Terreno inventado de 260", "Terreno inventado de 408"]);
});
