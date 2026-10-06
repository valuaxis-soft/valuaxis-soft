import assert from "node:assert/strict";
import { after, test } from "node:test";
import { comparableInputSchema, marketSettingsSchema, type ComparableInputPayload, type MarketSettingsPayload } from "../../src/features/valuations/calculation/market-schemas";
import {
  createComparable,
  getMarketCalculation,
  importComparables,
  saveMarketSettings,
  updateComparable,
} from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS, type ComparableType } from "../../src/features/valuations/calculation/market-types";
import { concludeValuation, reopenValuation, saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const editor = (fixture: Fixture) => ({
  ...fixture.user,
  permissions: [...fixture.user.permissions, "AVALUO_EDITAR"],
});

/** Settings as a client of before sends them: without the captures of the appraiser's format. */
const formerSettings = (comparableType: ComparableType): MarketSettingsPayload => ({
  comparableType,
  subjectArea: 169.78,
  baseArea: 140,
  surfacePower: 6,
  adoptedUnitValue: null,
  justification: null,
  additionalAmount: 0,
  factorSlots: DEFAULT_FACTOR_SLOTS,
});

/** A comparable as a client of before sends it. */
const formerComparable = (location: string, area: number, price: number): ComparableInputPayload => ({
  location, area, price, factors: [],
  landUse: "Área Urbana-Incorporada / Comercial y Servicios Distrital", shape: "Regular", zone: "Calle Tipo", frontage: 8, depth: 17.5,
  topography: "Plano (<6%)", services: "Completos", notes: null, sourceName: "Altos 360", contactName: null, contactPhone: "348 249 3129",
  url: null, offerDate: "2026-05-04",
});

const read = (fixture: Fixture, type: ComparableType = "TERRENO_VENTA") => getMarketCalculation(fixture.publicId, fixture.organizationId, type);
const captures = (settings: Awaited<ReturnType<typeof read>>["settings"]) =>
  ({ offerLevel: settings.offerLevel, typicalFrontage: settings.typicalFrontage, typicalDepth: settings.typicalDepth });

test("the offer level and the typical frontage and depth are saved per comparable type and read back", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  assert.deepEqual(captures((await read(fixture)).settings), { offerLevel: null, typicalFrontage: null, typicalDepth: null }, "nothing captured yet");

  await saveMarketSettings(fixture.publicId, user, { ...formerSettings("TERRENO_VENTA"), offerLevel: "MEDIA_BAJA", typicalFrontage: 8, typicalDepth: 17.5 });
  await saveMarketSettings(fixture.publicId, user, { ...formerSettings("INMUEBLE_RENTA"), offerLevel: "NULA", typicalFrontage: null, typicalDepth: null });
  assert.deepEqual(captures((await read(fixture)).settings), { offerLevel: "MEDIA_BAJA", typicalFrontage: 8, typicalDepth: 17.5 });
  assert.deepEqual(captures((await read(fixture, "INMUEBLE_RENTA")).settings), { offerLevel: "NULA", typicalFrontage: null, typicalDepth: null });
  assert.deepEqual(captures((await read(fixture, "INMUEBLE_VENTA")).settings), { offerLevel: null, typicalFrontage: null, typicalDepth: null });

  // A client that does not know the fields leaves them as they were; an explicit null empties them.
  await saveMarketSettings(fixture.publicId, user, marketSettingsSchema.parse({ ...formerSettings("TERRENO_VENTA"), surfacePower: 9 }));
  const kept = (await read(fixture)).settings;
  assert.equal(kept.surfacePower, 9);
  assert.deepEqual(captures(kept), { offerLevel: "MEDIA_BAJA", typicalFrontage: 8, typicalDepth: 17.5 });
  await saveMarketSettings(fixture.publicId, user, { ...formerSettings("TERRENO_VENTA"), offerLevel: null, typicalFrontage: null, typicalDepth: 20 });
  assert.deepEqual(captures((await read(fixture)).settings), { offerLevel: null, typicalFrontage: null, typicalDepth: 20 });
});

test("a comparable keeps its fronts, land use key, conservation and quality; one captured before reads them empty", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await createComparable(fixture.publicId, user, "INMUEBLE_RENTA", comparableInputSchema.parse(formerComparable("Sin capturas", 410, 9500)));
  await createComparable(fixture.publicId, user, "INMUEBLE_RENTA", {
    ...formerComparable("Con capturas", 400, 9000), frontCount: 2, landUseKey: "HC 4 / 25", conservation: "Buena", quality: "Media",
  });
  await importComparables(fixture.publicId, user, "INMUEBLE_RENTA", [{ ...formerComparable("Importado", 380, 8300), frontCount: 1, landUseKey: "H-3" }]);

  const details = async () => (await read(fixture, "INMUEBLE_RENTA")).comparables.map((item) =>
    [item.location, item.frontCount, item.landUseKey, item.conservation, item.quality]);
  assert.deepEqual(await details(), [
    ["Sin capturas", null, null, null, null],
    ["Con capturas", 2, "HC 4 / 25", "Buena", "Media"],
    ["Importado", 1, "H-3", null, null],
  ]);
  const [, captured] = (await read(fixture, "INMUEBLE_RENTA")).comparables;
  assert.equal(captured.landUse, "Área Urbana-Incorporada / Comercial y Servicios Distrital", "the description stays in its own field");

  // An update from a client of before leaves the captures; an explicit null empties them.
  await updateComparable(fixture.publicId, user, captured.id, comparableInputSchema.parse({ ...formerComparable("Con capturas", 405, 9000) }));
  assert.deepEqual((await details())[1], ["Con capturas", 2, "HC 4 / 25", "Buena", "Media"]);
  assert.equal((await read(fixture, "INMUEBLE_RENTA")).comparables[1].area, 405);
  await updateComparable(fixture.publicId, user, captured.id, {
    ...formerComparable("Con capturas", 405, 9000), frontCount: 3, landUseKey: null, conservation: "Regular", quality: null,
  });
  assert.deepEqual((await details())[1], ["Con capturas", 3, null, "Regular", null]);
});

test("the captures survive concluding and reopening, and editing the reopened version leaves the concluded one", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveMarketSettings(fixture.publicId, user, { ...formerSettings("TERRENO_VENTA"), offerLevel: "ALTA", typicalFrontage: 8, typicalDepth: 17.5 });
  await createComparable(fixture.publicId, user, "TERRENO_VENTA", {
    ...formerComparable("Villa Toledo", 140, 1260000), frontCount: 2, landUseKey: "AU-I/CS-D", conservation: "Buena", quality: "Media",
  });
  // Concluding needs the document structure, created on the first save.
  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user,
    sections: [{ id: "mercadoVenta", label: "VII", title: "ENFOQUE DE MERCADO EN VENTA", blocks: [] }],
  });
  const snapshot = async () => {
    const { settings, comparables } = await read(fixture);
    return { ...captures(settings), comparables: comparables.map((item) => [item.frontCount, item.landUseKey, item.conservation, item.quality]) };
  };
  const expected = { offerLevel: "ALTA", typicalFrontage: 8, typicalDepth: 17.5, comparables: [[2, "AU-I/CS-D", "Buena", "Media"]] };
  assert.deepEqual(await snapshot(), expected);

  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user });
  assert.deepEqual(await snapshot(), expected, "the concluded version shows them");
  const concluded = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });

  await reopenValuation({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: { ...user, permissions: [...user.permissions, "AVALUO_REABRIR"] },
    reason: "Revisión del nivel de oferta",
    acceptedText: "Acepto reabrir el avalúo",
  });
  assert.deepEqual(await snapshot(), expected, "the reopened version starts with them");

  await saveMarketSettings(fixture.publicId, user, { ...formerSettings("TERRENO_VENTA"), offerLevel: "BAJA", typicalFrontage: 10, typicalDepth: null });
  const [comparable] = (await read(fixture)).comparables;
  await updateComparable(fixture.publicId, user, comparable.id, { ...formerComparable("Villa Toledo", 140, 1260000), frontCount: 1, landUseKey: "H-3" });
  assert.deepEqual(await snapshot(), { offerLevel: "BAJA", typicalFrontage: 10, typicalDepth: null, comparables: [[1, "H-3", "Buena", "Media"]] });

  const final = await prisma.enfoqueMercado.findFirstOrThrow({ where: { IdVersionAvaluo: concluded.IdVersionFinal! } });
  assert.deepEqual(
    (({ offerLevel, typicalFrontage, typicalDepth }) => ({ offerLevel, typicalFrontage, typicalDepth }))(final.JConfiguracion as Record<string, unknown>),
    { offerLevel: "ALTA", typicalFrontage: 8, typicalDepth: 17.5 },
    "the concluded version keeps its own",
  );
  const finalComparable = await prisma.comparableAvaluo.findFirstOrThrow({ where: { IdVersionAvaluo: concluded.IdVersionFinal! } });
  assert.deepEqual(
    (({ frontCount, landUseKey }) => ({ frontCount, landUseKey }))(finalComparable.JPropiedadSnapshot as Record<string, unknown>),
    { frontCount: 2, landUseKey: "AU-I/CS-D" },
  );
});
