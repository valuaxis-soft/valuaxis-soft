/**
 * Etapa 1 of the maps: the croquis model (settings, numbered pins, the
 * overlay of the image), the shared Static API URL, the north arrow the
 * server composes, where the croquis images go in the document, how the pin
 * persists with the subject property and which pages get Google's sources
 * in the CSP.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { AppSection } from "../src/features/valuations/model";
import { createInitialSections } from "../src/features/valuations/sections";
import { normalizeEditorSections } from "../src/features/valuations/components/workspace/model/section-numbering";
import {
  COMPARABLES_FRAME,
  CROQUIS_IMAGE_IDS,
  CROQUIS_KINDS,
  DEFAULT_CROQUIS_SETTINGS,
  comparablePins,
  croquisSettingsSchema,
  pinsForCroquis,
  pinsInFrame,
  pinsOverlaySvg,
  readCroquisSettings,
  type ComparableForPin,
} from "../src/features/maps/croquis";
import { findCroquisImage, withCroquisImage } from "../src/features/maps/croquis-document";
import { DEFAULT_STREET_HIGHLIGHTS } from "../src/features/maps/highlights";
import { MACRO_FRAME, MICRO_FRAME } from "../src/features/maps/map-styles";
import { NORTH_ARROW_BOX, northArrowPlacement, northArrowSvg } from "../src/features/maps/north-arrow-symbols";
import { STATIC_MAP_SIZE, imagePosition, staticColor, staticMapUrl } from "../src/features/maps/static-map";
import { readSubjectCroquisSettings, readSubjectLocation, subjectLocationInputSchema, withSubjectLocation } from "../src/features/maps/subject-location";
import { googleMapsPage } from "../src/security/headers/security-headers";

const SUBJECT: [number, number] = [20.63442, -103.40239];

const rows: ComparableForPin[] = [
  { type: "INMUEBLE_VENTA", comparable: { id: "b", reference: 2, latitude: 20.6351, longitude: -103.4031, location: "Calle Ópalo 12" } },
  { type: "INMUEBLE_VENTA", comparable: { id: "a", reference: 1, latitude: 20.6349, longitude: -103.4019, location: "Calle Perla 40" } },
  { type: "TERRENO_VENTA", comparable: { id: "t", reference: 1, latitude: 20.6338, longitude: -103.4044, location: "Lote 5" } },
  { type: "INMUEBLE_RENTA", comparable: { id: "n", reference: 1, latitude: null, longitude: null, location: "Sin coordenadas" } },
  { type: "TERRENO_RENTA", comparable: { id: "x", reference: 3, latitude: 95, longitude: -103.4, location: "Latitud imposible" } },
];

test("comparables become numbered pins by market and reference; those without coordinates are left out", () => {
  const pins = comparablePins(rows);
  assert.deepEqual(
    pins.map((pin) => [pin.label, pin.type, pin.id]),
    [["C-1", "TERRENO_VENTA", "t"], ["C-1", "INMUEBLE_VENTA", "a"], ["C-2", "INMUEBLE_VENTA", "b"]],
  );
  assert.deepEqual(pins[1].point, [20.6349, -103.4019]);
  // The croquis carry them only when asked; the map of comparables always.
  assert.equal(pinsForCroquis("macro", { includeComparables: false }, pins).length, 0);
  assert.equal(pinsForCroquis("micro", { includeComparables: true }, pins).length, 3);
  assert.equal(pinsForCroquis("comparables", { includeComparables: false }, pins).length, 3);
});

test("the overlay draws each pin where its point falls on the image, with its number, and skips the ones outside", () => {
  const pins = comparablePins(rows);
  const svg = pinsOverlaySvg(SUBJECT, 17, pins);
  assert.match(svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" width="${STATIC_MAP_SIZE.width * 2}" height="${STATIC_MAP_SIZE.height * 2}"`));
  assert.equal((svg.match(/<circle/g) ?? []).length, 3);
  assert.match(svg, />C-2</);
  // C-1 of the buildings: 0.0005° north-east of the subject → right of and above the center, in the image's pixels.
  const at = imagePosition(SUBJECT, 17, pins[1].point)!;
  assert.ok(at.x > 0.5 && at.y < 0.5);
  const circles = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)].map((match) => [Number(match[1]), Number(match[2])]);
  assert.ok(circles.some(([x, y]) => Math.abs(x - at.x * STATIC_MAP_SIZE.width * 2) < 0.1 && Math.abs(y - at.y * STATIC_MAP_SIZE.height * 2) < 0.1));
  // At a macro zoom the far ones still fit; very close, none of them does.
  assert.equal(pinsInFrame(SUBJECT, 15, pins).length, 3);
  assert.equal(pinsInFrame(SUBJECT, 21, pins).length, 0);
  assert.equal((pinsOverlaySvg(SUBJECT, 21, pins).match(/<circle/g) ?? []).length, 0);
  // Text is escaped.
  const hostile = pinsOverlaySvg(SUBJECT, 17, [{ ...pins[0], label: "<b>" }]);
  assert.match(hostile, /&lt;b&gt;/);
});

test("the settings default to the demonstration's frames and read back what is valid, piece by piece", () => {
  assert.deepEqual(DEFAULT_CROQUIS_SETTINGS, { macro: MACRO_FRAME, micro: MICRO_FRAME, comparables: COMPARABLES_FRAME, clean: true, northArrow: { style: "flecha", corner: "top-right" }, includeComparables: false, streets: DEFAULT_STREET_HIGHLIGHTS });
  assert.deepEqual(CROQUIS_KINDS.map((item) => item.kind), ["macro", "micro", "comparables"]);
  assert.equal(CROQUIS_KINDS[0].caption, "Croquis de macrolocalización");
  assert.deepEqual(readCroquisSettings(undefined), DEFAULT_CROQUIS_SETTINGS);
  const partial = readCroquisSettings({ clean: false, macro: { offset: [0.001, -0.002], zoom: 14 }, micro: { offset: ["x"], zoom: 99 }, northArrow: { style: "aguja", corner: "bottom-left" } });
  assert.equal(partial.clean, false);
  assert.deepEqual(partial.macro, { offset: [0.001, -0.002], zoom: 14 });
  assert.deepEqual(partial.micro, MICRO_FRAME, "an invalid frame takes the default");
  assert.deepEqual(partial.northArrow, { style: "aguja", corner: "bottom-left" });
  assert.ok(croquisSettingsSchema.safeParse(partial).success);
  assert.equal(croquisSettingsSchema.safeParse({ ...partial, northArrow: { style: "otro", corner: "top-left" } }).success, false);
});

test("the pin and the settings persist in the subject property's characteristics, beside the own-kind names", () => {
  const before = { tipoBienOtro: "Rancho", otra: 1 };
  const now = new Date("2026-11-04T12:00:00Z");
  const placed = withSubjectLocation(before, { location: { point: SUBJECT, address: "  Calle Perla 3890 ", source: "busqueda" } }, now);
  assert.equal(placed.tipoBienOtro, "Rancho");
  assert.equal(placed.otra, 1);
  assert.deepEqual(readSubjectLocation(placed), { point: SUBJECT, address: "Calle Perla 3890", source: "busqueda", updatedAt: "2026-11-04T12:00:00.000Z" });
  assert.deepEqual(readSubjectCroquisSettings(placed), DEFAULT_CROQUIS_SETTINGS);
  // Dragged by hand: no address. The settings change without touching the pin.
  const dragged = withSubjectLocation(placed, { location: { point: [20.64, -103.4], source: "pin" }, croquis: { ...DEFAULT_CROQUIS_SETTINGS, clean: false } }, now);
  assert.equal(readSubjectLocation(dragged)?.address, null);
  const settingsOnly = withSubjectLocation(dragged, { croquis: { ...DEFAULT_CROQUIS_SETTINGS, includeComparables: true } }, now);
  assert.deepEqual(readSubjectLocation(settingsOnly)?.point, [20.64, -103.4]);
  assert.equal(readSubjectCroquisSettings(settingsOnly).includeComparables, true);
  // null removes the pin; anything invalid reads as no pin.
  assert.equal(readSubjectLocation(withSubjectLocation(settingsOnly, { location: null }, now)), null);
  assert.equal(readSubjectLocation({ ubicacion: { point: [200, 0], source: "pin", address: null, updatedAt: "x" } }), null);
  assert.equal(readSubjectLocation("texto"), null);
  // What the editor sends is validated: a latitude beyond 90 is rejected, an empty body is fine.
  assert.equal(subjectLocationInputSchema.safeParse({ location: { point: [91, 0], source: "pin" } }).success, false);
  assert.ok(subjectLocationInputSchema.safeParse({}).success);
});

test("the shared Static API URL: center, zoom, size at scale 2, colored markers, the red pin and clean styles", () => {
  const url = new URL(staticMapUrl({ apiKey: "k", center: [20.6354, -103.4034], zoom: 15, subject: SUBJECT, clean: true, markers: [{ color: "#1f7ac2", points: [[20.635, -103.403]] }, { color: "#2f8a4f", points: [] }] }));
  assert.equal(url.searchParams.get("center"), "20.635400,-103.403400");
  assert.equal(url.searchParams.get("scale"), "2");
  assert.deepEqual(url.searchParams.getAll("markers"), ["size:tiny|color:0x1f7ac2|20.635000,-103.403000", "color:red|20.634420,-103.402390"]);
  assert.equal(url.searchParams.getAll("style").length, 6);
  assert.equal(staticColor("#C0392B", "e6"), "0xc0392be6");
  // Without a subject there is no red pin (the map of comparables of another feature could use it).
  assert.equal(new URL(staticMapUrl({ apiKey: "k", center: SUBJECT, zoom: 15, subject: null })).searchParams.has("markers"), false);
});

test("the north arrow the server composes: a complete SVG of the chosen symbol, placed in the chosen corner", () => {
  const svg = northArrowSvg("punta", 64);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="48" height="72" viewBox="-4 -2 48 68"/);
  assert.match(svg, /<text[^>]*>N<\/text>/);
  assert.match(northArrowSvg("aguja", 32), /<circle/);
  assert.doesNotMatch(northArrowSvg("flecha", 32), /<circle/);
  assert.deepEqual(NORTH_ARROW_BOX, { width: 40, height: 64 });
  const image = { width: 1280, height: 800 };
  const symbol = { width: 60, height: 96 };
  assert.deepEqual(northArrowPlacement("top-right", image, symbol, 20), { left: 1200, top: 20 });
  assert.deepEqual(northArrowPlacement("top-left", image, symbol, 20), { left: 20, top: 20 });
  assert.deepEqual(northArrowPlacement("bottom-right", image, symbol, 20), { left: 1200, top: 684 });
  assert.deepEqual(northArrowPlacement("bottom-left", image, symbol, 20), { left: 20, top: 684 });
});

function sections(): AppSection[] {
  return normalizeEditorSections(createInitialSections());
}

test("the macro and micro croquis go side by side in the Croquis section; a new capture replaces the image and keeps the appraiser's caption", () => {
  const first = withCroquisImage(sections(), "macro", "/api/archivos/imagen?key=uploads/macro-1.jpg");
  assert.ok(first.placed);
  const both = withCroquisImage(first.sections, "micro", "/api/archivos/imagen?key=uploads/micro-1.jpg");
  const croquis = both.sections.find((section) => section.id === "croquisComparables")!;
  const block = croquis.blocks[0];
  const macro = block.images.find((image) => image.id === CROQUIS_IMAGE_IDS.macro)!;
  const micro = block.images.find((image) => image.id === CROQUIS_IMAGE_IDS.micro)!;
  assert.equal(macro.captionText, "Croquis de macrolocalización");
  assert.equal(macro.captionEnabled, true);
  assert.deepEqual(micro.captions?.map((caption) => caption.text), ["Croquis de microlocalización"]);
  // One row, two columns: they print as a pair.
  const row = block.contentLayout!.rows.find((item) => item.columns.some((column) => column.items.some((ref) => ref.id === macro.id)))!;
  assert.deepEqual(row.columns.map((column) => column.items.map((ref) => ref.id)), [[macro.id], [micro.id]]);
  assert.equal(block.contentLayout!.rows.filter((item) => item.columns.some((column) => column.items.some((ref) => ref.id === micro.id))).length, 1);
  assert.ok(block.blockFlow!.rows.some((item) => item.items.some((ref) => ref.type === "content-row" && ref.rowId === row.id)));
  // The template's own image stays.
  assert.ok(block.images.some((image) => image.id === "croquis-comparable-01"));

  // Taken again, with the caption the appraiser wrote: same id, new file, same caption.
  const renamed = both.sections.map((section) =>
    section.id !== "croquisComparables" ? section : { ...section, blocks: section.blocks.map((item) => ({ ...item, images: item.images.map((image) => (image.id === macro.id ? { ...image, captionText: "Macro de la zona", rotation: 90 as const } : image)) })) },
  );
  const again = withCroquisImage(renamed, "macro", "/api/archivos/imagen?key=uploads/macro-2.jpg");
  const replaced = findCroquisImage(again.sections, "macro")!;
  assert.equal(replaced.src, "/api/archivos/imagen?key=uploads/macro-2.jpg");
  assert.equal(replaced.captionText, "Macro de la zona");
  assert.equal(replaced.rotation, 90);
  assert.equal(again.sections.find((section) => section.id === "croquisComparables")!.blocks[0].images.filter((image) => image.id === macro.id).length, 1);
  assert.equal(findCroquisImage(sections(), "macro"), null);
});

test("the map of comparables goes in its annex, and a removed section places nothing", () => {
  const placed = withCroquisImage(sections(), "comparables", "/api/archivos/imagen?key=uploads/comparables.jpg");
  assert.ok(placed.placed);
  const annex = placed.sections.find((section) => section.id === "mapaComparables")!;
  assert.equal(findCroquisImage(placed.sections, "comparables")?.title, "Mapa de comparables");
  assert.ok(annex.blocks[0].contentLayout!.rows.at(-1)!.columns[0].items.some((ref) => ref.id === CROQUIS_IMAGE_IDS.comparables));
  // The Croquis section was not touched.
  assert.equal(findCroquisImage(placed.sections, "macro"), null);

  const without = sections().filter((section) => section.id !== "mapaComparables");
  const missing = withCroquisImage(without, "comparables", "x");
  assert.equal(missing.placed, false);
  assert.deepEqual(missing.sections, without);
  const removed = sections().map((section) => (section.id === "croquisComparables" ? { ...section, removed: true } : section));
  assert.equal(withCroquisImage(removed, "micro", "x").placed, false);
});

test("Google's sources in the CSP: the maps demonstration and the editor, nowhere else", () => {
  assert.ok(googleMapsPage("/demo/mapas-k7q2vx"));
  assert.ok(googleMapsPage("/workspace"));
  assert.equal(googleMapsPage("/workspace/preview-window"), false);
  assert.equal(googleMapsPage("/avaluos/123/dictamen"), false);
  assert.equal(googleMapsPage("/dashboard"), false);
  assert.equal(googleMapsPage("/"), false);
});
