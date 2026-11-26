/**
 * Legal matrix 1.5 bis «Mapas y croquis» (25 nov 2026): no stored croquis
 * carries a Google Maps image. The croquis is drawn by us from OpenStreetMap
 * data, with the credit «© colaboradores de OpenStreetMap», and the
 * highlighted streets, free lines, names, pins and north arrow over it.
 * Rendering asks nobody for anything: every request is recorded and must
 * stay empty, Google's hosts above all.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import sharp from "sharp";

import { SUBJECT_PIN_COLOR, comparablePins } from "../src/features/maps/croquis";
import { DEFAULT_HIGHLIGHT_STYLES, type StreetHighlights } from "../src/features/maps/highlights";
import { BASE_MAP_BACKGROUND, OSM_CROQUIS_ATTRIBUTION, attributionBox, attributionSvg, baseMapHighways, baseMapSvg, type BaseMapWay } from "../src/features/maps/osm-base-map";
import { renderCroquisImage, resolveCroquisStreets, type CroquisRenderInput, type CroquisSources } from "../src/features/maps/server/croquis-image.service";
import { baseMapWays, type BaseMapSource } from "../src/features/maps/server/osm-base.service";
import { STATIC_MAP_SCALE, STATIC_MAP_SIZE, imagePixel } from "../src/features/maps/static-map";
import { spellingKey, withUnifiedSpellings } from "../src/features/maps/street-names";
import type { StreetWay } from "../src/features/maps/streets";
import { OSM_ATTRIBUTION, parseOverpassWays } from "../src/features/maps/streets-osm";
import type { LatLon } from "../src/features/maps/types";

const SUBJECT: LatLon = [20.63442, -103.40239];
/** Degrees of latitude per meter, near enough here. */
const METER = 1 / 111_195;
const east = (meters: number) => (meters * METER) / Math.cos((SUBJECT[0] * Math.PI) / 180);

/** A made-up block: an avenue 60 m north, a residential street 60 m south, a cross street 80 m east. */
const BASE: BaseMapWay[] = [
  { name: "Avenida Inventada", highway: "primary", g: [[SUBJECT[0] + 60 * METER, SUBJECT[1] - east(600)], [SUBJECT[0] + 60 * METER, SUBJECT[1] + east(600)]] },
  { name: "Calle Ficticia", highway: "residential", g: [[SUBJECT[0] - 60 * METER, SUBJECT[1] - east(600)], [SUBJECT[0] - 60 * METER, SUBJECT[1] + east(600)]] },
  { name: "Calle Cruzada", highway: "residential", g: [[SUBJECT[0] - 400 * METER, SUBJECT[1] + east(80)], [SUBJECT[0] + 400 * METER, SUBJECT[1] + east(80)]] },
];
const AROUND: StreetWay[] = BASE.map((way, index) => ({ id: index + 1, n: way.name, r: way.highway === "primary" ? 1 : 4, g: way.g }));

const sources: CroquisSources = {
  baseWays: async () => BASE,
  streetsAround: async () => ({ ways: AROUND, radius: 1000, attribution: OSM_ATTRIBUTION }),
};

const highlights: StreetHighlights = { front: "Calle Ficticia", streets: [{ name: "Avenida Inventada", category: "principal" }], styles: DEFAULT_HIGHLIGHT_STYLES, names: true };

const input = (patch: Partial<CroquisRenderInput> = {}): CroquisRenderInput => ({
  kind: "micro",
  center: SUBJECT,
  zoom: 17,
  subject: SUBJECT,
  northArrow: { style: "flecha", corner: "top-right" },
  pins: [],
  streets: highlights,
  ...patch,
});

let requested: string[] = [];
const realFetch = globalThis.fetch;
beforeEach(() => {
  requested = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    requested.push(String(url instanceof Request ? url.url : url));
    throw new Error("the croquis must not ask the network for anything");
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function pixels(jpeg: Buffer) {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  return (x: number, y: number) => {
    const offset = (Math.round(y * STATIC_MAP_SCALE) * info.width + Math.round(x * STATIC_MAP_SCALE)) * info.channels;
    return [data[offset], data[offset + 1], data[offset + 2]];
  };
}
const hex = (color: string) => [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
const near = (a: number[], b: number[], tolerance = 40) => a.every((value, index) => Math.abs(value - b[index]) < tolerance);

test("the stored croquis is drawn without a single request: no Google, no tile server", async () => {
  const { jpeg } = await renderCroquisImage(input({ lines: [{ id: "l1", color: "#d35400", weight: 5, points: [[SUBJECT[0] + 20 * METER, SUBJECT[1] - east(200)], [SUBJECT[0] + 20 * METER, SUBJECT[1] - east(100)]] }] }), sources);
  assert.deepEqual(requested, []);
  assert.ok(!requested.some((url) => /google|gstatic/i.test(url)));
  const metadata = await sharp(jpeg).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, STATIC_MAP_SIZE.width * STATIC_MAP_SCALE, "the same size as the Static API image it replaces");
  assert.equal(metadata.height, STATIC_MAP_SIZE.height * STATIC_MAP_SCALE);
});

test("the image carries the base map, the overlays and the credit to OpenStreetMap", async () => {
  const lines = [{ id: "l1", color: "#d35400", weight: 6, points: [[SUBJECT[0] + 20 * METER, SUBJECT[1] - east(200)], [SUBJECT[0] + 20 * METER, SUBJECT[1] - east(120)]] as LatLon[] }];
  const pins = comparablePins([{ type: "INMUEBLE_VENTA", comparable: { id: "c1", reference: 1, latitude: SUBJECT[0] + 20 * METER, longitude: SUBJECT[1] + east(150), location: "Calle Ficticia 10" } }]);
  const { jpeg } = await renderCroquisImage(input({ lines, pins }), sources);
  const at = await pixels(jpeg);
  // The land, away from every street.
  const land = imagePixel(SUBJECT, 17, [SUBJECT[0] - 130 * METER, SUBJECT[1] - east(300)]);
  assert.ok(near(at(land.x, land.y), hex(BASE_MAP_BACKGROUND), 12), "the OpenStreetMap land color");
  // A street of the base map that is not highlighted: its white fill.
  const cross = imagePixel(SUBJECT, 17, [SUBJECT[0] + 200 * METER, SUBJECT[1] + east(80)]);
  assert.ok(near(at(cross.x, cross.y), [255, 255, 255], 20), "the cross street drawn in white");
  // The highlighted streets in their colors: the front street in red, the avenue in blue.
  const front = imagePixel(SUBJECT, 17, [SUBJECT[0] - 60 * METER, SUBJECT[1] - east(250)]);
  assert.ok(near(at(front.x, front.y), hex(DEFAULT_HIGHLIGHT_STYLES.front.color)), "the front street in its color");
  const avenue = imagePixel(SUBJECT, 17, [SUBJECT[0] + 60 * METER, SUBJECT[1] + east(250)]);
  assert.ok(near(at(avenue.x, avenue.y), hex(DEFAULT_HIGHLIGHT_STYLES.principal.color)), "the avenue in its color");
  // The free line, the comparable's pin, the subject's drop on top.
  const line = imagePixel(SUBJECT, 17, [SUBJECT[0] + 20 * METER, SUBJECT[1] - east(160)]);
  assert.ok(near(at(line.x, line.y), hex("#d35400")), "the free line");
  const pin = imagePixel(SUBJECT, 17, pins[0].point);
  assert.ok(near(at(pin.x, pin.y), hex("#1f7ac2")), "the comparable's pin");
  const subject = imagePixel(SUBJECT, 17, SUBJECT);
  assert.ok(near(at(subject.x, subject.y - 16), hex(SUBJECT_PIN_COLOR)), "the subject's drop");
  // The north arrow, black on its card, in its corner.
  let dark = 0;
  for (let y = 14; y < 70; y += 2) for (let x = STATIC_MAP_SIZE.width - 50; x < STATIC_MAP_SIZE.width - 10; x += 2) if (at(x, y).every((value) => value < 60)) dark += 1;
  assert.ok(dark > 20, `the north arrow is drawn (${dark} dark samples)`);
  // The credit: a white band with dark letters, bottom right.
  const box = attributionBox("top-right");
  assert.equal(box.x + box.width, STATIC_MAP_SIZE.width);
  let white = 0;
  let letters = 0;
  for (let y = box.y + 1; y < box.y + box.height - 1; y += 1) {
    for (let x = box.x + 2; x < box.x + box.width - 2; x += 1) {
      const color = at(x, y);
      if (color.every((value) => value > 235)) white += 1;
      else if (color.every((value) => value < 120)) letters += 1;
    }
  }
  assert.ok(white > 200 && letters > 30, `the credit is drawn (${white} white, ${letters} dark)`);
  assert.match(attributionSvg("top-right"), new RegExp(OSM_CROQUIS_ATTRIBUTION));
  assert.equal(OSM_CROQUIS_ATTRIBUTION, "© colaboradores de OpenStreetMap");
  // With the north arrow at the bottom right, the credit moves to the left.
  assert.equal(attributionBox("bottom-right").x, 0);
});

test("the base map draws streets by class and names them where they fit, never under what the croquis prints over them", () => {
  const svg = baseMapSvg(SUBJECT, 17, BASE);
  assert.match(svg, new RegExp(`fill="${BASE_MAP_BACKGROUND}"`));
  assert.match(svg, /stroke="#fcd6a4"/, "the avenue (primary) in the OpenStreetMap orange");
  assert.match(svg, /stroke="#ffffff"/, "the residential streets in white");
  assert.match(svg, />Avenida Inventada</);
  assert.match(svg, />Calle Cruzada</);
  // A highlighted street prints its own band: no second name.
  assert.doesNotMatch(baseMapSvg(SUBJECT, 17, BASE, { namedElsewhere: new Set(["Avenida Inventada"]) }), />Avenida Inventada</);
  // Something over the whole image (a legend, say): no name fits.
  const everywhere = { x: STATIC_MAP_SIZE.width / 2, y: STATIC_MAP_SIZE.height / 2, halfX: STATIC_MAP_SIZE.width, halfY: STATIC_MAP_SIZE.height };
  assert.doesNotMatch(baseMapSvg(SUBJECT, 17, BASE, { obstacles: [everywhere] }), /<text/);
  // A wide frame leaves the residential streets out, of the drawing and of the query.
  assert.ok(baseMapHighways(17).includes("residential"));
  assert.ok(!baseMapHighways(11).includes("residential") && baseMapHighways(11).includes("primary") && baseMapHighways(11).includes("motorway_link"));
  assert.doesNotMatch(baseMapSvg(SUBJECT, 11, BASE), />Calle Ficticia</);
  // Names are escaped: nothing in OpenStreetMap can break the image.
  assert.match(baseMapSvg(SUBJECT, 17, [{ ...BASE[0], name: "Calle <Uno> & Dos" }]), /Calle &lt;Uno&gt; &amp; Dos/);
});

test("the base map's streets come from our copy; the named streets around the frame only while the copy is empty", async () => {
  const asked: string[] = [];
  const loaded: BaseMapSource = {
    inBox: async (_bounds, highways) => {
      asked.push(`box:${highways.length}`);
      return BASE;
    },
    loaded: async () => true,
    around: async () => assert.fail("the copy answered"),
  };
  assert.deepEqual(await baseMapWays(SUBJECT, 17, loaded), BASE);
  // Loaded but empty here (the open sea): an empty map, no fallback.
  assert.deepEqual(await baseMapWays(SUBJECT, 17, { ...loaded, inBox: async () => [] }), []);
  // Never loaded (a fresh server): the named streets around the frame, as classes of the base map.
  const fallback = await baseMapWays(SUBJECT, 17, { inBox: async () => [], loaded: async () => false, around: async (_point, radius) => (radius <= 2000 ? AROUND : []) });
  assert.deepEqual(fallback.map((way) => [way.name, way.highway]), [["Avenida Inventada", "primary"], ["Calle Ficticia", "residential"], ["Calle Cruzada", "residential"]]);
  assert.deepEqual(asked, ["box:" + baseMapHighways(17).length]);
});

test("one street spelled with and without accents gets one name, the accented one, on the croquis and its base map", async () => {
  // Two carriageways of one avenue as OpenStreetMap names them, and a lower-case variant.
  const north: LatLon[] = [[SUBJECT[0] + 30 * METER, SUBJECT[1] - east(500)], [SUBJECT[0] + 30 * METER, SUBJECT[1] + east(500)]];
  const south: LatLon[] = [[SUBJECT[0] + 22 * METER, SUBJECT[1] + east(500)], [SUBJECT[0] + 22 * METER, SUBJECT[1] - east(500)]];
  const geometry = (line: LatLon[]) => line.map(([lat, lon]) => ({ lat, lon }));
  const ways = parseOverpassWays([
    { type: "way", id: 1, tags: { name: "Circunvalacion Agustin Yañez", highway: "primary" }, geometry: geometry(north) },
    { type: "way", id: 2, tags: { name: "Circunvalación Agustín Yáñez", highway: "primary" }, geometry: geometry(south) },
    { type: "way", id: 3, tags: { name: "circunvalación agustín yáñez.", highway: "primary_link" }, geometry: geometry(south) },
  ]);
  assert.deepEqual([...new Set(ways.map((way) => way.n))], ["Circunvalación Agustín Yáñez"]);
  assert.equal(spellingKey("Circunvalacion  Agustin Yañez"), spellingKey("circunvalación agustín yáñez."));
  assert.deepEqual(withUnifiedSpellings([{ n: "Calle Hidalgo", r: 4, g: north }, { n: "Calle Morelos", r: 4, g: south }]).map((way) => way.n), ["Calle Hidalgo", "Calle Morelos"], "different streets stay apart");

  // Highlighted with the variant without accents (as stored before), from pieces still spelled both ways: one band, accented.
  const streets = await resolveCroquisStreets(
    input({ streets: { front: null, streets: [{ name: "Circunvalacion Agustin Yañez", category: "principal" }, { name: "Circunvalación Agustín Yáñez", category: "secundaria" }], styles: DEFAULT_HIGHLIGHT_STYLES, names: true } }),
    async () => ({ ways: [{ id: 1, n: "Circunvalacion Agustin Yañez", r: 1, g: north }, { id: 2, n: "Circunvalación Agustín Yáñez", r: 1, g: south }], radius: 1000, attribution: OSM_ATTRIBUTION }),
  );
  assert.deepEqual(streets.labels.map((label) => label.name), ["Circunvalación Agustín Yáñez"]);
  assert.equal(streets.paths.length, 2, "both carriageways are highlighted");
  assert.ok(streets.paths.every((path) => path.color === DEFAULT_HIGHLIGHT_STYLES.principal.color), "in the first paint");

  // The base map: one name for both spellings, and none when the band already names it in another spelling.
  const base: BaseMapWay[] = [{ name: "Circunvalacion Agustin Yañez", highway: "primary", g: north }, { name: "Circunvalación Agustín Yáñez", highway: "primary", g: south }];
  const svg = baseMapSvg(SUBJECT, 17, base);
  assert.equal((svg.match(/>Circunvalación Agustín Yáñez</g) ?? []).length, 2, "one name, drawn as halo and letters");
  assert.doesNotMatch(svg, /Circunvalacion Agustin/);
  assert.doesNotMatch(baseMapSvg(SUBJECT, 17, base, { namedElsewhere: new Set(["Circunvalacion Agustin Yañez"]) }), /<text/);
});
