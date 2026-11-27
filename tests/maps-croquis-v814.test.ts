/**
 * Video 8.14 (27 nov 2026), the croquis generator: frames between whole
 * zooms, the street names' size, the comparables of each map by market,
 * the subject's name in the legend, the subject's pin in «Letreros», free
 * lines on the map of comparables, and the one line on the satellite view.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import sharp from "sharp";

import { DEFAULT_SUBJECT_LEGEND, comparablePins, comparablesFitFrame, croquisLegend, croquisSettingsSchema, pinsOfMarkets, readCroquisSettings, streetLabelBox, streetLabelFontSize } from "../src/features/maps/croquis";
import { croquisStreets } from "../src/features/maps/croquis-streets";
import { DEFAULT_HIGHLIGHT_STYLES, streetHighlightsSchema, type StreetHighlights } from "../src/features/maps/highlights";
import { frameFromView, isZoomStep, snapZoom } from "../src/features/maps/map-styles";
import { renderCroquisImage } from "../src/features/maps/server/croquis-image.service";
import { STATIC_MAP_SCALE, imagePixel } from "../src/features/maps/static-map";
import type { StreetWay } from "../src/features/maps/streets";
import { OSM_ATTRIBUTION } from "../src/features/maps/streets-osm";
import type { LatLon } from "../src/features/maps/types";

const SUBJECT: LatLon = [20.706, -102.348];
const METER = 1 / 111_195;
const at = (north: number, east: number): LatLon => [SUBJECT[0] + north * METER, SUBJECT[1] + (east * METER) / Math.cos((SUBJECT[0] * Math.PI) / 180)];

test("a croquis frames in quarters of a zoom: the map's view snaps to the quarter, and the requests accept quarters only", () => {
  assert.equal(snapZoom(15.37), 15.25);
  assert.equal(snapZoom(15.4), 15.5);
  assert.deepEqual(frameFromView({ center: SUBJECT, zoom: 16.13 }, SUBJECT).zoom, 16.25);
  assert.ok(isZoomStep(15) && isZoomStep(15.75) && !isZoomStep(15.3));
  const frame = { offset: [0, 0], zoom: 15.5 };
  assert.ok(croquisSettingsSchema.shape.macro.safeParse(frame).success);
  assert.ok(!croquisSettingsSchema.shape.macro.safeParse({ ...frame, zoom: 15.3 }).success);
  // The frames saved before (whole zooms) read the same.
  assert.equal(readCroquisSettings({ ...readCroquisSettings({}), macro: { offset: [0, 0], zoom: 14 } }).macro.zoom, 14);
  // Fitting the comparables now finds the closest quarter, not only a whole zoom.
  const pins = comparablePins([{ type: "TERRENO_VENTA", comparable: { id: "c1", reference: 1, latitude: at(0, 900)[0], longitude: at(0, 900)[1], location: "Calle Inventada 1" } }]);
  const fit = comparablesFitFrame(SUBJECT, pins);
  assert.ok(isZoomStep(fit.zoom));
});

test("the street names: smaller on a wide frame by themselves, the size the appraiser picks when he picks one", () => {
  assert.equal(streetLabelFontSize(17), 13);
  assert.equal(streetLabelFontSize(18), 13);
  assert.equal(streetLabelFontSize(15), 11);
  assert.equal(streetLabelFontSize(12), 9);
  assert.equal(streetLabelFontSize(15, 16), 16);
  const label = { name: "Calle Inventada", point: SUBJECT, angle: 0 };
  const normal = streetLabelBox(SUBJECT, 17, label);
  const small = streetLabelBox(SUBJECT, 17, { ...label, size: 9 });
  assert.ok(small.width < normal.width && small.height < normal.height && small.fontSize === 9, "the band shrinks with its letters");
  assert.ok(streetHighlightsSchema.safeParse({ front: null, streets: [], styles: DEFAULT_HIGHLIGHT_STYLES, names: true, nameSize: 9 }).success);
  assert.ok(!streetHighlightsSchema.safeParse({ front: null, streets: [], styles: DEFAULT_HIGHLIGHT_STYLES, names: true, nameSize: 40 }).success);
  const way: StreetWay = { id: 1, n: "Calle Inventada", r: 4, g: [at(0, -400), at(0, 400)] };
  const highlights: StreetHighlights = { front: "Calle Inventada", streets: [], styles: DEFAULT_HIGHLIGHT_STYLES, names: true };
  assert.equal(croquisStreets("macro", SUBJECT, 15, highlights, [way]).labels[0].size, 11, "automatic on a macro");
  assert.equal(croquisStreets("macro", SUBJECT, 15, { ...highlights, nameSize: 15 }, [way]).labels[0].size, 15, "the chosen size");
});

test("each map carries the markets of comparables the appraiser picks, and the subject's name in the legend is his", () => {
  const pins = comparablePins([
    { type: "TERRENO_VENTA", comparable: { id: "t1", reference: 1, latitude: at(100, 100)[0], longitude: at(100, 100)[1], location: "Lote 1" } },
    { type: "INMUEBLE_VENTA", comparable: { id: "c1", reference: 2, latitude: at(-100, 100)[0], longitude: at(-100, 100)[1], location: "Casa 2" } },
    { type: "INMUEBLE_RENTA", comparable: { id: "r1", reference: 3, latitude: at(100, -100)[0], longitude: at(100, -100)[1], location: "Casa 3" } },
  ]);
  assert.equal(pinsOfMarkets(pins, undefined).length, 3, "no choice: all of them");
  assert.equal(pinsOfMarkets(pins, []).length, 3);
  assert.deepEqual(pinsOfMarkets(pins, ["INMUEBLE_VENTA", "INMUEBLE_RENTA"]).map((pin) => pin.type), ["INMUEBLE_VENTA", "INMUEBLE_RENTA"]);
  assert.equal(croquisLegend(SUBJECT, 17, pins)[0].label, DEFAULT_SUBJECT_LEGEND);
  assert.equal(croquisLegend(SUBJECT, 17, pins, "Bien sujeto")[0].label, "Bien sujeto");
  const settings = readCroquisSettings({ ...readCroquisSettings({}), markets: { comparables: ["TERRENO_VENTA"] }, subjectLegend: "Bien valuado" });
  assert.deepEqual(settings.markets, { comparables: ["TERRENO_VENTA"] });
  assert.equal(settings.subjectLegend, "Bien valuado");
  // Settings stored before have neither.
  assert.deepEqual(readCroquisSettings({ clean: true }).markets, {});
  assert.equal(readCroquisSettings({ clean: true }).subjectLegend, "");
});

test("the map of comparables carries the free lines too", async () => {
  const lines = [{ id: "l1", color: "#d35400", weight: 6, points: [at(30, -250), at(30, -120)] }];
  const pins = comparablePins([{ type: "TERRENO_VENTA", comparable: { id: "t1", reference: 1, latitude: at(-80, 200)[0], longitude: at(-80, 200)[1], location: "Lote 1" } }]);
  const { jpeg } = await renderCroquisImage(
    { kind: "comparables", center: SUBJECT, zoom: 17, subject: SUBJECT, northArrow: { style: "flecha", corner: "top-right" }, pins, streets: { front: null, streets: [], styles: DEFAULT_HIGHLIGHT_STYLES, names: true }, lines },
    { baseWays: async () => [], streetsAround: async () => ({ ways: [], radius: 1000, attribution: OSM_ATTRIBUTION }) },
  );
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const { x, y } = imagePixel(SUBJECT, 17, at(30, -185));
  const offset = (Math.round(y * STATIC_MAP_SCALE) * info.width + Math.round(x * STATIC_MAP_SCALE)) * info.channels;
  const color = [data[offset], data[offset + 1], data[offset + 2]];
  assert.ok(Math.abs(color[0] - 0xd3) < 40 && Math.abs(color[1] - 0x54) < 40 && Math.abs(color[2] - 0x00) < 40, `the free line in its color (${color})`);
});

test("the generator draws the subject as the stored pin, offers − and + by quarters, the names' size and the markets, and says why satellite is not kept", () => {
  const editor = readFileSync("src/features/maps/components/croquis-label-editor.tsx", "utf8");
  assert.match(editor, /SUBJECT_PIN_PATH/);
  assert.doesNotMatch(editor, /<circle cx=\{pin\.x\} cy=\{pin\.y\} r=\{7\}/, "no longer a dot");
  const parts = readFileSync("src/features/maps/components/croquis-generator-parts.tsx", "utf8");
  assert.match(parts, /Acercar un cuarto de zoom/);
  assert.match(parts, /Comparables en cada mapa/);
  assert.match(parts, /Nombre del inmueble en la simbología/);
  assert.match(readFileSync("src/features/maps/components/street-highlights.tsx", "utf8"), /Tamaño de los nombres/);
  assert.match(readFileSync("src/features/maps/components/croquis-generator.tsx", "utf8"), /La vista satélite es solo para ver en pantalla: los términos de Google no permiten guardar sus imágenes/);
  assert.match(readFileSync("src/features/maps/components/subject-map.tsx", "utf8"), /isFractionalZoomEnabled: true/);
  // A new image takes the whole width.
  assert.match(readFileSync("src/features/valuations/components/workspace/hooks/use-image-mutations.ts", "utf8"), /layoutWidth: "full" as const/);
});
