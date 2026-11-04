/**
 * Etapa 1 of the maps: the subject's pin and the croquis settings persist
 * with the subject property, the comparables with coordinates come back as
 * numbered pins, and a croquis image is composed, stored as an image of the
 * valuation and saved in its section like any other image.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import sharp from "sharp";

import { CROQUIS_IMAGE_IDS, DEFAULT_CROQUIS_SETTINGS, comparablePins } from "../../src/features/maps/croquis";
import { findCroquisImage, withCroquisImage } from "../../src/features/maps/croquis-document";
import { composeCroquisImage, storeCroquisImage } from "../../src/features/maps/server/croquis-image.service";
import { getSubjectLocation, saveSubjectLocation } from "../../src/features/maps/server/subject-location.service";
import { readSubjectLocation } from "../../src/features/maps/subject-location";
import { STATIC_MAP_SCALE, STATIC_MAP_SIZE } from "../../src/features/maps/static-map";
import { createComparable } from "../../src/features/valuations/calculation/market.service";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { initialSectionsFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const SUBJECT = [20.63442, -103.40239] as const;

const editor = (fixture: Fixture) => ({ ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] });

function comparable(location: string, coordinates: { latitude: number; longitude: number } | null): ComparableInputPayload {
  return {
    location, area: 140, price: 1260000, factors: [],
    landUse: null, shape: "Regular", zone: null, frontage: null, depth: null, topography: "Plano", services: "Completos",
    notes: null, sourceName: "Altos 360", contactName: null, contactPhone: "348 249 3129", url: null, offerDate: "2026-05-04",
    ...(coordinates ?? {}),
  };
}

test("the pin and the settings save with the subject property, and the comparables with coordinates come back as pins", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);

  const empty = await getSubjectLocation(fixture.publicId, fixture.organizationId);
  assert.equal(empty.location, null);
  assert.deepEqual(empty.croquis, DEFAULT_CROQUIS_SETTINGS);
  assert.deepEqual(empty.comparables, []);
  assert.equal(empty.locked, false);

  const saved = await saveSubjectLocation(fixture.publicId, user, {
    location: { point: SUBJECT, address: "Calle Perla 3890, Loma Bonita Sur, Zapopan", source: "busqueda" },
    croquis: { ...DEFAULT_CROQUIS_SETTINGS, includeComparables: true, macro: { offset: [0.002, -0.001], zoom: 14 } },
  });
  assert.deepEqual(saved.location?.point, SUBJECT);
  assert.equal(saved.location?.address, "Calle Perla 3890, Loma Bonita Sur, Zapopan");
  assert.equal(saved.croquis.macro.zoom, 14);
  assert.equal(saved.croquis.includeComparables, true);

  // A valuation never saved in full has no subject property yet: one is created and the pin lives in its characteristics.
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId }, include: { propiedadSujeto: true } });
  assert.ok(avaluo.IdPropiedadSujeto);
  assert.deepEqual(readSubjectLocation(avaluo.propiedadSujeto!.JCaracteristicas)?.point, SUBJECT);

  // Dragged by hand: the settings stay, the address goes.
  const dragged = await saveSubjectLocation(fixture.publicId, user, { location: { point: [20.635, -103.403], source: "pin" } });
  assert.equal(dragged.location?.address, null);
  assert.equal(dragged.croquis.macro.zoom, 14);

  // The comparables of the valuation with coordinates, numbered by their reference; the one without stays out.
  await createComparable(fixture.publicId, user, "TERRENO_VENTA", comparable("Villa Toledo", { latitude: 20.6351, longitude: -103.4031 }));
  await createComparable(fixture.publicId, user, "TERRENO_VENTA", comparable("Virreyes", null));
  await createComparable(fixture.publicId, user, "TERRENO_VENTA", comparable("Mixtecos", { latitude: 20.6338, longitude: -103.4044 }));
  const withPins = await getSubjectLocation(fixture.publicId, fixture.organizationId);
  assert.deepEqual(
    withPins.comparables.map((pin) => [pin.label, pin.type, pin.location, pin.point]),
    [["C-1", "TERRENO_VENTA", "Villa Toledo", [20.6351, -103.4031]], ["C-3", "TERRENO_VENTA", "Mixtecos", [20.6338, -103.4044]]],
  );
  assert.deepEqual(withPins.comparables, comparablePins(withPins.comparables.map((pin) => ({ type: pin.type, comparable: { id: pin.id, reference: Number(pin.label.slice(2)), latitude: pin.point[0], longitude: pin.point[1], location: pin.location } }))));

  // A concluded valuation shows its pin but takes no change.
  await prisma.avaluo.update({ where: { IdAvaluo: avaluo.IdAvaluo }, data: { BBloqueado: true, DFechaBloqueo: new Date() } });
  assert.equal((await getSubjectLocation(fixture.publicId, fixture.organizationId)).locked, true);
  await assert.rejects(saveSubjectLocation(fixture.publicId, user, { croquis: DEFAULT_CROQUIS_SETTINGS }), /concluido/);
  // Another organization does not find it.
  await assert.rejects(getSubjectLocation(fixture.publicId, fixture.organizationId + 1), /no encontrado/);
});

test("a croquis is composed with the pins and the north arrow, stored as an image of the valuation and saved in its section", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  const width = STATIC_MAP_SIZE.width * STATIC_MAP_SCALE;
  const height = STATIC_MAP_SIZE.height * STATIC_MAP_SCALE;
  // Stands in for the Maps Static API's answer: a plain image of the size it returns.
  const base = await sharp({ create: { width, height, channels: 3, background: "#eef1ea" } }).png().toBuffer();
  const pins = comparablePins([{ type: "INMUEBLE_VENTA", comparable: { id: "a", reference: 1, latitude: 20.6349, longitude: -103.4019, location: "Calle Perla 40" } }]);

  const jpeg = await composeCroquisImage(base, { center: SUBJECT, zoom: 17, northArrow: { style: "punta", corner: "bottom-left" }, pins });
  const metadata = await sharp(jpeg).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, width);
  assert.equal(metadata.height, height);
  // Something was drawn where the pin falls (the base is a flat color).
  const { data } = await sharp(jpeg).extract({ left: Math.round(width * 0.5), top: Math.round(height * 0.35), width: Math.round(width * 0.1), height: Math.round(height * 0.15) }).raw().toBuffer({ resolveWithObject: true });
  const distinct = new Set<string>();
  for (let i = 0; i < data.length; i += 3) distinct.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  assert.ok(distinct.size > 20, "the pin and its number are on the image");

  const stored = await storeCroquisImage(user, "macro", jpeg);
  assert.ok(stored.url);
  assert.equal(stored.mimeType, "image/jpeg");
  const file = await prisma.archivo.findFirst({ where: { SClaveObjeto: stored.key } });
  assert.equal(file?.IdOrganizacion, fixture.organizationId);
  assert.deepEqual(file?.JMetadatos, { uso: "CROQUIS" });

  // Placed in the Croquis section and saved with the document, it reads back as any image of the valuation.
  const sections = initialSectionsFor((await getValuationByPublicId(fixture.publicId, fixture.organizationId))!);
  const placed = withCroquisImage(sections, "macro", stored.url);
  assert.ok(placed.placed);
  await saveValuationSections({ publicId: fixture.publicId, organizationId: fixture.organizationId, user, sections: buildSectionsPayload(placed.sections) });
  const reloaded = initialSectionsFor((await getValuationByPublicId(fixture.publicId, fixture.organizationId))!);
  const image = findCroquisImage(reloaded, "macro");
  assert.equal(image?.id, CROQUIS_IMAGE_IDS.macro);
  assert.ok(image?.src.includes(stored.key.split("/").pop()!), "the stored file is the one the document points to");
  assert.equal(image?.captionText, "Croquis de macrolocalización");
});
