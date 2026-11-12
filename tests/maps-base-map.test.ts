/**
 * Etapa 3 of the maps: the layers of the base of comparables and the state
 * of their pins, the grid clustering, the radius search (distances, their
 * order and the request's parameters), the hover card, the filters the map
 * shares with the list (the view and "sin ubicar" in the URL) and which
 * pages get Google's sources in the CSP.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { CLUSTER_MAX_ZOOM, clusterPoints, worldPixel, zoomIntoCluster } from "../src/features/maps/base-map/clustering";
import { BASE_MAP_LAYERS, baseMapLayer, countByLayer, layerVisibility, pinStyle, visiblePins } from "../src/features/maps/base-map/layers";
import { comparablePinCardHtml, pinFeatures, pinPriceLine, valuationPinCardHtml } from "../src/features/maps/base-map/pin-card";
import { RADIUS_METERS, clampRadius, distanceMeters, formatDistance, parseRadiusQuery, sortByDistance } from "../src/features/maps/base-map/radius";
import type { ComparablePinDto, ValuationPinDto } from "../src/features/maps/base-map/types";
import { buildComparableListHref, hasAdvancedFilters, parseComparableListParams } from "../src/features/valuations/comparable-base/comparable-list-params";
import { googleMapsPage } from "../src/security/headers/security-headers";

const pin = (overrides: Partial<ComparablePinDto> = {}): ComparablePinDto => ({
  id: "c1", folio: 12, type: "INMUEBLE_VENTA", operationType: "VENTA", location: "Juárez 12, Centro", lat: 20.6344, lon: -103.4024,
  area: 180, landArea: 250, builtArea: 180, price: 3_200_000, bedrooms: 3, bathrooms: 2.5, sourceName: "Inmuebles24", url: "https://ejemplo.test/anuncio",
  thumbnailUrl: null, updatedOn: "2026-10-01", validUntil: "2027-04-01", expired: false,
  ...overrides,
});

test("every comparable type is a layer with its own color; a valid pin is filled, an expired one hollow", () => {
  assert.deepEqual(BASE_MAP_LAYERS.map((layer) => layer.type), ["INMUEBLE_VENTA", "TERRENO_VENTA", "INMUEBLE_RENTA", "TERRENO_RENTA"]);
  assert.equal(new Set(BASE_MAP_LAYERS.map((layer) => layer.color)).size, 4, "four distinct colors");
  assert.equal(baseMapLayer("TERRENO_RENTA").title, "Terrenos en renta");
  const color = baseMapLayer("TERRENO_VENTA").color;
  assert.deepEqual(pinStyle("TERRENO_VENTA", false), { fill: color, stroke: "#ffffff" });
  assert.deepEqual(pinStyle("TERRENO_VENTA", true), { fill: "#ffffff", stroke: color });
});

test("layers toggle like folders: only the pins of the layers on are shown, and each layer counts its pins", () => {
  const pins = [pin(), pin({ id: "c2", type: "TERRENO_VENTA" }), pin({ id: "c3", type: "TERRENO_VENTA", expired: true }), pin({ id: "c4", type: "INMUEBLE_RENTA" })];
  assert.deepEqual(layerVisibility(), { INMUEBLE_VENTA: true, TERRENO_VENTA: true, INMUEBLE_RENTA: true, TERRENO_RENTA: true });
  const onlyLand = layerVisibility(["TERRENO_VENTA"]);
  assert.deepEqual(visiblePins(pins, onlyLand).map((item) => item.id), ["c2", "c3"]);
  assert.deepEqual(visiblePins(pins, layerVisibility([])), []);
  assert.deepEqual(countByLayer(pins), { INMUEBLE_VENTA: 1, TERRENO_VENTA: 2, INMUEBLE_RENTA: 1, TERRENO_RENTA: 0 });
});

test("clustering groups the pins that share a cell at a zoom and leaves them alone when zoomed in", () => {
  const near = [
    { id: "a", lat: 20.6344, lon: -103.4024 },
    { id: "b", lat: 20.6345, lon: -103.4023 },
    { id: "c", lat: 20.6343, lon: -103.4025 },
  ];
  const far = { id: "d", lat: 20.70, lon: -103.30 };
  const atCity = clusterPoints([...near, far], 12);
  assert.equal(atCity.length, 2, "the three neighbors are one cluster, the far pin another");
  const big = atCity.find((cluster) => cluster.items.length === 3)!;
  assert.ok(big, "a cluster of three");
  assert.ok(Math.abs(big.lat - 20.6344) < 1e-6 && Math.abs(big.lon - (-103.4024)) < 1e-6, "centered on the mean of its pins");
  assert.deepEqual(big.items.map((item) => item.id), ["a", "b", "c"], "the order of the input is kept");
  const atStreet = clusterPoints([...near, far], CLUSTER_MAX_ZOOM);
  assert.equal(atStreet.length, 4, "from the maximum zoom on every pin stands alone");
  assert.deepEqual(clusterPoints([], 10), []);
  // At zoom 19 (past the maximum) the clusters are singletons too, in the same order.
  assert.deepEqual(clusterPoints(near, 19).map((cluster) => cluster.items[0].id), ["a", "b", "c"]);
  assert.equal(zoomIntoCluster(12), 14);
  assert.equal(zoomIntoCluster(16.4), CLUSTER_MAX_ZOOM, "never past the maximum");
});

test("the projection is Web Mercator: the equator at Greenwich is the middle of the world, and the north goes up", () => {
  const scale = 256 * 2 ** 3;
  const origin = worldPixel({ lat: 0, lon: 0 }, 3);
  assert.ok(Math.abs(origin.x - scale / 2) < 1e-9 && Math.abs(origin.y - scale / 2) < 1e-9);
  const guadalajara = worldPixel({ lat: 20.67, lon: -103.35 }, 3);
  assert.ok(guadalajara.x < origin.x && guadalajara.y < origin.y);
  // Latitudes past the projection's limit are clamped instead of becoming infinite.
  assert.ok(Number.isFinite(worldPixel({ lat: 90, lon: 0 }, 3).y));
});

test("distances are great-circle meters, the hits sort closest first with the folio breaking ties", () => {
  const perla: [number, number] = [20.63442, -103.40239];
  assert.equal(distanceMeters(perla, perla), 0);
  // One degree of latitude is about 111.2 km.
  const degree = distanceMeters([20, -103], [21, -103]);
  assert.ok(degree > 111_000 && degree < 111_500, `a degree of latitude measures ${degree}`);
  const hundred = distanceMeters(perla, [perla[0] + 100 / 111_195, perla[1]]);
  assert.ok(Math.abs(hundred - 100) < 0.5, `100 m north measure ${hundred}`);
  const sorted = sortByDistance([
    { id: "far", distance: 420, folio: 3 },
    { id: "tie-b", distance: 120, folio: 9 },
    { id: "tie-a", distance: 120, folio: 2 },
    { id: "none", distance: 120, folio: null },
    { id: "near", distance: 15.5, folio: 1 },
  ]);
  assert.deepEqual(sorted.map((hit) => hit.id), ["near", "tie-a", "tie-b", "none", "far"]);
  assert.equal(formatDistance(350.4), "350 m");
  assert.equal(formatDistance(1234), "1.2 km");
});

test("the radius is clamped to the slider's steps and the request needs a point on the globe", () => {
  assert.equal(clampRadius(RADIUS_METERS.default), RADIUS_METERS.default);
  assert.equal(clampRadius(10), RADIUS_METERS.min);
  assert.equal(clampRadius(99_999), RADIUS_METERS.max);
  assert.equal(clampRadius(333), 350, "rounded to the step");
  assert.equal(clampRadius(Number.NaN), RADIUS_METERS.default);
  const query = parseRadiusQuery(new URLSearchParams("lat=20.6344&lon=-103.4024&radio=800"));
  assert.deepEqual(query, { center: [20.6344, -103.4024], radius: 800 });
  assert.deepEqual(parseRadiusQuery(new URLSearchParams("lat=20.6344")), { error: "Indica el punto alrededor del cual buscar." });
  assert.deepEqual(parseRadiusQuery(new URLSearchParams("lat=95&lon=0")), { error: "El punto no está en el mapa." });
  assert.deepEqual(parseRadiusQuery(new URLSearchParams("lat=abc&lon=1")), { error: "Indica el punto alrededor del cual buscar." });
  const defaulted = parseRadiusQuery(new URLSearchParams("lat=1&lon=1"));
  assert.ok("radius" in defaulted && defaulted.radius === RADIUS_METERS.default);
});

test("the hover card shows photo, type, value, surface and validity, with the texts escaped", () => {
  const html = comparablePinCardHtml(pin({ location: "Calle <Perla> & \"Ópalo\"", thumbnailUrl: "https://cdn.test/foto.jpg?x=1&y=2" }));
  assert.match(html, /C-00012 · Inmuebles en venta/);
  assert.match(html, /\$3,200,000 · \$17,778\/m²/);
  assert.match(html, /180 m² · 3 rec · 2\.5 baños · terreno 250 m²/);
  assert.match(html, /Vigente hasta/);
  assert.match(html, /Inmuebles24/);
  assert.ok(html.includes("Calle &lt;Perla&gt; &amp; &quot;Ópalo&quot;"), "the location is escaped");
  assert.ok(html.includes('src="https://cdn.test/foto.jpg?x=1&amp;y=2"'), "the photo's address is escaped");
  assert.ok(!html.includes("<Perla>"));
  const expired = comparablePinCardHtml(pin({ expired: true, thumbnailUrl: null, folio: null }));
  assert.match(expired, /Vencido hasta/);
  assert.match(expired, /Sin número/);
  assert.ok(!expired.includes("<img"), "no photo, a neutral block");
  assert.equal(pinPriceLine(pin({ type: "INMUEBLE_RENTA", price: 18_000, area: 120 })), "$18,000 /mes · $150/m² al mes");
  assert.equal(pinPriceLine(pin({ price: null })), "Sin precio");
  assert.equal(pinFeatures(pin({ type: "TERRENO_VENTA", area: 420 })), "420 m² de terreno");
  assert.equal(pinFeatures(pin({ type: "TERRENO_VENTA", area: null })), "");
  const valuation: ValuationPinDto = {
    id: "v1", folio: "VLO-0001", title: "Casa <habitación>", client: "Banco & Cía.", status: "nuevo", statusName: "Nuevo", propertyKindName: "Casa",
    updatedAt: "2026-10-03T12:00:00.000Z", archived: true, lat: 20.6, lon: -103.4, address: null,
  };
  const valuationHtml = valuationPinCardHtml(valuation);
  assert.match(valuationHtml, /VLO-0001/);
  assert.ok(valuationHtml.includes("Casa &lt;habitación&gt;") && valuationHtml.includes("Banco &amp; Cía."));
  assert.match(valuationHtml, /Nuevo · archivado/);
});

test("the map shares the list's filters: the view and 'sin ubicar' travel in the URL with the rest", () => {
  const params = parseComparableListParams({ vista: "mapa", ubicacion: "sin", colonia: "Centro", tipo: ["TERRENO_VENTA", "inmueble_venta"], page: "3" });
  assert.equal(params.view, "mapa");
  assert.equal(params.located, "sin");
  assert.deepEqual(params.types, ["TERRENO_VENTA", "INMUEBLE_VENTA"]);
  assert.ok(hasAdvancedFilters(parseComparableListParams({ ubicacion: "con" })), "'con ubicación' is a filter of its own");
  assert.equal(parseComparableListParams({}).view, "lista", "the list by default");
  assert.equal(parseComparableListParams({ vista: "satelite", ubicacion: "quizá" }).view, "lista", "unknown values fall back");
  assert.equal(parseComparableListParams({ vista: "satelite", ubicacion: "quizá" }).located, null);
  const href = buildComparableListHref({ ...params, page: 1 });
  assert.equal(href, "/comparables?colonia=Centro&tipo=TERRENO_VENTA&tipo=INMUEBLE_VENTA&ubicacion=sin&vista=mapa");
  // The "N sin ubicar" link goes back to the list with the same filters.
  assert.equal(buildComparableListHref({ ...params, view: "lista", located: "sin", page: 1 }), "/comparables?colonia=Centro&tipo=TERRENO_VENTA&tipo=INMUEBLE_VENTA&ubicacion=sin");
  assert.equal(buildComparableListHref({ view: "lista" }), "/comparables", "the list view is the default and is left out");
  // What the map asks the API for is the same query string, so the pins obey the filters of the page.
  assert.deepEqual(parseComparableListParams(Object.fromEntries(new URLSearchParams(href.slice(href.indexOf("?") + 1)))).neighborhood, "Centro");
});

test("Google's sources reach the Comparables page (its map view) and the editor", () => {
  assert.ok(googleMapsPage("/comparables"));
  assert.ok(googleMapsPage("/workspace"));
  assert.ok(googleMapsPage("/comparables/8b1b3d2e-0000-4000-8000-000000000000"));
});
