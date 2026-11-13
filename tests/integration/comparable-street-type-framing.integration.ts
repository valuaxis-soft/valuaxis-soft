/**
 * V5.4-10 and V5.5-06 against the database: «Tipo de vialidad» is kept in the
 * comparable's address snapshot and filters the search of the firm's base,
 * and the «Encuadre» and «Zoom» of a comparable's photo are kept in its photo
 * snapshot. Neither needs a migration.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import {
  createComparable,
  getMarketCalculation,
  setComparablePhotoFraming,
  updateComparable,
} from "../../src/features/valuations/calculation/market.service";
import { comparableFormValues } from "../../src/features/valuations/calculation/market-types";
import type { StreetType } from "../../src/features/valuations/calculation/comparable-card";
import { searchComparables } from "../../src/features/valuations/comparable-search/comparable-search.service";
import type { ComparableSearchQuery } from "../../src/features/valuations/comparable-search/types";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

function comparable(location: string, extra: Partial<ComparableInputPayload> = {}): ComparableInputPayload {
  return {
    location, area: 140, price: 1_260_000, factors: [],
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
    notes: null, sourceName: "Portal inventado", contactName: null, contactPhone: null, url: null, offerDate: "2026-05-04",
    ...extra,
  };
}

/** Another valuation of the fixture's organization, to search from. */
async function anotherValuation(fixture: Fixture) {
  const base = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const created = await prisma.avaluo.create({
    data: {
      IdOrganizacion: base.IdOrganizacion, IdUsuarioCreador: base.IdUsuarioCreador, IdEstadoAvaluo: base.IdEstadoAvaluo,
      IdTipoAvaluo: base.IdTipoAvaluo, IdTipoInmueble: base.IdTipoInmueble, IdTipoOperacion: base.IdTipoOperacion,
      SFolio: `TEST-${randomUUID().slice(0, 8)}`, STitulo: "Otro avalúo de prueba", DFechaModificacion: new Date(),
    },
  });
  return created.UIdentificadorPublico;
}

const query = (overrides: Partial<ComparableSearchQuery> = {}): ComparableSearchQuery =>
  ({ text: "inventado", type: "TERRENO_VENTA", areaMin: null, areaMax: null, priceMin: null, priceMax: null, limit: 20, ...overrides });

test("V5.4-10: the type of road is kept, survives a client that does not send it, and filters the search", async () => {
  const fixture = await createValuationFixture();
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable("Av. Inventada 488, Arandas", {
    address: { streetType: "AVENIDA", street: "Inventada", number: "488", municipality: "Arandas" },
  }));
  // Captured before the type existed: no type in its address.
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable("Roble 12, fracc. Inventado, Arandas", {
    address: { street: "Roble", number: "12", municipality: "Arandas" },
  }));
  const calculation = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  const [avenue, before] = calculation.comparables;
  assert.equal(avenue.address?.streetType, "AVENIDA");
  assert.equal(before.address?.streetType, undefined, "a comparable of before keeps no type (it reads «Calle»)");
  assert.equal(before.location, "Roble 12, fracc. Inventado, Arandas", "and its text does not change");

  // The master workbook has no column for the type: an update without it keeps the stored one.
  const values = comparableFormValues(avenue);
  const { streetType: _left, ...withoutType } = values.address ?? {};
  await updateComparable(fixture.publicId, fixture.user, avenue.id, { ...values, notes: "Editado", address: withoutType } as ComparableInputPayload);
  const updated = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).comparables.find((item) => item.id === avenue.id);
  assert.equal(updated?.address?.streetType, "AVENIDA");

  const other = await anotherValuation(fixture);
  const found = async (streetType?: StreetType) =>
    (await searchComparables(other, fixture.user, query(streetType ? { filters: { streetType } } : {}))).results.map((hit) => hit.comparable.location).sort();
  assert.deepEqual(await found(), ["Av. Inventada 488, Arandas", "Roble 12, fracc. Inventado, Arandas"]);
  assert.deepEqual(await found("AVENIDA"), ["Av. Inventada 488, Arandas"]);
  assert.deepEqual(await found("CALLE"), ["Roble 12, fracc. Inventado, Arandas"], "one of before is a «Calle»");
  assert.deepEqual(await found("BOULEVARD"), []);
});

test("V5.5-06: a photo's framing is kept in the comparable, goes back to the default with null, and needs the photo", async () => {
  const fixture = await createValuationFixture();
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable("Calle Inventada 7, Arandas"));
  const [{ id }] = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).comparables;
  // A photo as an upload leaves it in the snapshot (the file itself is not needed here).
  await prisma.comparableAvaluo.updateMany({
    where: { UIdentificadorPublico: id },
    data: { JImagenesSnapshot: [{ id: "foto-inventada", key: "organizaciones/prueba/foto-inventada.jpg", title: "Fachada" }] },
  });
  const framing = { focus: { x: 40, y: 25 }, size: { fit: "cover" as const, scale: 150 } };
  await setComparablePhotoFraming(fixture.publicId, fixture.user, id, "foto-inventada", framing);
  const photo = async () => (await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).comparables[0].photos[0];
  assert.deepEqual((await photo()).framing, framing);
  assert.equal((await photo()).title, "Fachada", "the rest of the photo stays");

  await setComparablePhotoFraming(fixture.publicId, fixture.user, id, "foto-inventada", null);
  assert.equal((await photo()).framing, undefined);
  const row = await prisma.comparableAvaluo.findFirstOrThrow({ where: { UIdentificadorPublico: id }, select: { JImagenesSnapshot: true } });
  assert.deepEqual(row.JImagenesSnapshot, [{ id: "foto-inventada", key: "organizaciones/prueba/foto-inventada.jpg", title: "Fachada" }], "the default is not stored");

  await assert.rejects(() => setComparablePhotoFraming(fixture.publicId, fixture.user, id, "otra-foto", framing), /Fotografía no encontrada/);
});
