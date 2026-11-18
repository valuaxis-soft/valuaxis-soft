/**
 * Videos 7.1–7.3 against the database: a comparable takes ten photos and
 * refuses the eleventh; «Otro» with its type and «Esquina con» are kept in its
 * address snapshot (no migration) and survive a client that leaves them out;
 * and the form's suggestions read only the firm's own comparables.
 */
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { after, test } from "node:test";
import sharp from "sharp";
import { formatAddress } from "../../src/features/valuations/calculation/comparable-card";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import {
  addComparablePhoto,
  createComparable,
  getMarketCalculation,
  saveMarketSettings,
  updateComparable,
} from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS, comparableFormValues } from "../../src/features/valuations/calculation/market-types";
import { comparableSuggestions } from "../../src/features/valuations/comparable-base/comparable-base.service";
import { createValuationFixture, prisma } from "./support";

/** Local storage writes under public/; remove what these tests stored. */
const storedOrganizations = new Set<string>();
after(async () => {
  for (const uuid of storedOrganizations) await rm(join(process.cwd(), "public", "organizaciones", uuid), { recursive: true, force: true });
  await prisma.$disconnect();
});

async function fixture() {
  const created = await createValuationFixture();
  const { UIdentificadorPublico } = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: created.organizationId } });
  storedOrganizations.add(UIdentificadorPublico);
  await saveMarketSettings(created.publicId, created.user, {
    comparableType: "INMUEBLE_VENTA", subjectArea: 150, baseArea: null, surfacePower: 6, adoptedUnitValue: null,
    justification: null, additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS,
  });
  return created;
}

function comparable(extra: Partial<ComparableInputPayload> = {}): ComparableInputPayload {
  return {
    location: "Av. Inventada 10, Zapopan", area: 160, price: 2_400_000, factors: [],
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
    notes: null, sourceName: "Portal inventado", contactName: null, contactPhone: null, url: null, offerDate: null,
    ...extra,
  };
}

const photo = async (index: number) => {
  const buffer = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 20 * index, g: 80, b: 120 } } }).jpeg().toBuffer();
  return new File([new Uint8Array(buffer)], `foto-${index + 1}.jpg`, { type: "image/jpeg" });
};

test("V7.1-09: a comparable takes ten photos, in their order, and refuses the eleventh", async () => {
  const owner = await fixture();
  await createComparable(owner.publicId, owner.user, "INMUEBLE_VENTA", comparable());
  const [created] = (await getMarketCalculation(owner.publicId, owner.organizationId, "INMUEBLE_VENTA")).comparables;
  for (let index = 0; index < 10; index += 1) await addComparablePhoto(owner.publicId, owner.user, created.id, await photo(index));
  const [stored] = (await getMarketCalculation(owner.publicId, owner.organizationId, "INMUEBLE_VENTA")).comparables;
  assert.deepEqual(stored.photos.map((item) => item.title), Array.from({ length: 10 }, (_, index) => `foto-${index + 1}`));
  await assert.rejects(addComparablePhoto(owner.publicId, owner.user, created.id, await photo(10)), /hasta 10 fotografías/);
});

test("V7.2-16 and V7.3-27: «Otro» with its type and «Esquina con» are kept, print, and survive a client that leaves them out", async () => {
  const owner = await fixture();
  const address = { streetType: "OTRO" as const, streetTypeOther: "Callejuela", street: "del Iris", number: "4", crossStreet: "Calle Ficticia", municipality: "Arandas" };
  await createComparable(owner.publicId, owner.user, "INMUEBLE_VENTA", comparable({ location: formatAddress(address), address }));
  const [stored] = (await getMarketCalculation(owner.publicId, owner.organizationId, "INMUEBLE_VENTA")).comparables;
  assert.equal(stored.location, "Callejuela del Iris 4 esquina con Calle Ficticia, Arandas");
  assert.equal(stored.address?.streetTypeOther, "Callejuela");
  assert.equal(stored.address?.crossStreet, "Calle Ficticia");

  // The master workbook has no columns for them: an update without them keeps the stored ones.
  const values = comparableFormValues(stored);
  const { streetType: _type, streetTypeOther: _other, crossStreet: _corner, ...withoutThem } = values.address ?? {};
  await updateComparable(owner.publicId, owner.user, stored.id, { ...values, notes: "Editado", address: withoutThem } as ComparableInputPayload);
  const [updated] = (await getMarketCalculation(owner.publicId, owner.organizationId, "INMUEBLE_VENTA")).comparables;
  assert.equal(updated.address?.streetType, "OTRO");
  assert.equal(updated.address?.streetTypeOther, "Callejuela");
  assert.equal(updated.address?.crossStreet, "Calle Ficticia");
});

test("V7.2-04 and V7.2-22: the form offers the firm's places and characteristics, never another firm's", async () => {
  const owner = await fixture();
  const stranger = await fixture();
  await createComparable(owner.publicId, owner.user, "INMUEBLE_VENTA", comparable({
    address: { municipality: "Zapopan", neighborhood: "Colonia Inventada Norte", subdivision: "Fracc. Los Ficticios", street: "Inventada" },
    zone: "Habitacional media", frontage: 8, depth: 20, constructionType: "Casa habitación",
  }));
  await createComparable(owner.publicId, owner.user, "INMUEBLE_VENTA", comparable({
    address: { municipality: "Zapopan", neighborhood: "Colonia Inventada Sur", street: "Ficticia", streetType: "OTRO", streetTypeOther: "Callejuela" },
    zone: "Habitacional media",
  }));
  await createComparable(stranger.publicId, stranger.user, "INMUEBLE_VENTA", comparable({
    address: { municipality: "Municipio Ajeno", neighborhood: "Colonia Ajena" }, zone: "Zona ajena",
  }));

  const mine = await comparableSuggestions(owner.organizationId, "INMUEBLE_VENTA");
  assert.deepEqual(mine.address.municipality, ["Zapopan"]);
  assert.deepEqual(mine.address.neighborhood.sort(), ["Colonia Inventada Norte", "Colonia Inventada Sur"]);
  assert.deepEqual(mine.address.subdivision, ["Fracc. Los Ficticios"]);
  assert.deepEqual(mine.address.streetTypeOther, ["Callejuela"]);
  assert.deepEqual(mine.characteristics.zone, ["Habitacional media"]);
  assert.deepEqual(mine.characteristics.frontage, ["8"]);
  assert.deepEqual(mine.characteristics.depth, ["20"]);
  assert.deepEqual(mine.characteristics.constructionType, ["Casa habitación"]);
  assert.ok(!JSON.stringify(mine).includes("jen"), "nothing of another firm");

  // Land comparables: the places are the firm's, the characteristics only of land.
  const land = await comparableSuggestions(owner.organizationId, "TERRENO_VENTA");
  assert.deepEqual(land.address.municipality, ["Zapopan"]);
  assert.deepEqual(land.characteristics.zone, []);
});
