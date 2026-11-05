import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_LAYERS,
  NAMED_WAYS,
  SUBJECT_START,
  comparableDestinations,
  comparablesWithinRadius,
  detectStreets,
  distanceMeters,
  findStreet,
  generateComparables,
  isInsideDemoArea,
  passesFilters,
  segmentDistance,
  summarizeNames,
  type ComparableFilters,
  type StreetWay,
} from "../src/features/demo-maps/geo";
import {
  DEFAULT_HIGHLIGHT_STYLES,
  STREET_CATEGORIES,
  WEIGHT_RANGE,
  categoryForRank,
  highlightedWays,
  isMacroZoom,
  macroHighlights,
  paintStreet,
  seedPaint,
  streetLabels,
  type StreetPaint,
} from "../src/features/maps/highlights";
import { comparableCardHtml, escapeHtml } from "../src/features/demo-maps/map-content";
import {
  CLEAN_MAP_STYLES,
  DEFAULT_NORTH_ARROW,
  MACRO_FRAME,
  MAP_CORNERS,
  MICRO_FRAME,
  NORTH_ARROW_STYLES,
  frameCenter,
  frameFromView,
  staticMapStyle,
} from "../src/features/maps/map-styles";
import { STATIC_MAP_SIZE, encodePolyline, imagePosition, staticMapUrl } from "../src/features/demo-maps/static-map";
import { contentSecurityPolicy } from "../src/security/headers/security-headers";

const filters = (patch: Partial<ComparableFilters> = {}): ComparableFilters => ({ layers: ALL_LAYERS, minPrice: null, maxPrice: null, onlyCurrent: false, ...patch });

test("distances are in meters on a local flat projection", () => {
  assert.equal(distanceMeters([20.63, -103.4], [20.63, -103.4]), 0);
  // 0.001° of latitude is about 110.6 m.
  assert.ok(Math.abs(distanceMeters([20.63, -103.4], [20.631, -103.4]) - 110.574) < 0.01);
  // A point beyond the end of a segment measures to its end.
  const end: [number, number] = [20.631, -103.4];
  assert.ok(Math.abs(segmentDistance([20.632, -103.4], [20.63, -103.4], end) - distanceMeters([20.632, -103.4], end)) < 1e-6);
  // A point beside the segment measures perpendicular to it.
  assert.ok(segmentDistance([20.6305, -103.4], [20.63, -103.4], end) < 1e-6);
});

test("the example subject faces Calle Perla, with adjoining streets and main roads", () => {
  const detection = detectStreets(SUBJECT_START, NAMED_WAYS);
  assert.equal(detection.front, "Calle Perla");
  assert.ok(detection.side.size > 0);
  assert.equal(detection.side.has("Calle Perla"), false);
  for (const name of detection.main) {
    assert.equal(detection.side.has(name), false);
    assert.ok(NAMED_WAYS.some((way) => way.n === name && way.r <= 2));
  }
});

const GRID: StreetWay[] = [
  { n: "Frente", r: 4, g: [[20.63, -103.401], [20.63, -103.399]] },
  { n: "Lado", r: 4, g: [[20.6305, -103.401], [20.6305, -103.399]] },
  { n: "Lejos", r: 4, g: [[20.632, -103.401], [20.632, -103.399]] },
  { n: "Avenida", r: 2, g: [[20.635, -103.401], [20.635, -103.399]] },
  { n: "Periférico", r: 1, g: [[20.65, -103.401], [20.65, -103.399]] },
];
const GRID_PIN: [number, number] = [20.6301, -103.4];

test("detection on a made-up grid: closest street in front, 110 m adjoining, rank 1–2 within 900 m", () => {
  const detection = detectStreets(GRID_PIN, GRID);
  assert.equal(detection.front, "Frente");
  assert.deepEqual([...detection.side], ["Lado"]);
  assert.deepEqual([...detection.main], ["Avenida"]);
});

test("the palette: four categories with their own color and width, in the order offered", () => {
  assert.deepEqual(
    STREET_CATEGORIES.map((c) => c.key),
    ["principal", "secundaria", "terciaria", "cuarta"],
  );
  assert.deepEqual(
    STREET_CATEGORIES.map((c) => c.title),
    ["Avenida principal", "Calle secundaria", "Calle terciaria", "Calle cuarta"],
  );
  const colors = new Set(Object.values(DEFAULT_HIGHLIGHT_STYLES).map((style) => style.color));
  assert.equal(colors.size, 5, "the front street and every category have a different color");
  const weights = STREET_CATEGORIES.map((c) => DEFAULT_HIGHLIGHT_STYLES[c.key].weight);
  for (let i = 1; i < weights.length; i++) assert.ok(weights[i - 1] > weights[i], "avenues are the widest, fourth streets the thinnest");
  for (const style of Object.values(DEFAULT_HIGHLIGHT_STYLES)) {
    assert.ok(style.on);
    assert.match(style.color, /^#[0-9a-f]{6}$/);
    assert.ok(style.weight >= WEIGHT_RANGE.min && style.weight <= WEIGHT_RANGE.max);
  }
  assert.deepEqual([categoryForRank(1), categoryForRank(2), categoryForRank(3), categoryForRank(4)], ["principal", "principal", "secundaria", "terciaria"]);
});

test("painting: a category first, then the street; the same category again removes it; the front street is never painted", () => {
  const detection = detectStreets(GRID_PIN, GRID);
  const seed = seedPaint(detection, GRID);
  assert.deepEqual([...seed], [["Avenida", "principal"], ["Lado", "terciaria"]]);

  const painted = paintStreet(seed, "Lejos", "secundaria", detection.front);
  assert.equal(painted.get("Lejos"), "secundaria");
  assert.equal(seed.has("Lejos"), false, "the previous paint is not mutated");
  const repainted = paintStreet(painted, "Lejos", "cuarta", detection.front);
  assert.equal(repainted.get("Lejos"), "cuarta");
  const removed = paintStreet(repainted, "Lejos", "cuarta", detection.front);
  assert.equal(removed.has("Lejos"), false);
  assert.equal(paintStreet(seed, "Frente", "principal", detection.front), seed);
  // A suggested street can be removed too.
  assert.equal(paintStreet(seed, "Lado", "terciaria", detection.front).has("Lado"), false);

  // Drawing order: avenues at the bottom, the front street on top; hidden categories are left out.
  const items = highlightedWays({ front: detection.front, paint: painted }, DEFAULT_HIGHLIGHT_STYLES, GRID);
  assert.deepEqual(
    items.map((item) => [item.way.n, item.key]),
    [["Avenida", "principal"], ["Lejos", "secundaria"], ["Lado", "terciaria"], ["Frente", "front"]],
  );
  assert.equal(items[0].style, DEFAULT_HIGHLIGHT_STYLES.principal);
  const hidden = highlightedWays({ front: detection.front, paint: painted }, { ...DEFAULT_HIGHLIGHT_STYLES, secundaria: { ...DEFAULT_HIGHLIGHT_STYLES.secundaria, on: false } }, GRID);
  assert.ok(hidden.every((item) => item.way.n !== "Lejos"));

  // The macro croquis only shows the avenues; up to zoom 16 the map is a macro view.
  assert.deepEqual(macroHighlights(items).map((item) => item.way.n), ["Avenida"]);
  assert.ok(isMacroZoom(15) && isMacroZoom(16.4) && !isMacroZoom(16.6) && !isMacroZoom(17));

  // One name per street, with the color of its category.
  const labels = streetLabels(items, GRID_PIN);
  assert.deepEqual(labels.map((label) => label.name).sort(), ["Avenida", "Frente", "Lado", "Lejos"]);
  assert.equal(labels.find((label) => label.name === "Avenida")?.color, DEFAULT_HIGHLIGHT_STYLES.principal.color);
  const twoPieces: StreetWay[] = [
    { n: "Larga", r: 3, g: [[20.64, -103.401], [20.64, -103.399]] },
    { n: "Larga", r: 3, g: [[20.6302, -103.401], [20.6302, -103.399]] },
  ];
  const paint: StreetPaint = new Map([["Larga", "secundaria"]]);
  const larga = streetLabels(highlightedWays({ front: null, paint }, DEFAULT_HIGHLIGHT_STYLES, twoPieces), GRID_PIN);
  assert.equal(larga.length, 1);
  assert.deepEqual(larga[0].point, [20.6302, -103.399]);
});

test("the clean map hides points of interest, businesses and transit but keeps road and colonia labels", () => {
  const rule = (feature: string) => CLEAN_MAP_STYLES.find((r) => r.featureType === feature);
  assert.deepEqual(rule("poi"), { featureType: "poi", stylers: [{ visibility: "off" }] });
  assert.deepEqual(rule("poi.business")?.stylers, [{ visibility: "off" }]);
  assert.deepEqual(rule("transit")?.stylers, [{ visibility: "off" }]);
  assert.deepEqual(rule("road"), { featureType: "road", elementType: "labels", stylers: [{ visibility: "on" }] });
  assert.deepEqual(rule("administrative.neighborhood")?.stylers, [{ visibility: "on" }]);
  assert.ok(CLEAN_MAP_STYLES.every((r) => !r.elementType || r.elementType === "labels"), "only labels are forced on, never geometry");
  assert.equal(staticMapStyle(rule("poi")!), "feature:poi|visibility:off");
  assert.equal(staticMapStyle(rule("road")!), "feature:road|element:labels|visibility:on");
});

test("north arrow: three styles, four corners, top right by default; the croquis frames follow the pin", () => {
  assert.deepEqual(NORTH_ARROW_STYLES.map((s) => s.key), ["flecha", "aguja", "punta"]);
  assert.deepEqual(MAP_CORNERS.map((c) => c.key).sort(), ["bottom-left", "bottom-right", "top-left", "top-right"]);
  assert.deepEqual(DEFAULT_NORTH_ARROW, { style: "flecha", corner: "top-right" });
  assert.ok(NORTH_ARROW_STYLES.some((s) => s.key === DEFAULT_NORTH_ARROW.style));

  assert.equal(MACRO_FRAME.zoom, 15);
  assert.equal(MICRO_FRAME.zoom, 17);
  const frame = frameFromView({ center: [20.6354, -103.4034], zoom: 16.6 }, SUBJECT_START);
  assert.equal(frame.zoom, 17);
  assert.ok(Math.abs(frame.offset[0] - 0.00098) < 1e-9 && Math.abs(frame.offset[1] - -0.00101) < 1e-9);
  const moved: [number, number] = [20.64, -103.4];
  const center = frameCenter(frame, moved);
  assert.ok(Math.abs(center[0] - 20.64098) < 1e-9 && Math.abs(center[1] - -103.40101) < 1e-9);
  assert.deepEqual(frameCenter(MICRO_FRAME, moved), moved);
});

test("street names are summarized and found by name", () => {
  assert.equal(summarizeNames(new Set(["A", "B"])), "A, B");
  assert.equal(summarizeNames(new Set(["A", "B", "C", "D", "E", "F"])), "A, B, C, D y 2 más");
  const found = findStreet("calle perla");
  assert.equal(found?.name, "Calle Perla");
  assert.ok(found && isInsideDemoArea(found.point));
  assert.equal(findStreet("Calle Perla 3890, Loma Bonita Sur")?.name, "Calle Perla");
  assert.equal(findStreet("zzz no existe"), null);
  assert.equal(findStreet("   "), null);
});

test("the sample comparables are the same on every load: 34, within 1.5 km, by kind", () => {
  const a = generateComparables();
  const b = generateComparables();
  assert.deepEqual(a, b);
  assert.equal(a.length, 34);
  assert.equal(a[0].ref, "C-00041");
  assert.equal(a[33].ref, "C-00074");
  const count = (kind: string) => a.filter((c) => c.kind === kind).length;
  assert.deepEqual([count("IV"), count("TV"), count("IR"), count("TR")], [14, 11, 6, 3]);
  for (const c of a) {
    assert.ok(distanceMeters([c.lat, c.lon], SUBJECT_START) < 1550, c.ref);
    assert.equal(c.land, c.kind[0] === "T");
    assert.equal(c.rent, c.kind[1] === "R");
    assert.equal(c.price % (c.rent ? 100 : 10000), 0);
    assert.equal(c.land, c.bedrooms === null);
  }
  assert.notDeepEqual(generateComparables(undefined, { seed: 8 }), a);
});

test("filters by layer, price and validity; the radius list is sorted by distance", () => {
  const comps = generateComparables();
  assert.equal(comps.filter((c) => passesFilters(c, filters())).length, 34);
  assert.ok(comps.filter((c) => passesFilters(c, filters({ layers: { ...ALL_LAYERS, IV: false } }))).every((c) => c.kind !== "IV"));
  const cheap = comps.filter((c) => passesFilters(c, filters({ maxPrice: 50000 })));
  assert.ok(cheap.length > 0 && cheap.every((c) => c.price <= 50000));
  assert.ok(comps.filter((c) => passesFilters(c, filters({ minPrice: 3_000_000 }))).every((c) => c.price >= 3_000_000));
  assert.ok(comps.filter((c) => passesFilters(c, filters({ onlyCurrent: true }))).every((c) => c.current));

  const near = comparablesWithinRadius(comps, SUBJECT_START, 600);
  assert.ok(near.every((entry) => entry.distance <= 600));
  for (let i = 1; i < near.length; i++) assert.ok(near[i - 1].distance <= near[i].distance);
  assert.ok(comparablesWithinRadius(comps, SUBJECT_START, 1500).length >= near.length);
  assert.deepEqual(comparableDestinations({ land: true, rent: true }), ["Mercado de rentas · Terrenos", "Métodos alternativos · Rentas"]);
  assert.deepEqual(comparableDestinations({ land: false, rent: false }), ["Mercado de venta · Inmuebles", "Métodos alternativos · Inmuebles"]);
});

test("the croquis image URL carries the center, zoom, red pin, clean-map styles and encoded streets", () => {
  // Example from Google's encoded polyline documentation.
  assert.equal(encodePolyline([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]), "_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  const detection = detectStreets(SUBJECT_START, NAMED_WAYS);
  const highlights = highlightedWays({ front: detection.front, paint: seedPaint(detection, NAMED_WAYS) }, DEFAULT_HIGHLIGHT_STYLES, NAMED_WAYS);
  const center: [number, number] = [20.6354, -103.4034];
  const url = new URL(staticMapUrl({ apiKey: "k", center, zoom: 17, subject: SUBJECT_START, clean: true, highlights }));
  assert.equal(url.origin + url.pathname, "https://maps.googleapis.com/maps/api/staticmap");
  assert.equal(url.searchParams.get("center"), "20.635400,-103.403400");
  assert.equal(url.searchParams.get("zoom"), "17");
  assert.equal(url.searchParams.get("size"), "640x400");
  assert.ok(url.searchParams.getAll("markers").includes("color:red|20.634420,-103.402390"), "the pin stays on the subject when the frame moves");
  assert.deepEqual(url.searchParams.getAll("style").slice(0, 3), ["feature:poi|visibility:off", "feature:poi.business|visibility:off", "feature:transit|visibility:off"]);
  const paths = url.searchParams.getAll("path");
  assert.ok(paths.some((path) => path.startsWith("color:0xc0392be6|weight:8|enc:")));
  assert.ok(url.toString().length <= 16384);
  assert.equal(new URL(staticMapUrl({ apiKey: "k", center, zoom: 15 })).searchParams.has("style"), false);
  const hidden = highlightedWays({ front: detection.front, paint: seedPaint(detection, NAMED_WAYS) }, { ...DEFAULT_HIGHLIGHT_STYLES, front: { ...DEFAULT_HIGHLIGHT_STYLES.front, on: false } }, NAMED_WAYS);
  assert.ok(hidden.every((item) => item.way.n !== detection.front));
});

test("street names are laid over the image where the point falls, or not at all when it is outside", () => {
  const middle = imagePosition(SUBJECT_START, 17, SUBJECT_START);
  assert.deepEqual(middle, { x: 0.5, y: 0.5 });
  // 0.001° north and east: up and to the right of the center, inside the 640×400 image.
  const near = imagePosition(SUBJECT_START, 17, [SUBJECT_START[0] + 0.001, SUBJECT_START[1] + 0.001]);
  assert.ok(near && near.x > 0.5 && near.x < 1 && near.y < 0.5 && near.y > 0);
  // The same fraction of the width in map pixels: 2^17 × 256 / 360 px per degree of longitude.
  assert.ok(near && Math.abs((near.x - 0.5) * STATIC_MAP_SIZE.width - ((2 ** 17 * 256) / 360) * 0.001) < 0.01);
  assert.equal(imagePosition(SUBJECT_START, 17, [SUBJECT_START[0] + 0.01, SUBJECT_START[1]]), null);
  assert.ok(imagePosition(SUBJECT_START, 13, [SUBJECT_START[0] + 0.01, SUBJECT_START[1]]), "the same point fits at a lower zoom");
});

test("the hover card escapes text and says the listing is fictitious", () => {
  assert.equal(escapeHtml(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  const card = comparableCardHtml(generateComparables()[0]);
  assert.match(card, /C-00041/);
  assert.match(card, /Anuncio ficticio de ejemplo/);
});

test("Google's sources enter the CSP only when the page draws the map", () => {
  const base = contentSecurityPolicy({ development: false, nonce: "n" });
  assert.doesNotMatch(base, /google|gstatic|worker-src/);
  const maps = contentSecurityPolicy({ development: false, nonce: "n", googleMaps: true });
  const directive = (name: string) => maps.split("; ").find((entry) => entry.startsWith(`${name} `));
  assert.equal(directive("script-src"), "script-src 'self' 'nonce-n' 'strict-dynamic' https://maps.googleapis.com");
  assert.match(directive("img-src")!, /https:\/\/maps\.gstatic\.com .*https:\/\/\*\.gstatic\.com/);
  assert.equal(directive("connect-src"), "connect-src 'self' https://maps.googleapis.com https://*.googleapis.com");
  assert.equal(directive("worker-src"), "worker-src blob:");
  assert.equal(directive("font-src"), "font-src 'self' data: https://fonts.gstatic.com");
  assert.match(maps, /frame-ancestors 'none'/);
  assert.match(maps, /object-src 'none'/);
});
