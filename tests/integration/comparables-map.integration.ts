/**
 * Grok audit, week 8 (FAL-10, FAL-35): the map of comparables of a valuation
 * with comparables in two markets up to 2 km away. Its frame fits them all,
 * the generated image carries each one's pin with the number its market's
 * tables print and the legend, and the street names placed by hand persist
 * with the croquis settings.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import sharp from "sharp";

import { COMPARABLES_FRAME, COMPARABLE_PIN_COLORS, DEFAULT_CROQUIS_SETTINGS, SUBJECT_PIN_COLOR, comparablesFitFrame, croquisLegend, croquisLegendPlacement, pinsOutsideFrame } from "../../src/features/maps/croquis";
import { frameCenter } from "../../src/features/maps/map-styles";
import { composeCroquisImage, storeCroquisImage } from "../../src/features/maps/server/croquis-image.service";
import { getSubjectLocation, saveSubjectLocation } from "../../src/features/maps/server/subject-location.service";
import { STATIC_MAP_SCALE, STATIC_MAP_SIZE, imagePixel } from "../../src/features/maps/static-map";
import { createComparable } from "../../src/features/valuations/calculation/market.service";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

const SUBJECT = [20.63442, -103.40239] as const;
const METER = 1 / 111_195;
const east = (meters: number) => (meters * METER) / Math.cos((SUBJECT[0] * Math.PI) / 180);

function comparable(location: string, north: number, eastMeters: number): ComparableInputPayload {
  return {
    location, area: 160, price: 1_500_000, factors: [],
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
    notes: null, sourceName: "Portal inventado", contactName: null, contactPhone: null, url: null, offerDate: null,
    latitude: SUBJECT[0] + north * METER, longitude: SUBJECT[1] + east(eastMeters),
  };
}

test("FAL-10: the map of comparables fits every comparable, numbered per market, with its legend", async () => {
  const fixture = await createValuationFixture();
  const user = { ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] };
  await saveSubjectLocation(fixture.publicId, user, { location: { point: SUBJECT, address: "Calle Inventada 100, Zapopan", source: "busqueda" } });
  await createComparable(fixture.publicId, user, "TERRENO_VENTA", comparable("Terreno norte", 1800, 200));
  await createComparable(fixture.publicId, user, "TERRENO_VENTA", comparable("Terreno sur", -1500, -900));
  await createComparable(fixture.publicId, user, "INMUEBLE_VENTA", comparable("Casa oriente", 300, 2000));
  await createComparable(fixture.publicId, user, "INMUEBLE_VENTA", comparable("Casa poniente", -200, -1700));
  await createComparable(fixture.publicId, user, "INMUEBLE_VENTA", comparable("Casa junto", 60, 40));

  const dto = await getSubjectLocation(fixture.publicId, fixture.organizationId);
  assert.deepEqual(dto.croquis.comparablesOnMap, true, "«Incluir comparables» starts on in the map of comparables");
  assert.deepEqual(dto.comparables.map((pin) => [pin.type, pin.label]), [
    ["TERRENO_VENTA", "C-1"], ["TERRENO_VENTA", "C-2"], ["INMUEBLE_VENTA", "C-1"], ["INMUEBLE_VENTA", "C-2"], ["INMUEBLE_VENTA", "C-3"],
  ]);
  // The audit's image: the old fixed frame left the far ones out without a word.
  assert.ok(pinsOutsideFrame(SUBJECT, COMPARABLES_FRAME.zoom, dto.comparables).length >= 3);
  const frame = comparablesFitFrame(SUBJECT, dto.comparables);
  const center = frameCenter(frame, SUBJECT);
  assert.deepEqual(pinsOutsideFrame(center, frame.zoom, dto.comparables), []);
  assert.deepEqual(croquisLegend(center, frame.zoom, dto.comparables).map((entry) => entry.label), [
    "Inmueble valuado",
    "Terrenos en venta: C-1, C-2",
    "Inmuebles en venta: C-1 a C-3",
  ]);

  // Composed over a stand-in for Google's image: every pin in its color, stored as an image of the valuation.
  const width = STATIC_MAP_SIZE.width * STATIC_MAP_SCALE;
  const height = STATIC_MAP_SIZE.height * STATIC_MAP_SCALE;
  const base = await sharp({ create: { width, height, channels: 3, background: "#eef1ea" } }).png().toBuffer();
  const northArrow = { style: "flecha", corner: "top-right" } as const;
  const jpeg = await composeCroquisImage(base, { center, zoom: frame.zoom, northArrow, pins: dto.comparables, subject: SUBJECT });
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const legend = croquisLegendPlacement(center, frame.zoom, dto.comparables, northArrow.corner, SUBJECT)!;
  assert.notEqual(legend.corner, "top-right", "never the north arrow's corner");
  const colorAt = (x: number, y: number, hex: string) => {
    const offset = (Math.round(y * STATIC_MAP_SCALE) * info.width + Math.round(x * STATIC_MAP_SCALE)) * info.channels;
    const color = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
    return color.every((value, index) => Math.abs(data[offset + index] - value) < 40);
  };
  // The subject's drop is drawn over everything: «Casa junto», 70 m away, sits under it at this zoom.
  const subject = imagePixel(center, frame.zoom, SUBJECT);
  assert.ok(colorAt(subject.x, subject.y - 16, SUBJECT_PIN_COLOR), "the subject's pin is on the image, on top");
  const underDrop = (x: number, y: number) => Math.abs(x - subject.x) <= 15 && y <= subject.y && y >= subject.y - 38;
  for (const pin of dto.comparables) {
    const at = imagePixel(center, frame.zoom, pin.point);
    if (underDrop(at.x, at.y)) continue;
    assert.ok(colorAt(at.x, at.y, COMPARABLE_PIN_COLORS[pin.type]), `${pin.type} ${pin.label} is drawn in its color`);
  }
  const stored = await storeCroquisImage(user, "comparables", jpeg);
  assert.equal(stored.mimeType, "image/jpeg");
});

test("FAL-35: the street names placed by hand persist per croquis with the valuation's settings", async () => {
  const fixture = await createValuationFixture();
  const user = { ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] };
  const placement = { name: "Calle Inventada", point: [20.635, -103.401] as const, angle: -20 };
  await saveSubjectLocation(fixture.publicId, user, {
    location: { point: SUBJECT, address: null, source: "pin" },
    croquis: { ...DEFAULT_CROQUIS_SETTINGS, comparablesOnMap: false, labels: { comparables: [placement] } },
  });
  const reloaded = await getSubjectLocation(fixture.publicId, fixture.organizationId);
  assert.deepEqual(reloaded.croquis.labels, { comparables: [placement] });
  assert.equal(reloaded.croquis.comparablesOnMap, false);
});
