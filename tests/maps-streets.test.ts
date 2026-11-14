/**
 * Etapa 2 of the maps: the streets around the subject (OpenStreetMap through
 * the server), the palette and the painting as the valuation persists them,
 * what each croquis draws within the URL budget, and the name labels the
 * server composes over the image.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_CROQUIS_SETTINGS, croquisSettingsSchema, readCroquisSettings, streetLabelBox, streetLabelsOverlaySvg } from "../src/features/maps/croquis";
import { MAX_CROQUIS_WAYS, STREET_PATHS_BUDGET, croquisStreets, frameBounds } from "../src/features/maps/croquis-streets";
import {
  DEFAULT_HIGHLIGHT_STYLES,
  DEFAULT_STREET_HIGHLIGHTS,
  MAX_PAINTED_STREETS,
  hasHighlights,
  highlightedWays,
  macroHighlights,
  paintFromStreets,
  paintStreet,
  seedPaint,
  streetHighlightsSchema,
  streetsFromPaint,
  type StreetHighlights,
} from "../src/features/maps/highlights";
import { STATIC_MAP_SIZE, imagePosition, staticMapUrl } from "../src/features/maps/static-map";
import { detectStreets, metersPerPixel, simplifyPolyline, wayInBounds, type StreetWay } from "../src/features/maps/streets";
import { DEFAULT_STREETS_RADIUS, MAX_STREET_WAYS, highwayRank, overpassQuery, parseOverpassWays, streetsCacheKey, type OverpassElement } from "../src/features/maps/streets-osm";
import { fetchStreetsFromOverpass, getStreetsAround } from "../src/features/maps/server/streets.service";
import { rateLimits } from "../src/security/rate-limit/rate-limiter";

const PIN: [number, number] = [20.6301, -103.4];

/** A made-up grid around the pin: the front street, one adjoining, one far, an avenue and a ring road. */
const GRID: StreetWay[] = [
  { id: 1, n: "Frente", r: 4, g: [[20.63, -103.401], [20.63, -103.399]] },
  { id: 2, n: "Lado", r: 4, g: [[20.6305, -103.401], [20.6305, -103.399]] },
  { id: 3, n: "Lejos", r: 4, g: [[20.632, -103.401], [20.632, -103.399]] },
  { id: 4, n: "Avenida", r: 2, g: [[20.635, -103.401], [20.635, -103.399]] },
  { id: 5, n: "Periférico", r: 1, g: [[20.65, -103.401], [20.65, -103.399]] },
  { id: 6, n: "", r: 4, g: [[20.6302, -103.4001], [20.6302, -103.3999]] },
];

test("OpenStreetMap: the query asks for named streets around the point, the answer becomes ranked pieces, unnamed ones are left out", () => {
  const query = overpassQuery(PIN, 1000);
  assert.match(query, /^\[out:json\]\[timeout:15\];way\(around:1000,20\.630100,-103\.400000\)\["highway"~"\^\((motorway|[a-z_|]+)\)\$"\]\["name"\];out geom;$/);
  assert.ok(query.includes("residential") && query.includes("primary_link"));
  assert.deepEqual([highwayRank("motorway"), highwayRank("primary"), highwayRank("secondary"), highwayRank("tertiary"), highwayRank("residential"), highwayRank("tertiary_link")], [1, 1, 2, 3, 4, 3]);
  assert.equal(highwayRank("footway"), null);
  const elements: OverpassElement[] = [
    { type: "way", id: 10, tags: { highway: "secondary", name: " Avenida Patria " }, geometry: [{ lat: 20.63, lon: -103.4 }, { lat: 20.6301, lon: -103.4 }, { lat: 20.6302, lon: -103.4 }, { lat: 20.631, lon: -103.401 }] },
    { type: "way", id: 11, tags: { highway: "residential" }, geometry: [{ lat: 20.63, lon: -103.4 }, { lat: 20.631, lon: -103.4 }] },
    { type: "way", id: 12, tags: { highway: "footway", name: "Andador" }, geometry: [{ lat: 20.63, lon: -103.4 }, { lat: 20.631, lon: -103.4 }] },
    { type: "way", id: 13, tags: { highway: "residential", name: "Corta" }, geometry: [{ lat: 20.63, lon: -103.4 }] },
    { type: "node", id: 14, tags: { highway: "residential", name: "Nodo" } },
  ];
  const ways = parseOverpassWays(elements);
  assert.equal(ways.length, 1);
  assert.equal(ways[0].id, 10);
  assert.equal(ways[0].n, "Avenida Patria");
  assert.equal(ways[0].r, 2);
  // The straight middle vertex is simplified away; the bend stays.
  assert.deepEqual(ways[0].g, [[20.63, -103.4], [20.6302, -103.4], [20.631, -103.401]]);
  const many = parseOverpassWays(Array.from({ length: MAX_STREET_WAYS + 5 }, (_, i) => ({ ...elements[0], id: i })));
  assert.equal(many.length, MAX_STREET_WAYS);
  // Nearby pins share the cache; the radius is part of the key.
  assert.equal(streetsCacheKey([20.63012, -103.40049], DEFAULT_STREETS_RADIUS), streetsCacheKey([20.63049, -103.40001], 1000));
  assert.notEqual(streetsCacheKey(PIN, 1000), streetsCacheKey(PIN, 500));
  assert.ok(rateLimits.streets, "the route has its own rate limit");
});

test("the mirrors are tried in turn: a refusal goes to the next one, and only when all fail is there an error", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url));
    assert.equal(init?.method, "POST");
    assert.match(String(init?.body), /^data=%5Bout%3Ajson%5D/);
    if (calls.length === 1) return new Response("busy", { status: 429 });
    return Response.json({ elements: [{ type: "way", id: 1, tags: { highway: "residential", name: "Calle Perla" }, geometry: [{ lat: 20.63, lon: -103.4 }, { lat: 20.631, lon: -103.4 }] }] });
  }) as typeof fetch;
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const ways = await fetchStreetsFromOverpass(PIN, 1000, fetchImpl, ["https://a/api", "https://b/api"]);
    assert.deepEqual(calls, ["https://a/api", "https://b/api"]);
    assert.equal(ways[0].n, "Calle Perla");
    const originalError = console.error;
    console.error = () => {};
    try {
      await assert.rejects(fetchStreetsFromOverpass(PIN, 1000, (async () => new Response("down", { status: 504 })) as typeof fetch, ["https://a/api"]), /OpenStreetMap/);
    } finally {
      console.error = originalError;
    }
  } finally {
    console.warn = originalWarn;
  }
});

const PERLA = { elements: [{ type: "way", id: 1, tags: { highway: "residential", name: "Calle Perla" }, geometry: [{ lat: 20.63, lon: -103.4 }, { lat: 20.631, lon: -103.4 }] }] };

/** A mirror that never answers on its own: it only ends when the request is cancelled. */
const silent = (init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));

async function quietly<T>(run: () => Promise<T>) {
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

test("MAP-04: a silent mirror gets company after a head start, the first answer wins and the rest are cancelled", async () => {
  const calls: string[] = [];
  let cancelled = 0;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url));
    if (String(url) === "https://a/api") {
      return silent(init).catch((error: unknown) => {
        cancelled += 1;
        throw error;
      });
    }
    return Response.json(PERLA);
  }) as typeof fetch;
  const started = Date.now();
  const ways = await quietly(() => fetchStreetsFromOverpass(PIN, 1000, fetchImpl, ["https://a/api", "https://b/api", "https://c/api"], { mirrorTimeoutMs: 5_000, hedgeAfterMs: 30, totalBudgetMs: 5_000 }));
  assert.equal(ways[0].n, "Calle Perla");
  assert.deepEqual(calls, ["https://a/api", "https://b/api"], "the third mirror is never asked");
  assert.ok(Date.now() - started < 1_000, "it does not wait for the silent mirror's own timeout");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(cancelled, 1, "the silent mirror is cancelled");
});

test("MAP-04: when no mirror answers, the error comes within the total budget (the proxy cut at 60 s used to answer instead)", async () => {
  const started = Date.now();
  await quietly(() =>
    assert.rejects(
      fetchStreetsFromOverpass(PIN, 1000, (async (_url: string | URL | Request, init?: RequestInit) => silent(init)) as typeof fetch, ["https://a/api", "https://b/api", "https://c/api"], {
        mirrorTimeoutMs: 10_000,
        hedgeAfterMs: 20,
        totalBudgetMs: 150,
      }),
      (error: Error & { status?: number }) => /Reintentar/.test(error.message),
    ),
  );
  assert.ok(Date.now() - started < 1_000);
});

test("MAP-05: an answer is reused for the same zone without asking the mirrors again, even when they are down", async () => {
  let asked = 0;
  const point: [number, number] = [21.0012, -101.5034];
  const answer = (async () => {
    asked += 1;
    return Response.json(PERLA);
  }) as typeof fetch;
  const first = await getStreetsAround(point, 1000, answer);
  const nearby = await getStreetsAround([21.0014, -101.5031], 1000, answer);
  assert.equal(asked, 1, "a pin a few meters away shares the answer");
  assert.deepEqual(nearby, first);
  const down = (async () => new Response("down", { status: 504 })) as typeof fetch;
  // Still fresh: the mirrors are not even asked.
  assert.deepEqual(await getStreetsAround(point, 1000, down), first);
});

test("the palette and the painted streets persist with the croquis settings and read back piece by piece", () => {
  assert.deepEqual(DEFAULT_STREET_HIGHLIGHTS, { front: null, streets: [], styles: DEFAULT_HIGHLIGHT_STYLES, names: true });
  assert.deepEqual(DEFAULT_CROQUIS_SETTINGS.streets, DEFAULT_STREET_HIGHLIGHTS);
  assert.equal(hasHighlights(DEFAULT_STREET_HIGHLIGHTS), false);
  assert.ok(hasHighlights({ front: "Calle Perla", streets: [] }));
  // Settings stored by etapa 1 (without streets) read with the default highlights.
  const { streets: _streets, ...etapa1 } = DEFAULT_CROQUIS_SETTINGS;
  assert.deepEqual(readCroquisSettings({ ...etapa1, clean: false }).streets, DEFAULT_STREET_HIGHLIGHTS);
  // A stored palette with the appraiser's colors and a painted street.
  const stored: StreetHighlights = {
    front: "Calle Perla",
    streets: [{ name: "Avenida Patria", category: "principal" }, { name: "Calle Ópalo", category: "cuarta" }],
    styles: { ...DEFAULT_HIGHLIGHT_STYLES, principal: { on: true, color: "#112233", weight: 10 } },
    names: false,
  };
  const read = readCroquisSettings({ ...DEFAULT_CROQUIS_SETTINGS, streets: stored });
  assert.deepEqual(read.streets, stored);
  assert.ok(croquisSettingsSchema.safeParse(read).success);
  // Broken pieces fall back as a whole: a bad color, a width out of range, an unknown category, too many streets.
  assert.equal(streetHighlightsSchema.safeParse({ ...stored, styles: { ...stored.styles, front: { on: true, color: "red", weight: 4 } } }).success, false);
  assert.equal(streetHighlightsSchema.safeParse({ ...stored, styles: { ...stored.styles, front: { on: true, color: "#c0392b", weight: 40 } } }).success, false);
  assert.equal(streetHighlightsSchema.safeParse({ ...stored, streets: [{ name: "X", category: "quinta" }] }).success, false);
  assert.equal(streetHighlightsSchema.safeParse({ ...stored, streets: Array.from({ length: MAX_PAINTED_STREETS + 1 }, (_, i) => ({ name: `C${i}`, category: "cuarta" })) }).success, false);
  assert.deepEqual(readCroquisSettings({ ...DEFAULT_CROQUIS_SETTINGS, streets: { front: 5 } }).streets, DEFAULT_STREET_HIGHLIGHTS);
});

test("painting in the valuation: the suggestion when the pin moves, paint, repaint, remove, the front street immutable, stored in palette order", () => {
  const detection = detectStreets(PIN, GRID);
  assert.equal(detection.front, "Frente");
  assert.deepEqual([...detection.side], ["Lado"]);
  assert.deepEqual([...detection.main], ["Avenida"]);
  const seed = seedPaint(detection, GRID);
  assert.deepEqual(streetsFromPaint(seed), [{ name: "Avenida", category: "principal" }, { name: "Lado", category: "terciaria" }]);
  // Touch Lejos as secondary, then as fourth, then as fourth again: painted, repainted, removed.
  let paint = paintStreet(seed, "Lejos", "secundaria", detection.front);
  assert.equal(paint.get("Lejos"), "secundaria");
  paint = paintStreet(paint, "Lejos", "cuarta", detection.front);
  assert.equal(paint.get("Lejos"), "cuarta");
  assert.deepEqual(streetsFromPaint(paint).map((street) => street.name), ["Avenida", "Lado", "Lejos"]);
  paint = paintStreet(paint, "Lejos", "cuarta", detection.front);
  assert.equal(paint.has("Lejos"), false);
  assert.equal(paintStreet(paint, "Frente", "principal", detection.front), paint, "the front street is never painted");
  // The list reads back as the same paint; a repeated name keeps the last entry.
  assert.deepEqual([...paintFromStreets(streetsFromPaint(paint))], [...paint]);
  assert.equal(paintFromStreets([{ name: "A", category: "cuarta" }, { name: "A", category: "principal" }]).get("A"), "principal");
  // Unnamed pieces never highlight, and the macro view keeps the avenues only.
  const items = highlightedWays({ front: detection.front, paint }, DEFAULT_HIGHLIGHT_STYLES, GRID);
  assert.deepEqual(items.map((item) => [item.way.n, item.key]), [["Avenida", "principal"], ["Lado", "terciaria"], ["Frente", "front"]]);
  assert.deepEqual(macroHighlights(items).map((item) => item.way.n), ["Avenida"]);
});

test("simplification keeps the shape within the tolerance and drops the vertices that are not visible", () => {
  const line: [number, number][] = [[20.63, -103.4], [20.6301, -103.4], [20.6302, -103.40001], [20.6303, -103.4], [20.631, -103.4], [20.631, -103.399]];
  assert.deepEqual(simplifyPolyline(line, 2), [[20.63, -103.4], [20.631, -103.4], [20.631, -103.399]]);
  // A real bend of about 10 m stays with a tighter tolerance.
  const bend: [number, number][] = [[20.63, -103.4], [20.6305, -103.3999], [20.631, -103.4]];
  assert.equal(simplifyPolyline(bend, 5).length, 3);
  assert.equal(simplifyPolyline(bend, 20).length, 2);
  assert.deepEqual(simplifyPolyline(bend, 0), bend);
  assert.deepEqual(simplifyPolyline([[20.63, -103.4]], 5), [[20.63, -103.4]]);
  // Half a pixel at the micro zoom is under a meter; at the macro zoom a few meters.
  assert.ok(metersPerPixel(17, 20.63) * 0.5 < 1 && metersPerPixel(15, 20.63) * 0.5 > 2);
  const bounds = frameBounds(PIN, 17);
  assert.ok(wayInBounds(GRID[0], bounds) && wayInBounds(GRID[1], bounds));
  assert.equal(wayInBounds(GRID[4], bounds), false, "the ring road 2 km away is outside the micro frame");
});

test("what each croquis draws: the micro every street in frame, the macro the avenues, the map of comparables nothing; names only on drawn streets", () => {
  const detection = detectStreets(PIN, GRID);
  const highlights: StreetHighlights = { front: detection.front, streets: streetsFromPaint(paintStreet(seedPaint(detection, GRID), "Lejos", "secundaria", detection.front)), styles: DEFAULT_HIGHLIGHT_STYLES, names: true };
  const micro = croquisStreets("micro", PIN, 17, highlights, GRID);
  assert.deepEqual(micro.paths.map((path) => [path.color, path.weight, path.points.length]), [
    [DEFAULT_HIGHLIGHT_STYLES.secundaria.color, 6, 2],
    [DEFAULT_HIGHLIGHT_STYLES.terciaria.color, 4, 2],
    [DEFAULT_HIGHLIGHT_STYLES.front.color, 8, 2],
  ]);
  assert.deepEqual(micro.labels.map((label) => label.name).sort(), ["Frente", "Lado", "Lejos"]);
  assert.deepEqual(micro.omitted, []);
  // The avenue at 540 m is outside the micro frame but inside the macro one, which draws it alone.
  const macro = croquisStreets("macro", PIN, 15, highlights, GRID);
  assert.deepEqual(macro.paths.map((path) => path.color), [DEFAULT_HIGHLIGHT_STYLES.principal.color]);
  assert.deepEqual(macro.labels.map((label) => label.name), ["Avenida"]);
  assert.deepEqual(croquisStreets("comparables", PIN, 15, highlights, GRID), { paths: [], labels: [], omitted: [] });
  assert.deepEqual(croquisStreets("micro", PIN, 17, { ...highlights, names: false }, GRID).labels, []);
  // The image URL carries them as encoded paths and stays short.
  const url = staticMapUrl({ apiKey: "k".repeat(39), center: PIN, zoom: 17, subject: PIN, clean: true, paths: micro.paths });
  assert.equal(new URL(url).searchParams.getAll("path").length, 3);
  assert.ok(url.length < 2000);
});

test("the URL budget: a long street is simplified, the pieces farthest from the center are omitted first and named, the rest draw", () => {
  // A hundred pieces of a winding street, each with many vertices, around the pin.
  const pieces: StreetWay[] = Array.from({ length: 100 }, (_, i) => {
    const lat = 20.6301 + (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 0.0001;
    const g: [number, number][] = Array.from({ length: 200 }, (_, j) => [lat + (j % 2) * 0.00004, -103.402 + j * 0.00002]);
    return { id: i, n: i % 3 === 0 ? "Serpentina" : `Ramal ${i}`, r: 4, g };
  });
  const highlights: StreetHighlights = {
    front: "Serpentina",
    streets: pieces.filter((way) => way.n !== "Serpentina").map((way) => ({ name: way.n, category: "cuarta" as const })),
    styles: DEFAULT_HIGHLIGHT_STYLES,
    names: true,
  };
  const result = croquisStreets("micro", PIN, 17, highlights, pieces);
  assert.ok(result.paths.length > 0 && result.paths.length <= MAX_CROQUIS_WAYS);
  assert.ok(result.omitted.length > 0, "not everything fits");
  assert.ok(result.omitted.every((name) => name.startsWith("Ramal")), "the front street, closest to the center, is never the one omitted");
  assert.ok(result.paths.every((path) => path.points.length <= 200));
  const url = staticMapUrl({ apiKey: "k".repeat(39), center: PIN, zoom: 17, subject: PIN, clean: true, paths: result.paths });
  assert.equal(new URL(url).searchParams.getAll("path").length, result.paths.length, "the builder drops nothing more");
  assert.ok(url.length <= STREET_PATHS_BUDGET + 1500, `the URL is ${url.length} characters`);
  // Names go only on streets that draw.
  const drawn = new Set(result.labels.map((label) => label.name));
  for (const name of result.omitted) assert.equal(drawn.has(name), false);
  assert.ok(drawn.has("Serpentina"));
});

test("V5.7-14: the name labels the server composes: on their street and turned along it, readable, nothing outside the frame", () => {
  const svg = streetLabelsOverlaySvg(PIN, 17, [
    { name: "Calle Perla <3>", point: [20.6303, -103.4005], color: "#c0392b", angle: -30 },
    { name: "Periférico", point: [20.65, -103.4], color: "#1f7ac2", angle: 0 },
  ]);
  assert.match(svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" width="${STATIC_MAP_SIZE.width * 2}" height="${STATIC_MAP_SIZE.height * 2}"`));
  assert.equal((svg.match(/<text/g) ?? []).length, 1, "the ring road outside the frame has no label");
  assert.match(svg, /Calle Perla &lt;3&gt;/);
  // A white band edged with the street's color, bold dark letters, centered.
  assert.match(svg, /stroke="#c0392b"/);
  assert.match(svg, /fill="#ffffff"/);
  assert.match(svg, /font-weight="700"[^>]*fill="#1b2733"/);
  assert.match(svg, /text-anchor="middle"/);
  // Centered on its point and turned along its street.
  const at = imagePosition(PIN, 17, [20.6303, -103.4005])!;
  const [, x, y, angle] = svg.match(/translate\(([\d.]+) ([\d.]+)\) rotate\((-?[\d.]+)\)/)!.map(Number);
  assert.ok(Math.abs(x - at.x * STATIC_MAP_SIZE.width * 2) < 1 && Math.abs(y - at.y * STATIC_MAP_SIZE.height * 2) < 1);
  assert.equal(angle, -30);
  // At the edge of the image the label is pulled inside, whole.
  const edgePoint: [number, number] = [20.6301 + 0.0005, -103.4 - 0.0019];
  const edge = streetLabelsOverlaySvg(PIN, 17, [{ name: "Orilla", point: edgePoint, color: "#000000", angle: 0 }]);
  const [, ex] = edge.match(/translate\(([\d.]+) /)!.map(Number);
  const box = streetLabelBox(PIN, 17, { name: "Orilla", point: edgePoint, angle: 0 });
  assert.ok(ex / 2 - box.width / 2 >= 2, "the whole band stays inside the image");
});

