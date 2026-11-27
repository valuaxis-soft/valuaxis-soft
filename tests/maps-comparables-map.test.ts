/**
 * Grok audit, week 8 (24 nov 2026): the map of comparables carries every
 * comparable with its number and a legend in a free corner, its frame fits
 * them (or the generator says which are left out), the street names keep
 * clear of each other and of the pins and can be placed by hand and kept,
 * the subject's street has one spelling, and the photographs print two per
 * row with their captions.
 */
import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  COMPARABLES_FRAME,
  COMPARABLE_PIN_COLORS,
  SUBJECT_PIN_COLOR,
  comparablePins,
  comparablesFitFrame,
  croquisLegend,
  croquisLegendPlacement,
  legendBox,
  legendCorner,
  pinNumbers,
  pinsOutsideFrame,
  pinsOverlaySvg,
  readCroquisSettings,
  streetLabelBox,
  subjectPinSvg,
  type ComparableForPin,
} from "../src/features/maps/croquis";
import { croquisStreets } from "../src/features/maps/croquis-streets";
import { DEFAULT_HIGHLIGHT_STYLES, withMovedLabel, type StreetHighlights } from "../src/features/maps/highlights";
import { MICRO_FRAME, frameCenter } from "../src/features/maps/map-styles";
import { composeCroquisImage } from "../src/features/maps/server/croquis-image.service";
import { STATIC_MAP_SIZE, imagePixel } from "../src/features/maps/static-map";
import { addressStreet, preferredStreetName, sameStreet, withPreferredStreetNames } from "../src/features/maps/street-names";
import type { StreetWay } from "../src/features/maps/streets";
import type { Block, ImageContent } from "../src/features/valuations/model";
import { isPhotoBlock, pairedPhotoRows, photoCaption, photoGridBlock } from "../src/features/valuations/services/photo-layout";
import { resolveContentLayout } from "../src/features/valuations/services/content-layout";

const SUBJECT: [number, number] = [20.63442, -103.40239];
/** Degrees of latitude per meter, near enough here. */
const METER = 1 / 111_195;
const east = (meters: number) => (meters * METER) / Math.cos((SUBJECT[0] * Math.PI) / 180);

/** Fifteen made-up comparables up to 2.5 km away, as in the audited valuation: land 1–5, buildings 1–8, rent 1–2. */
function auditComparables(): ComparableForPin[] {
  const rows: ComparableForPin[] = [];
  const at = (type: ComparableForPin["type"], reference: number, north: number, eastMeters: number) =>
    rows.push({ type, comparable: { id: `${type}-${reference}`, reference, latitude: SUBJECT[0] + north * METER, longitude: SUBJECT[1] + east(eastMeters), location: `Calle Inventada ${reference}` } });
  [[900, 300], [-1200, 800], [1500, -1500], [-2000, -600], [400, 2500]].forEach(([n, e], index) => at("TERRENO_VENTA", index + 1, n, e));
  [[200, 100], [-300, 600], [700, -900], [-1100, -1300], [1300, 1200], [-1800, 2000], [2100, -300], [-600, -2200]].forEach(([n, e], index) => at("INMUEBLE_VENTA", index + 1, n, e));
  [[50, -80], [-1500, 1700]].forEach(([n, e], index) => at("INMUEBLE_RENTA", index + 1, n, e));
  return rows;
}

test("FAL-10: the default frame of the map of comparables left most of them out silently; the fitted frame shows them all", () => {
  const pins = comparablePins(auditComparables());
  assert.equal(pins.length, 15);
  // What the audit saw: at the old fixed zoom 15 around the subject, most comparables fall outside the image.
  const outside = pinsOutsideFrame(SUBJECT, COMPARABLES_FRAME.zoom, pins);
  assert.ok(outside.length >= 8, `${outside.length} left out at zoom 15`);
  // The fitted frame keeps every one of them and the subject inside, as close as they fit.
  const frame = comparablesFitFrame(SUBJECT, pins);
  const center = frameCenter(frame, SUBJECT);
  assert.deepEqual(pinsOutsideFrame(center, frame.zoom, pins), []);
  const subject = imagePixel(center, frame.zoom, SUBJECT);
  assert.ok(subject.x > 0 && subject.x < STATIC_MAP_SIZE.width && subject.y > 0 && subject.y < STATIC_MAP_SIZE.height);
  const closer = frameCenter(comparablesFitFrame(SUBJECT, pins), SUBJECT);
  assert.ok(pinsOutsideFrame(closer, frame.zoom + 1, pins).length > 0, "one zoom closer some would be left out");
  // Without comparables, the default frame; one comparable next door, the closest zoom allowed.
  assert.deepEqual(comparablesFitFrame(SUBJECT, []), COMPARABLES_FRAME);
  assert.equal(comparablesFitFrame(SUBJECT, pins.slice(13, 14)).zoom, 17);
  // A micro croquis with the comparables at zoom 17 takes none of the far ones: the generator says how many.
  assert.equal(pinsOutsideFrame(SUBJECT, MICRO_FRAME.zoom, pins).length, 13, "only the two next door fit");
});

test("FAL-10: the legend names each market with the numbers its tables print, only for the pins the image shows", () => {
  assert.equal(pinNumbers([3, 1, 2, 5, 7, 8]), "C-1 a C-3, C-5, C-7, C-8");
  assert.equal(pinNumbers([4]), "C-4");
  const pins = comparablePins(auditComparables());
  const frame = comparablesFitFrame(SUBJECT, pins);
  const legend = croquisLegend(frameCenter(frame, SUBJECT), frame.zoom, pins);
  assert.deepEqual(legend.map((entry) => [entry.label, entry.shape]), [
    ["Inmueble valuado", "subject"],
    ["Terrenos en venta: C-1 a C-5", "comparable"],
    ["Inmuebles en venta: C-1 a C-8", "comparable"],
    ["Inmuebles en renta: C-1, C-2", "comparable"],
  ]);
  assert.equal(legend[1].color, COMPARABLE_PIN_COLORS.TERRENO_VENTA);
  // Closer in, only the ones in frame are listed.
  const near = croquisLegend(SUBJECT, 16, pins);
  assert.ok(near.some((entry) => entry.label === "Inmuebles en renta: C-1"));
});

test("FAL-10: the legend takes the free corner: not the north arrow's, and not over the pins", () => {
  const pins = comparablePins(auditComparables());
  const legend = croquisLegend(SUBJECT, 15, pins);
  // A crowd of comparables in the top left corner of the image: the legend leaves it.
  const topLeft = Array.from({ length: 6 }, (_, index) => ({ ...pins[0], id: `x${index}`, point: [SUBJECT[0] + 0.0055 - index * 0.0002, SUBJECT[1] - 0.0115 + index * 0.0003] as [number, number] }));
  assert.equal(legendCorner(legend, "top-right", SUBJECT, 15, topLeft), "bottom-left");
  assert.equal(legendCorner(legend, "top-right", SUBJECT, 15, []), "top-left");
  assert.equal(legendCorner(legend, "top-left", SUBJECT, 15, []), "top-right");
  // A legend at the bottom sits above the credit to OpenStreetMap.
  const bottom = legendBox(legend, "bottom-left");
  assert.ok(bottom.y + bottom.height <= STATIC_MAP_SIZE.height - 20);
  assert.equal(croquisLegendPlacement(SUBJECT, 21, pins, "top-right"), null, "no comparable in frame, no legend");
});

test("FAL-10: the composed image carries the comparables' pins in their color and the legend", async () => {
  const pins = comparablePins(auditComparables());
  const frame = comparablesFitFrame(SUBJECT, pins);
  const center = frameCenter(frame, SUBJECT);
  const scale = 2;
  const base = await sharp({ create: { width: STATIC_MAP_SIZE.width * scale, height: STATIC_MAP_SIZE.height * scale, channels: 3, background: "#e8e8e8" } }).png().toBuffer();
  const jpeg = await composeCroquisImage(base, { center, zoom: frame.zoom, northArrow: { style: "flecha", corner: "top-right" }, pins, lines: [], subject: SUBJECT });
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => {
    const offset = (Math.round(y) * info.width + Math.round(x)) * info.channels;
    return [data[offset], data[offset + 1], data[offset + 2]];
  };
  const hex = (color: string) => [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
  const near = (a: number[], b: number[]) => a.every((value, index) => Math.abs(value - b[index]) < 40);
  const placement = croquisLegendPlacement(center, frame.zoom, pins, "top-right", SUBJECT)!;
  const inLegend = (x: number, y: number) => x >= placement.box.x && x <= placement.box.x + placement.box.width && y >= placement.box.y && y <= placement.box.y + placement.box.height;
  let drawn = 0;
  for (const pin of pins) {
    const at = imagePixel(center, frame.zoom, pin.point);
    if (inLegend(at.x, at.y)) continue;
    if (near(pixel(at.x * scale, at.y * scale), hex(COMPARABLE_PIN_COLORS[pin.type]))) drawn += 1;
  }
  assert.ok(drawn >= 13, `${drawn} pins drawn in their color`);
  // The legend's box is white over the grey map.
  assert.ok(near(pixel((placement.box.x + placement.box.width - 6) * scale, (placement.box.y + placement.box.height - 4) * scale), [255, 255, 255]));
  // The subject's red drop is on the image too (it was the Static API's marker, absent here).
  const subject = imagePixel(center, frame.zoom, SUBJECT);
  assert.ok(near(pixel(subject.x * scale, (subject.y - 16) * scale), hex(SUBJECT_PIN_COLOR)), "the subject's pin is drawn");
});

test("the subject's pin draws on top: a comparable at the same spot, with its number, never covers it", async () => {
  const scale = 2;
  const base = await sharp({ create: { width: STATIC_MAP_SIZE.width * scale, height: STATIC_MAP_SIZE.height * scale, channels: 3, background: "#e8e8e8" } }).png().toBuffer();
  // A comparable on the subject's own spot and one just above its head, where the drop is drawn.
  const pins = comparablePins([
    { type: "TERRENO_VENTA", comparable: { id: "a", reference: 1, latitude: SUBJECT[0], longitude: SUBJECT[1], location: "Al lado" } },
    { type: "INMUEBLE_VENTA", comparable: { id: "b", reference: 1, latitude: SUBJECT[0] + 2 * METER, longitude: SUBJECT[1], location: "Enfrente" } },
  ]);
  const jpeg = await composeCroquisImage(base, { center: SUBJECT, zoom: 17, northArrow: { style: "flecha", corner: "top-right" }, pins, lines: [], subject: SUBJECT });
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const at = imagePixel(SUBJECT, 17, SUBJECT);
  const offset = (Math.round((at.y - 16) * scale) * info.width + Math.round(at.x * scale)) * info.channels;
  const red = [1, 3, 5].map((index) => parseInt(SUBJECT_PIN_COLOR.slice(index, index + 2), 16));
  assert.ok(red.every((value, index) => Math.abs(data[offset + index] - value) < 40), "the drop's body is the subject's red, over the comparables");
  // A number that would fall under the drop goes to the other side of its pin, so it stays readable.
  const beside = comparablePins([{ type: "INMUEBLE_VENTA", comparable: { id: "c", reference: 4, latitude: SUBJECT[0] + 3 * METER, longitude: SUBJECT[1] - east(12), location: "Junto" } }]);
  const chipX = (svg: string) => Number(/<rect x="([\d.-]+)"/.exec(svg)![1]);
  const pinX = imagePixel(SUBJECT, 17, beside[0].point).x * scale;
  assert.ok(chipX(pinsOverlaySvg(SUBJECT, 17, beside, scale)) > pinX, "to the right when nothing is there");
  assert.ok(chipX(pinsOverlaySvg(SUBJECT, 17, beside, scale, SUBJECT)) < pinX, "to the left when the subject's drop is to the right");
  // Outside the frame, no pin; the image carries it only where the subject is.
  assert.doesNotMatch(subjectPinSvg(SUBJECT, 17, [SUBJECT[0] + 1, SUBJECT[1]]), /<path/);
  assert.match(subjectPinSvg(SUBJECT, 17, SUBJECT), new RegExp(`fill="${SUBJECT_PIN_COLOR}"`));
});

/** Two avenues 80 m apart crossed by two streets 120 m apart, all through the subject's block, with long names (Av. López Mateos). */
const CROWD: StreetWay[] = [
  { id: 1, n: "Avenida Adolfo López Mateos Sur", r: 2, g: [[SUBJECT[0] + 40 * METER, SUBJECT[1] - east(700)], [SUBJECT[0] + 40 * METER, SUBJECT[1] + east(700)]] },
  { id: 2, n: "Calle Beristáin de Souza", r: 4, g: [[SUBJECT[0] - 40 * METER, SUBJECT[1] - east(700)], [SUBJECT[0] - 40 * METER, SUBJECT[1] + east(700)]] },
  { id: 3, n: "Avenida Mariano Otero", r: 2, g: [[SUBJECT[0] - 1200 * METER, SUBJECT[1] - east(60)], [SUBJECT[0] + 1200 * METER, SUBJECT[1] - east(60)]] },
  { id: 4, n: "Calle Francisco de Quevedo", r: 4, g: [[SUBJECT[0] - 1200 * METER, SUBJECT[1] + east(60)], [SUBJECT[0] + 1200 * METER, SUBJECT[1] + east(60)]] },
];

const crowdHighlights: StreetHighlights = {
  front: "Calle Beristáin de Souza",
  streets: [
    { name: "Avenida Adolfo López Mateos Sur", category: "principal" },
    { name: "Avenida Mariano Otero", category: "principal" },
    { name: "Calle Francisco de Quevedo", category: "secundaria" },
  ],
  styles: DEFAULT_HIGHLIGHT_STYLES,
  names: true,
};

type Rect = { x: number; y: number; w: number; h: number };
const rectOf = (label: { name: string; point: readonly [number, number]; angle: number }, zoom: number, center: readonly [number, number] = SUBJECT): Rect => {
  const box = streetLabelBox([center[0], center[1]], zoom, { ...label, point: [label.point[0], label.point[1]] });
  // The band turned along its street: the box it takes on the image.
  const radians = (box.angle * Math.PI) / 180;
  const w = Math.abs(box.width * Math.cos(radians)) + Math.abs(box.height * Math.sin(radians));
  const h = Math.abs(box.width * Math.sin(radians)) + Math.abs(box.height * Math.cos(radians));
  return { x: box.x, y: box.y, w, h };
};
const overlap = (a: Rect, b: Rect) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;

test("FAL-35: the names of streets close together no longer pile up, and keep clear of the comparables' pins", () => {
  const zoom = 15;
  const pins = [[SUBJECT[0] + 40 * METER, SUBJECT[1] + east(250)] as [number, number]];
  // The frame north of the subject, so the crossing streets have room above the two avenues in the 16:9 image (26 nov 2026).
  const center: [number, number] = [SUBJECT[0] + 450 * METER, SUBJECT[1]];
  const { labels } = croquisStreets("comparables", center, zoom, crowdHighlights, CROWD, SUBJECT, { pins });
  assert.equal(labels.length, 4);
  assert.equal(labels[0].name, "Calle Beristáin de Souza", "the front street is placed first");
  const rects = labels.map((label) => rectOf(label, zoom, center));
  for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) assert.equal(overlap(rects[i], rects[j]), false, `${labels[i].name} / ${labels[j].name}`);
  const pin = imagePixel(center, zoom, pins[0]);
  for (const rect of rects) assert.equal(overlap(rect, { x: pin.x + 16, y: pin.y, w: 56, h: 22 }), false, "no name over the comparable");
});

test("FAL-35: a name placed by hand stays where it is, the others keep clear of it, and the place persists with the settings", () => {
  const zoom = 15;
  // Moved by hand to the south end of its street, where the automatic name of another street would have gone.
  const placed = { name: "Avenida Mariano Otero", point: [SUBJECT[0] - 380 * METER, SUBJECT[1] - east(60)] as const, angle: 90 };
  const { labels } = croquisStreets("comparables", SUBJECT, zoom, crowdHighlights, CROWD, SUBJECT, { placements: [placed] });
  const otero = labels.find((label) => label.name === placed.name)!;
  assert.deepEqual(otero.point, placed.point);
  const rects = labels.map((label) => rectOf(label, zoom));
  const own = rects[labels.indexOf(otero)];
  for (const rect of rects) if (rect !== own) assert.equal(overlap(rect, own), false);
  // Dragged on the map: the new point, the angle it had (or its street's).
  const moved = withMovedLabel([{ ...placed, angle: 30 }], { name: placed.name, angle: 0 }, [20.64, -103.41]);
  assert.deepEqual(moved, [{ name: placed.name, point: [20.64, -103.41], angle: 30 }]);
  assert.deepEqual(withMovedLabel([], { name: "Nueva", angle: -12 }, [20.64, -103.41]), [{ name: "Nueva", point: [20.64, -103.41], angle: -12 }]);
  // Kept per croquis in the valuation's settings; settings of before have none, and a damaged list does not lose the rest.
  const stored = readCroquisSettings({ labels: { comparables: moved, micro: [{ name: "", point: [0, 0], angle: 0 }] }, clean: false });
  assert.equal(stored.clean, false);
  assert.deepEqual(readCroquisSettings({ labels: { comparables: moved } }).labels, { comparables: moved });
  assert.deepEqual(stored.labels, {}, "an invalid list takes the default");
  assert.deepEqual(readCroquisSettings({}).labels, {});
  assert.equal(readCroquisSettings({}).comparablesOnMap, true);
});

test("FAL-35: the subject's street takes the address's spelling everywhere the maps show it", () => {
  assert.equal(addressStreet("Beristáin y Souza 1234, Col. Centro, Guadalajara"), "Beristáin y Souza");
  assert.equal(addressStreet("Av. López Mateos Sur No. 2375 Int. 4, Zapopan"), "Av. López Mateos Sur");
  assert.equal(addressStreet("Calle 5 de Mayo #23, Centro"), "Calle 5 de Mayo");
  assert.equal(addressStreet("Calle Perla S/N"), "Calle Perla");
  assert.equal(addressStreet(""), null);
  assert.ok(sameStreet("Calle Beristáin de Souza", "Beristáin y Souza"));
  assert.ok(sameStreet("Avenida Adolfo López Mateos Sur", "Av. Adolfo Lopez Mateos Sur"));
  assert.equal(sameStreet("Avenida Mariano Otero", "Calle Mariano Escobedo"), false);
  assert.equal(sameStreet("Calle de la Paz", "Calle"), false);
  assert.deepEqual(preferredStreetName(["Avenida Mariano Otero", "Calle Beristáin de Souza"], "Beristáin y Souza 1234, Col. Centro"), { from: "Calle Beristáin de Souza", to: "Beristáin y Souza" });
  assert.equal(preferredStreetName(["Beristáin y Souza"], "Beristáin y Souza 1234"), null, "already the same");
  const renamed = withPreferredStreetNames(CROWD, crowdHighlights, "Beristáin y Souza 1234, Col. Centro");
  assert.deepEqual(renamed.ways.map((way) => way.n), ["Avenida Adolfo López Mateos Sur", "Beristáin y Souza", "Avenida Mariano Otero", "Calle Francisco de Quevedo"]);
  assert.equal(renamed.highlights.front, "Beristáin y Souza", "the front stored with OpenStreetMap's spelling stays highlighted");
  const { labels } = croquisStreets("micro", SUBJECT, 17, renamed.highlights, renamed.ways, SUBJECT);
  assert.ok(labels.some((label) => label.name === "Beristáin y Souza"));
  assert.ok(!labels.some((label) => label.name === "Calle Beristáin de Souza"));
  // No address, or one of another street: OpenStreetMap's names as they are.
  assert.equal(withPreferredStreetNames(CROWD, crowdHighlights, "").ways, CROWD);
});

const photo = (id: string, title: string, extra: Partial<ImageContent> = {}): ImageContent => ({ id, title, src: `/api/files/${id}`, enabled: true, ...extra });

function photoBlock(images: ImageContent[], id = "fotos-sujeto"): Block {
  return { id, title: "FOTOGRAFÍAS DEL INMUEBLE", sectionLabel: "", enabled: true, required: false, concepts: [], apartados: [], tables: [], images };
}

test("FAL-11: the photographs print two per row with their description as caption; a croquis and a caption of its own are kept", () => {
  const images = [
    photo("f1", "Fachada principal"),
    photo("f2", "IMG_2034.jpg"),
    photo("f3", "Cocina", { captions: [{ id: "c", text: "Cocina integral", position: "top", align: "left" }] }),
    photo("f4", "Recámara principal"),
    photo("f5", "Patio"),
  ];
  const printed = photoGridBlock(photoBlock(images));
  const rows = resolveContentLayout(printed).rows;
  assert.deepEqual(rows.map((row) => row.columns.map((column) => column.items.map((item) => item.id))), [[["f1"], ["f2"]], [["f3"], ["f4"]], [["f5"]]]);
  const byId = new Map(printed.images.map((image) => [image.id, image]));
  assert.deepEqual(byId.get("f1")!.captions, [{ id: "photo-caption", text: "Fachada principal", position: "bottom", align: "center" }]);
  assert.equal(byId.get("f2")!.captions, undefined, "a file name is no description");
  assert.deepEqual(byId.get("f3")!.captions, [{ id: "c", text: "Cocina integral", position: "top", align: "left" }]);
  assert.equal(photoCaption({ title: "  " }), null);
  // Ten photos take five rows, not ten pages.
  const ten = photoGridBlock(photoBlock(Array.from({ length: 10 }, (_, index) => photo(`p${index}`, `Foto ${index + 1}`))));
  assert.equal(resolveContentLayout(ten).rows.length, 5);
  // A croquis keeps its row, and a pair never crosses it.
  const withCroquis = resolveContentLayout(photoGridBlock(photoBlock([photo("a", "A"), photo("m", "Mapa", { croquis: { kind: "comparables" } }), photo("b", "B"), photo("c", "C")])));
  assert.deepEqual(withCroquis.rows.map((row) => row.columns.map((column) => column.items.map((item) => item.id))), [[["a"]], [["m"]], [["b"], ["c"]]]);
  // Rows the appraiser already arranged side by side stay as they are.
  const arranged = { version: 2 as const, rows: [{ id: "r1", columns: [{ id: "c1", items: [{ type: "image" as const, id: "x" }] }, { id: "c2", items: [{ type: "image" as const, id: "y" }] }] }] };
  assert.deepEqual(pairedPhotoRows(arranged, new Map([["x", photo("x", "X")], ["y", photo("y", "Y")]])), arranged.rows);
});

test("FAL-11: which blocks are photographs: the subject's photo section and the comparables' photo blocks", () => {
  assert.ok(isPhotoBlock("FOTOS_SUJETO", { id: "cualquiera" }));
  assert.ok(isPhotoBlock("CROQUIS_COMPARABLES", { id: "motor-mercado-terreno_venta-fotos" }));
  assert.equal(isPhotoBlock("CROQUIS_COMPARABLES", { id: "mapa-comparables" }), false);
  assert.equal(isPhotoBlock("TERRENO", { id: "plano" }), false);
});
