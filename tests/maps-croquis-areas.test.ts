/**
 * Notas de voz de Álvaro, 27 nov 2026: the stored croquis came out «de un
 * solo tono» beige, with no parks, gardens nor water, and the streets did
 * not stand out. Now its base map paints the areas of OpenStreetMap under
 * the streets with the colors of the standard map (openstreetmap-carto), and
 * the streets have carto's widths and edges. These are the classification
 * of the tags, the rings of a multipolygon, the drawing, the Overpass
 * fallback and the image itself, without a network or a database.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import sharp from "sharp";

import {
  AREA_STYLES,
  areaKind,
  areaKindsAtZoom,
  areasQueryBox,
  minimumAreaM2,
  multipolygon,
  overpassAreasQuery,
  parseOverpassAreas,
  polygonAreaM2,
  relationAreaKind,
  type BaseMapArea,
} from "../src/features/maps/osm-areas";
import { BASE_MAP_BACKGROUND, baseMapSvg, type BaseMapWay } from "../src/features/maps/osm-base-map";
import { areaWkt, geoJsonShapes } from "../src/features/maps/server/areas-db";
import { renderCroquisImage, type CroquisRenderInput } from "../src/features/maps/server/croquis-image.service";
import { baseMapAreas, overpassAreas, type BaseMapAreaSource } from "../src/features/maps/server/osm-base.service";
import { STATIC_MAP_SCALE, imagePixel } from "../src/features/maps/static-map";
import { DEFAULT_HIGHLIGHT_STYLES } from "../src/features/maps/highlights";
import { OSM_ATTRIBUTION } from "../src/features/maps/streets-osm";
import type { LatLon } from "../src/features/maps/types";

const SUBJECT: LatLon = [20.706, -102.348];
const METER = 1 / 111_195;
const east = (meters: number) => (meters * METER) / Math.cos((SUBJECT[0] * Math.PI) / 180);
const at = (north: number, eastMeters: number): LatLon => [SUBJECT[0] + north * METER, SUBJECT[1] + east(eastMeters)];
/** A square of `half` meters around a point, closed. */
const square = (north: number, eastMeters: number, half: number): LatLon[] => [
  at(north - half, eastMeters - half),
  at(north - half, eastMeters + half),
  at(north + half, eastMeters + half),
  at(north + half, eastMeters - half),
  at(north - half, eastMeters - half),
];
const area = (kind: BaseMapArea["kind"], polygon: LatLon[][]): BaseMapArea => ({ kind, polygons: [polygon], lines: [], areaM2: polygonAreaM2(polygon) });

test("the tags of an element say what it is painted as, as on the standard map", () => {
  assert.equal(areaKind({ leisure: "park" }, true), "park");
  assert.equal(areaKind({ landuse: "grass" }, true), "grass");
  assert.equal(areaKind({ natural: "wood" }, true), "forest");
  assert.equal(areaKind({ natural: "water" }, true), "water");
  assert.equal(areaKind({ waterway: "riverbank" }, true), "water");
  assert.equal(areaKind({ amenity: "school", landuse: "residential" }, true), "societal", "the school's grounds over the land use");
  assert.equal(areaKind({ building: "yes", amenity: "school" }, true), "building", "a building over its grounds");
  assert.equal(areaKind({ building: "no", landuse: "residential" }, true), "residential");
  assert.equal(areaKind({ waterway: "river" }, false), "river", "a river is a line");
  assert.equal(areaKind({ waterway: "stream" }, true), "stream", "even a closed one");
  assert.equal(areaKind({ leisure: "park" }, false), null, "an open outline fills nothing");
  assert.equal(areaKind({ leisure: "park", area: "no" }, true), null);
  assert.equal(areaKind({ highway: "residential" } as never, true), null);
  assert.equal(relationAreaKind({ type: "multipolygon", leisure: "park" }), "park");
  assert.equal(relationAreaKind({ type: "boundary", leisure: "park" }), null);
  assert.equal(relationAreaKind({ type: "multipolygon", waterway: "river" }), null);
  // carto's colors.
  assert.equal(AREA_STYLES.park.fill, "#c8facc");
  assert.equal(AREA_STYLES.grass.fill, "#cdebb0");
  assert.equal(AREA_STYLES.forest.fill, "#add19e");
  assert.equal(AREA_STYLES.water.fill, "#aad3df");
  assert.equal(AREA_STYLES.residential.fill, "#e0dfdf");
  assert.deepEqual(AREA_STYLES.building, { fill: "#d9d0c9", edge: "#c4b6ab" });
  // Buildings only on a neighborhood frame.
  assert.ok(areaKindsAtZoom(17).includes("building") && areaKindsAtZoom(15).includes("building"));
  assert.ok(!areaKindsAtZoom(14).includes("building") && areaKindsAtZoom(12).includes("park"));
});

test("a multipolygon's pieces are joined into rings in either direction, its inner rings become holes, and open outlines are dropped", () => {
  const a = at(0, 0);
  const b = at(0, 100);
  const c = at(100, 100);
  const d = at(100, 0);
  // Two pieces, the second one backwards.
  const [polygon, ...rest] = multipolygon([[a, b, c], [a, d, c]], [square(50, 50, 10), square(500, 500, 10)]);
  assert.equal(rest.length, 0);
  assert.equal(polygon.length, 2, "one hole: the inner ring outside every outer one is dropped");
  assert.equal(polygon[0].length, 5);
  assert.deepEqual(polygon[0][0], polygon[0][4], "closed");
  assert.deepEqual(new Set(polygon[0].map(String)), new Set([a, b, c, d].map(String)), "the four corners, in ring order");
  assert.ok(Math.abs(polygonAreaM2(polygon) - (10_000 - 400)) < 60, `100 × 100 m minus a 20 × 20 m hole (${polygonAreaM2(polygon)})`);
  assert.deepEqual(multipolygon([[a, b, c]], []), [], "an outline that never closes");
});

test("an Overpass answer becomes areas; the query asks for the kinds of the map, buildings only when asked, over a box snapped to a grid", () => {
  const box = areasQueryBox([
    [20.7012, -102.3555],
    [20.7111, -102.3404],
  ]);
  assert.deepEqual(box, [
    [20.7, -102.36],
    [20.72, -102.34],
  ]);
  const query = overpassAreasQuery(box, false);
  assert.match(query, /way\["leisure"~"\^\(park\|/);
  assert.match(query, /relation\["type"="multipolygon"\]\["natural"~/);
  assert.match(query, /\(20\.7,-102\.36,20\.72,-102\.34\)/);
  assert.doesNotMatch(query, /"building"/);
  assert.match(overpassAreasQuery(box, true), /way\["building"\]/);
  const ring = square(0, 0, 50).map(([lat, lon]) => ({ lat, lon }));
  const areas = parseOverpassAreas([
    { type: "way", id: 1, tags: { leisure: "park" }, geometry: ring },
    { type: "way", id: 2, tags: { waterway: "stream" }, geometry: ring.slice(0, 3) },
    { type: "way", id: 3, tags: { barrier: "fence" }, geometry: ring },
    {
      type: "relation",
      id: 4,
      tags: { type: "multipolygon", natural: "water" },
      members: [
        { type: "way", role: "outer", geometry: square(300, 0, 60).map(([lat, lon]) => ({ lat, lon })) },
        { type: "way", role: "inner", geometry: square(300, 0, 10).map(([lat, lon]) => ({ lat, lon })) },
      ],
    },
  ]);
  assert.deepEqual(
    areas.map((item) => [item.kind, item.polygons.length, item.lines.length]),
    [
      ["park", 1, 0],
      ["stream", 0, 1],
      ["water", 1, 0],
    ],
  );
  assert.equal(areas[2].polygons[0].length, 2, "the lake keeps its island");
});

test("the database's shapes come back as polygons and lines, and go in as WKT in [lon lat]", () => {
  const shapes = geoJsonShapes({
    type: "GeometryCollection",
    geometries: [
      { type: "MultiPolygon", coordinates: [[[[1, 2], [3, 2], [3, 4], [1, 2]]]] },
      { type: "LineString", coordinates: [[5, 6], [7, 8]] },
      { type: "Point", coordinates: [0, 0] },
    ],
  });
  assert.deepEqual(shapes.polygons, [[[[2, 1], [2, 3], [4, 3], [2, 1]]]]);
  assert.deepEqual(shapes.lines, [[[6, 5], [8, 7]]]);
  assert.equal(areaWkt({ polygons: [[[[2, 1], [2, 3], [4, 3], [2, 1]]]], lines: [] }), "MULTIPOLYGON(((1 2,3 2,3 4,1 2)))");
  assert.equal(areaWkt({ polygons: [], lines: [[[6, 5], [8, 7]]] }), "MULTILINESTRING((5 6,7 8))");
});

test("the base map paints the areas under the streets, the largest land first, water and buildings over it, holes left open", () => {
  const residential = area("residential", [square(0, 0, 400)]);
  const park = area("park", [square(0, 0, 80), square(0, 0, 20)]);
  const water = area("water", [square(0, 0, 10)]);
  const building = area("building", [square(150, 150, 8)]);
  const stream: BaseMapArea = { kind: "stream", polygons: [], lines: [[at(-300, -300), at(300, 300)]], areaM2: 0 };
  const street: BaseMapWay = { name: "Calle Inventada", highway: "residential", g: [at(-100, -500), at(-100, 500)] };
  const svg = baseMapSvg(SUBJECT, 17, [street], { areas: [building, water, park, stream, residential] });
  const order = ["#e0dfdf", "#c8facc", "#aad3df\" fill-rule", "stroke=\"#aad3df\"", "#d9d0c9", 'stroke="#bbbbbb"', 'stroke="#ffffff"'].map((needle) => svg.indexOf(needle));
  assert.ok(order.every((index) => index > 0), `every layer is drawn (${order})`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, "residential, park, water, stream, building, then the street's edge and fill");
  assert.match(svg, /fill="#c8facc" fill-rule="evenodd"/, "the park's hole stays open");
  assert.match(svg, /fill="#d9d0c9" fill-rule="evenodd" stroke="#c4b6ab"/, "buildings with their edge");
  // A wide frame: no buildings, and what is smaller than a few pixels is left out.
  const wide = baseMapSvg(SUBJECT, 13, [], { areas: [building, park, residential] });
  assert.doesNotMatch(wide, /#d9d0c9/);
  assert.ok(minimumAreaM2(13, SUBJECT[0]) > 400 && minimumAreaM2(17, SUBJECT[0]) < 10);
  assert.doesNotMatch(baseMapSvg(SUBJECT, 13, [], { areas: [area("pitch", [square(0, 0, 2)])] }), /#aae0cb/);
  // Without areas, the land color alone, as before.
  assert.doesNotMatch(baseMapSvg(SUBJECT, 17, [street]), /fill-rule/);
});

test("the streets stand out like on the standard map: a white fill between grey edges of carto's width", () => {
  const street: BaseMapWay = { name: "Calle Inventada", highway: "residential", g: [at(0, -500), at(0, 500)] };
  const widths = (zoom: number) => {
    const svg = baseMapSvg(SUBJECT, zoom, [street], { scale: 1 });
    const edge = Number(svg.match(/stroke="#bbbbbb" stroke-width="([\d.]+)"/)?.[1]);
    const fill = Number(svg.match(/stroke="#ffffff" stroke-width="([\d.]+)"/)?.[1]);
    return { edge, fill };
  };
  const micro = widths(17);
  assert.ok(micro.edge >= 13 && micro.edge <= 16, `about 14 px on a micro frame (${micro.edge}); it was 8.6`);
  assert.ok(micro.edge - micro.fill >= 1.8, `a visible grey edge on each side (${micro.edge - micro.fill})`);
  const macro = widths(15);
  assert.ok(macro.edge >= 5 && macro.edge <= 6.5 && macro.edge - macro.fill >= 1.2, `a thinner street on a macro frame, still edged (${macro.edge}/${macro.fill})`);
});

test("the areas come from our copy; from Overpass only while the copy is empty or unreadable", async () => {
  const park = area("park", [square(0, 0, 80)]);
  const asked: string[] = [];
  const source = (patch: Partial<BaseMapAreaSource>): BaseMapAreaSource => ({
    inBox: async (_bounds, kinds, _tolerance, minArea) => {
      asked.push(`db:${kinds.includes("building")}:${minArea.toFixed(1)}`);
      return [park];
    },
    loaded: async () => true,
    overpass: async () => assert.fail("the copy answered"),
    ...patch,
  });
  assert.deepEqual(await baseMapAreas(SUBJECT, 17, source({})), [park]);
  assert.match(asked[0], /^db:true:/);
  assert.deepEqual(await baseMapAreas(SUBJECT, 17, source({ inBox: async () => [] })), [], "loaded but nothing here");
  const fallback = await baseMapAreas(SUBJECT, 15, source({ inBox: async () => [], loaded: async () => false, overpass: async (box, buildings) => (asked.push(`overpass:${buildings}:${box[0].join(",")}`), [park]) }));
  assert.deepEqual(fallback, [park]);
  assert.equal(asked.at(-1), "overpass:false:20.68,-102.38", "a box on the grid; no buildings below zoom 16 from a mirror");
  const broken = await baseMapAreas(SUBJECT, 17, source({ inBox: async () => Promise.reject(new Error("no migration 067")), overpass: async () => [park] }));
  assert.deepEqual(broken, [park]);
});

test("the Overpass fallback answers once per box for a day and never takes the croquis down", async () => {
  let calls = 0;
  const ring = square(0, 0, 50).map(([lat, lon]) => ({ lat, lon }));
  const ok = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ elements: [{ type: "way", id: 1, tags: { leisure: "park" }, geometry: ring }] }), { status: 200 });
  }) as typeof fetch;
  const box: [LatLon, LatLon] = [
    [10.1, 20.1],
    [10.12, 20.12],
  ];
  const first = await overpassAreas(box, false, ok);
  const again = await overpassAreas(box, false, ok);
  assert.equal(first.length, 1);
  assert.equal(again, first);
  assert.equal(calls, 1, "the second frame of the box is served from the cache");
  const error = console.error;
  const warn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  try {
    const down = (async () => new Response("down", { status: 504 })) as typeof fetch;
    assert.deepEqual(await overpassAreas([[10.2, 20.2], [10.22, 20.22]], false, down), [], "every mirror down: no areas, no error");
  } finally {
    console.error = error;
    console.warn = warn;
  }
});

test("the stored croquis carries the park under the streets and the highlighted streets over it", async () => {
  const park = area("park", [square(80, -200, 60)]);
  const street: BaseMapWay = { name: "Calle Inventada", highway: "residential", g: [at(0, -600), at(0, 600)] };
  const input: CroquisRenderInput = {
    kind: "micro",
    center: SUBJECT,
    zoom: 17,
    subject: SUBJECT,
    northArrow: { style: "flecha", corner: "top-right" },
    pins: [],
    streets: { front: "Calle Inventada", streets: [], styles: DEFAULT_HIGHLIGHT_STYLES, names: true },
  };
  const { jpeg } = await renderCroquisImage(input, {
    baseWays: async () => [street],
    baseAreas: async () => [park],
    streetsAround: async () => ({ ways: [{ id: 1, n: "Calle Inventada", r: 4, g: street.g }], radius: 1000, attribution: OSM_ATTRIBUTION }),
  });
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const color = (point: LatLon) => {
    const { x, y } = imagePixel(SUBJECT, 17, point);
    const offset = (Math.round(y * STATIC_MAP_SCALE) * info.width + Math.round(x * STATIC_MAP_SCALE)) * info.channels;
    return [data[offset], data[offset + 1], data[offset + 2]];
  };
  const near = (a: number[], hex: string, tolerance = 14) => [1, 3, 5].every((index, i) => Math.abs(a[i] - parseInt(hex.slice(index, index + 2), 16)) < tolerance);
  assert.ok(near(color(at(80, -200)), AREA_STYLES.park.fill), `the park in its green (${color(at(80, -200))})`);
  assert.ok(near(color(at(-120, 200)), BASE_MAP_BACKGROUND), "the land elsewhere");
  assert.ok(near(color(at(0, 250)), DEFAULT_HIGHLIGHT_STYLES.front.color, 40), "the highlighted street over it all");
});
