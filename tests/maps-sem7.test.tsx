/**
 * The maps observations of the appraiser's videos 7.1 to 7.3 (16 and 17 nov
 * 2026): the map of «Buscar comparables» with the search's filters, the land
 * and the built area apart, the radius list that obeys the layers, the
 * legend of the map of comparables, the card's map under a dialog and the
 * small map that fills the coordinates of a comparable. Made-up data only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { layerVisibility, visiblePins } from "../src/features/maps/base-map/layers";
import { radiusSummary } from "../src/features/maps/base-map/radius";
import { COMPARABLE_PIN_COLORS, SUBJECT_PIN_COLOR, comparablePins, croquisLegend, legendOverlaySvg } from "../src/features/maps/croquis";
import { parseComparableListParams } from "../src/features/valuations/comparable-base/comparable-list-params";
import { ComparableLocationPicker, pickerPoint, roundCoordinate } from "../src/features/valuations/comparable-base/components/comparable-location-picker";
import { searchMapQuery } from "../src/features/valuations/comparable-search/map-query";
import { parseComparableSearchQuery } from "../src/features/valuations/comparable-search/schemas";

const SUBJECT: [number, number] = [20.63442, -103.40239];

test("V7.3-10: the map of «Buscar comparables» gets the search's filters, not an empty query", () => {
  // Superficie de terreno hasta 200 m² in the land market: the map showed 260 and 300 before.
  const query = new URLSearchParams(searchMapQuery("TERRENO_VENTA", {
    text: "", priceMin: null, priceMax: 3_000_000, landAreaMax: 200, municipality: "Zapopan", consultedFrom: "2026-01-01", streetType: "AVENIDA",
  }));
  const params = parseComparableListParams(Object.fromEntries([...query.keys()].map((key) => [key, query.getAll(key).length > 1 ? query.getAll(key) : query.get(key) ?? undefined])));
  assert.deepEqual(params.types, ["TERRENO_VENTA"]);
  assert.equal(params.landAreaMax, 200);
  assert.equal(params.builtAreaMax, null);
  assert.equal(params.priceMax, 3_000_000);
  assert.equal(params.municipality, "Zapopan");
  assert.equal(params.consultedFrom, "2026-01-01");
  assert.equal(params.streetType, "AVENIDA");
  // Before a search, the market's own types; «Cualquiera» widens them.
  assert.equal(searchMapQuery("INMUEBLE_VENTA", null), "tipo=INMUEBLE_VENTA");
  assert.deepEqual(new URLSearchParams(searchMapQuery("TERRENO_VENTA", { text: "", priceMin: null, priceMax: null, kind: "TODOS" })).getAll("tipo").sort(), ["INMUEBLE_VENTA", "TERRENO_VENTA"]);
  // An old single «Superficie» goes as the area of the market's own kind.
  assert.equal(new URLSearchParams(searchMapQuery("INMUEBLE_VENTA", { text: "", priceMin: null, priceMax: null, areaMax: 150 })).get("construidaMax"), "150");
});

test("V7.3-12: the search takes the land and the built area apart, with the other filters of /comparables", () => {
  const parsed = parseComparableSearchQuery(new URLSearchParams({
    tipo: "INMUEBLE_VENTA", terrenoMin: "100", terrenoMax: "200", construidaMax: "180", recamaras: "3", banos: "2.5", uso: "Habitacional", construccion: "Moderna",
  }));
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.query.filters, {
    landAreaMin: 100, landAreaMax: 200, builtAreaMax: 180, bedrooms: 3, bathrooms: 2.5, landUse: "Habitacional", constructionType: "Moderna",
  });
  assert.equal(parsed.query.areaMax, null, "«Superficie» alone no longer mixes land and construction");
  const wrong = parseComparableSearchQuery(new URLSearchParams({ tipo: "TERRENO_VENTA", terrenoMin: "300", terrenoMax: "200" }));
  assert.deepEqual(wrong, { ok: false, error: "La superficie de terreno máxima debe ser mayor o igual que la mínima." });
});

test("V7.3-15: the radius list obeys the layers turned off, and says «1 comparable»", () => {
  const hits = [{ type: "INMUEBLE_VENTA" as const, id: "a" }, { type: "TERRENO_VENTA" as const, id: "b" }];
  const shown = visiblePins(hits, layerVisibility(["TERRENO_VENTA"]));
  assert.deepEqual(shown.map((hit) => hit.id), ["b"]);
  assert.equal(radiusSummary(shown.length, 500, { hiddenByLayers: hits.length - shown.length }), "1 comparable dentro de 500 m (1 más en capas apagadas)");
  assert.equal(radiusSummary(12, 2500), "12 comparables dentro de 2.5 km");
  assert.equal(radiusSummary(200, 10_000, { capped: true }), "200+ comparables dentro de 10 km");
});

test("V7.3-09: the map of comparables carries its legend, with only the types it shows", () => {
  const pins = comparablePins([
    { type: "TERRENO_VENTA", comparable: { id: "1", reference: 1, latitude: SUBJECT[0] + 0.002, longitude: SUBJECT[1], location: "Terreno inventado" } },
    { type: "INMUEBLE_VENTA", comparable: { id: "2", reference: 1, latitude: SUBJECT[0], longitude: SUBJECT[1] + 0.002, location: "Casa inventada" } },
    // Far outside the frame: its type is not in the legend.
    { type: "INMUEBLE_RENTA", comparable: { id: "3", reference: 1, latitude: SUBJECT[0] + 1, longitude: SUBJECT[1], location: "Lejos" } },
  ]);
  const legend = croquisLegend(SUBJECT, 15, pins);
  assert.deepEqual(legend.map((entry) => [entry.label, entry.color]), [
    ["Inmueble valuado", SUBJECT_PIN_COLOR],
    // FAL-10: each market with the numbers the image shows, as its tables print them.
    ["Terrenos en venta: C-1", COMPARABLE_PIN_COLORS.TERRENO_VENTA],
    ["Inmuebles en venta: C-1", COMPARABLE_PIN_COLORS.INMUEBLE_VENTA],
  ]);
  assert.deepEqual(croquisLegend(SUBJECT, 21, pins), [], "no comparable in the frame, no legend");
  const svg = legendOverlaySvg(legend, "top-right");
  assert.match(svg, /Simbología/);
  assert.match(svg, /Terrenos en venta: C-1/);
  assert.doesNotMatch(svg, /en renta/);
  // The legend goes in the corner it is given (legendCorner picks it).
  const right = Number(/<rect x="([\d.]+)"/.exec(svg)![1]);
  const left = Number(/<rect x="([\d.]+)"/.exec(legendOverlaySvg(legend, "top-left"))![1]);
  assert.ok(left < right);
});

test("V7.3-18: the card's Leaflet map is isolated, so it no longer draws over the «Reubicar» dialog", () => {
  const source = readFileSync("src/features/valuations/comparable-base/components/comparable-location-leaflet.tsx", "utf8");
  // The box that holds the map (and the wheel hint over it) is the isolated one.
  assert.match(source, /className=\{cn\("relative isolate overflow-hidden", className\)\}/);
});

test("V7.2-06: the comparable's capture has a small map whose pin fills the latitude and longitude", () => {
  assert.deepEqual(pickerPoint(20.7092, -102.3467), { latitude: 20.7092, longitude: -102.3467 });
  assert.equal(pickerPoint(20.7092, null), null);
  assert.equal(roundCoordinate(20.709212345678), 20.709212);
  const empty = renderToStaticMarkup(<ComparableLocationPicker latitude={null} longitude={null} address="" onChange={() => undefined} />);
  assert.match(empty, /Haz clic en el mapa para poner el pin: llena la latitud y la longitud/);
  assert.match(empty, /Buscar la dirección/);
  const placed = renderToStaticMarkup(<ComparableLocationPicker latitude={20.7092} longitude={-102.3467} address="Calle Inventada 1" onChange={() => undefined} />);
  assert.match(placed, /Arrastra el pin/);
  assert.match(placed, /20.7092, -102.3467/);
  // The capture form of the valuation shows it, next to the coordinates.
  assert.match(readFileSync("src/features/valuations/components/calculation/comparable-dialog.tsx", "utf8"), /<ComparableLocationPicker/);
});
