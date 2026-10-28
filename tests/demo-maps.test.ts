import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_LAYERS,
  NAMED_WAYS,
  NO_MANUAL_STREETS,
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
  toggleSideStreet,
  type ComparableFilters,
  type StreetWay,
} from "../src/features/demo-maps/geo";
import { DEFAULT_HIGHLIGHT_STYLES, encodePolyline, highlightedWays, staticMapUrl } from "../src/features/demo-maps/static-map";
import { comparableCardHtml, escapeHtml } from "../src/features/demo-maps/map-content";
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

test("detection on a made-up grid: closest street in front, 110 m adjoining, rank 1–2 within 900 m", () => {
  const ways: StreetWay[] = [
    { n: "Frente", r: 4, g: [[20.63, -103.401], [20.63, -103.399]] },
    { n: "Lado", r: 4, g: [[20.6305, -103.401], [20.6305, -103.399]] },
    { n: "Lejos", r: 4, g: [[20.632, -103.401], [20.632, -103.399]] },
    { n: "Avenida", r: 2, g: [[20.635, -103.401], [20.635, -103.399]] },
    { n: "Periférico", r: 1, g: [[20.65, -103.401], [20.65, -103.399]] },
  ];
  const p: [number, number] = [20.6301, -103.4];
  const detection = detectStreets(p, ways);
  assert.equal(detection.front, "Frente");
  assert.deepEqual([...detection.side], ["Lado"]);
  assert.deepEqual([...detection.main], ["Avenida"]);

  // Touching a street adds it; touching it again removes it; the front street does not change.
  const added = toggleSideStreet(detection, NO_MANUAL_STREETS, "Lejos");
  const withLejos = detectStreets(p, ways, added);
  assert.ok(withLejos.side.has("Lejos"));
  const removed = toggleSideStreet(withLejos, added, "Lejos");
  assert.equal(detectStreets(p, ways, removed).side.has("Lejos"), false);
  const removedSide = toggleSideStreet(detection, NO_MANUAL_STREETS, "Lado");
  assert.equal(detectStreets(p, ways, removedSide).side.has("Lado"), false);
  assert.equal(toggleSideStreet(detection, NO_MANUAL_STREETS, "Frente"), NO_MANUAL_STREETS);
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
  assert.deepEqual(comparableDestinations({ land: true, rent: true }), ["Mercado de rentas · Terrenos", "Métodos estadísticos · Rentas"]);
  assert.deepEqual(comparableDestinations({ land: false, rent: false }), ["Mercado de venta · Inmuebles", "Métodos estadísticos · Inmuebles"]);
});

test("the croquis image URL carries the center, zoom, red pin and encoded streets", () => {
  // Example from Google's encoded polyline documentation.
  assert.equal(encodePolyline([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]), "_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  const detection = detectStreets(SUBJECT_START, NAMED_WAYS);
  const url = new URL(staticMapUrl({ apiKey: "k", center: SUBJECT_START, zoom: 17, highlights: highlightedWays(detection, DEFAULT_HIGHLIGHT_STYLES) }));
  assert.equal(url.origin + url.pathname, "https://maps.googleapis.com/maps/api/staticmap");
  assert.equal(url.searchParams.get("center"), "20.634420,-103.402390");
  assert.equal(url.searchParams.get("zoom"), "17");
  assert.ok(url.searchParams.getAll("markers").includes("color:red|20.634420,-103.402390"));
  const paths = url.searchParams.getAll("path");
  assert.ok(paths.some((path) => path.startsWith("color:0xc0392be6|weight:8|enc:")));
  assert.ok(url.toString().length <= 16384);
  const hidden = highlightedWays(detection, { ...DEFAULT_HIGHLIGHT_STYLES, front: { ...DEFAULT_HIGHLIGHT_STYLES.front, on: false } });
  assert.ok(hidden.every((item) => item.way.n !== detection.front));
});

test("the hover card escapes text and says the listing is fictitious", () => {
  assert.equal(escapeHtml(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  const card = comparableCardHtml(generateComparables()[0]);
  assert.match(card, /C-00041/);
  assert.match(card, /Anuncio ficticio de ejemplo/);
});

test("only the maps demonstration gets Google's sources in the CSP", () => {
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
