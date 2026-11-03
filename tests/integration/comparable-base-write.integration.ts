import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { getComparableCard } from "../../src/features/valuations/calculation/comparable-card.service";
import { todayInMexico } from "../../src/features/valuations/calculation/comparable-card";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { createComparable, getMarketCalculation } from "../../src/features/valuations/calculation/market.service";
import { listComparableBase } from "../../src/features/valuations/comparable-base/comparable-base.service";
import { comparableSourceNames } from "../../src/features/valuations/comparable-base/comparable-base.service";
import {
  createBaseComparable,
  deleteBaseComparables,
  duplicateBaseComparable,
  setBaseComparableCoordinates,
  updateBaseComparable,
} from "../../src/features/valuations/comparable-base/comparable-base-write.service";
import { exportFirmBaseSelection } from "../../src/features/valuations/comparable-base/comparable-export.service";
import { parseComparableListParams } from "../../src/features/valuations/comparable-base/comparable-list-params";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

function comparable(location: string, area: number, price: number, extra: Partial<ComparableInputPayload> = {}): ComparableInputPayload {
  return {
    location, area, price, factors: [],
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
    notes: null, sourceName: "Inmuebles24", contactName: null, contactPhone: null, url: null, offerDate: null,
    ...extra,
  };
}

const list = (organizationId: number, query: Record<string, string | string[]>) => listComparableBase(organizationId, parseComparableListParams(query));

test("a comparable captured in Comparables lives in the base without a valuation, with its number, and is edited, located, copied and deleted there", async () => {
  const owner = await createValuationFixture();
  const marker = randomUUID().slice(0, 6);
  const created = await createBaseComparable(owner.user, "INMUEBLE_VENTA", comparable(`Morelos 45, col. Centro ${marker}, Arandas`, 120, 2_100_000, {
    constructionType: "Equipo y maquinaria", sourceName: `Portal ${marker}`, attributes: [{ name: `Alberca ${marker}`, value: "Sí" }],
  }));
  assert.equal(created.outcome, "CREATED");
  const row = await prisma.comparableAvaluo.findUniqueOrThrow({
    where: { UIdentificadorPublico: created.id },
    include: { propiedad: { include: { tipoInmueble: true } } },
  });
  assert.equal(row.IdAvaluo, null);
  assert.equal(row.IdVersionAvaluo, null);
  assert.equal(row.IdOrganizacion, owner.organizationId);
  assert.ok(row.propiedad.IFolioComparable && row.propiedad.IFolioComparable > 0, "it gets a number of the base");
  assert.equal(row.propiedad.tipoInmueble.SClave, "MAQUINARIA_EQUIPO", "a new kind of good is filed under the catalog, not a new enum");

  const card = await getComparableCard(created.id, owner.organizationId);
  assert.equal(card.valuation, null);
  assert.deepEqual(card.uses, []);
  assert.equal(card.history.length, 1);
  assert.equal(card.history[0].current, true);
  assert.equal(card.history[0].valuation, null);
  assert.equal(card.history[0].capturedOn, todayInMexico());
  assert.equal(card.history[0].capturedBy, owner.user.name);

  // It is in the list, searchable by its source and its added characteristic; the source is offered to the filter.
  const bySource = await list(owner.organizationId, { fuente: `portal ${marker}` });
  assert.deepEqual(bySource.items.map((item) => item.id), [created.id]);
  assert.equal(bySource.items[0].uses.length, 0);
  assert.deepEqual((await list(owner.organizationId, { caracteristica: `alberca ${marker}` })).items.map((item) => item.id), [created.id]);
  assert.ok((await comparableSourceNames(owner.organizationId)).includes(`Portal ${marker}`));

  // Edited in place: same id, new data; its coordinates placed from the map.
  const edited = await updateBaseComparable(owner.user, created.id, "INMUEBLE_VENTA", comparable(`Morelos 45, col. Centro ${marker}, Arandas`, 130, 2_250_000));
  assert.deepEqual(edited, { id: created.id, created: false });
  await setBaseComparableCoordinates(owner.user, created.id, { latitude: 20.7092, longitude: -102.3467 });
  const after = await getComparableCard(created.id, owner.organizationId);
  assert.equal(after.comparable.area, 130);
  assert.equal(after.comparable.price, 2_250_000);
  assert.equal(after.comparable.latitude, 20.7092);
  assert.equal(after.comparable.longitude, -102.3467);
  await assert.rejects(setBaseComparableCoordinates(owner.user, created.id, { latitude: 95, longitude: 0 }), /latitud/i);

  // A copy has its own number and the same data.
  const copy = await duplicateBaseComparable(owner.user, created.id);
  assert.notEqual(copy.id, created.id);
  assert.ok(copy.folio && copy.folio > (row.propiedad.IFolioComparable ?? 0));
  const copied = await getComparableCard(copy.id, owner.organizationId);
  assert.equal(copied.comparable.area, 130);
  assert.equal(copied.comparable.folio, copy.folio);

  // The selection exports the two, sorted by number.
  const exported = await exportFirmBaseSelection(owner.user, [copy.id, created.id]);
  assert.equal(exported.count, 2);

  // Deleted: both go, as they belong to no valuation.
  const outcome = await deleteBaseComparables(owner.user, [created.id, copy.id]);
  assert.deepEqual(outcome, { deleted: 2, kept: [] });
  assert.equal((await list(owner.organizationId, { fuente: `portal ${marker}` })).total, 0);
});

test("editing or deleting a comparable captured in a valuation leaves that capture alone: a newer capture goes to the base under its number", async () => {
  const owner = await createValuationFixture();
  const marker = randomUUID().slice(0, 6);
  await createComparable(owner.publicId, owner.user, "TERRENO_VENTA", comparable(`Hidalgo 8, col. Llano ${marker}`, 400, 1_200_000));
  const [inValuation] = (await getMarketCalculation(owner.publicId, owner.organizationId, "TERRENO_VENTA")).comparables;

  const kept = await deleteBaseComparables(owner.user, [inValuation.id]);
  assert.equal(kept.deleted, 0);
  assert.equal(kept.kept.length, 1);
  assert.equal(kept.kept[0].folio, inValuation.folio);

  const edited = await updateBaseComparable(owner.user, inValuation.id, "TERRENO_VENTA", comparable(`Hidalgo 8, col. Llano ${marker}`, 410, 1_300_000));
  assert.equal(edited.created, true);
  assert.notEqual(edited.id, inValuation.id);
  const [unchanged] = (await getMarketCalculation(owner.publicId, owner.organizationId, "TERRENO_VENTA")).comparables;
  assert.equal(unchanged.area, 400, "the valuation's capture stays as it was");
  const card = await getComparableCard(edited.id, owner.organizationId);
  assert.equal(card.comparable.folio, inValuation.folio, "the newer capture keeps the number");
  assert.equal(card.comparable.area, 410);
  assert.equal(card.valuation, null);
  assert.equal(card.history.length, 2, "the history lists the base capture and the valuation's");
  assert.equal(card.history[0].id, edited.id);
  assert.equal(card.history[1].valuation?.folio, (await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: owner.publicId } })).SFolio);
  // The list shows the comparable once, by its most recent capture, still used in the valuation.
  const listed = await list(owner.organizationId, { q: `llano ${marker}` });
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].id, edited.id);
  assert.equal(listed.items[0].uses.length, 1);
  // Header orders of the list run.
  for (const orden of ["ubicacion_asc", "tipo_desc", "vigencia_asc", "numero_desc"]) assert.equal((await list(owner.organizationId, { orden, q: `llano ${marker}` })).total, 1, orden);
});
