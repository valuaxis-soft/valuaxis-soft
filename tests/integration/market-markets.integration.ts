/**
 * The market approach as the appraiser asked for it on 13–14 Oct 2026, as the
 * services store it: several markets in one valuation (land and buildings,
 * for sale and for rent), the homologation basis, the firm's own factors, the
 * characteristics list, the justification per comparable, the offer grid, and
 * the photos of comparables brought from another valuation.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { addCustomFactor, getCustomFactors } from "../../src/features/firm/firm.service";
import { getCostCalculation } from "../../src/features/valuations/calculation/cost.service";
import type { ComparableInputPayload, MarketSettingsPayload } from "../../src/features/valuations/calculation/market-schemas";
import {
  createComparable,
  getMarketCalculation,
  saveMarketSettings,
  updateComparable,
} from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS, defaultMarketSettings, type ComparableType } from "../../src/features/valuations/calculation/market-types";
import { addFoundComparables } from "../../src/features/valuations/comparable-search/comparable-search.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const comparable = (location: string, area: number, price: number, extra: Partial<ComparableInputPayload> = {}): ComparableInputPayload => ({
  location, area, price, factors: [],
  landUse: null, shape: "Regular", zone: "Calle Tipo", frontage: 8, depth: 17.5, topography: "Plano", services: "Completos",
  notes: null, sourceName: "Altos 360", contactName: null, contactPhone: null, url: null, offerDate: "2026-05-04",
  ...extra,
});

/** A comparable as a search source returns it: without factors. */
const asFound = ({ factors: _factors, ...found }: ComparableInputPayload) => found;

const settings = (comparableType: ComparableType, overrides: Partial<MarketSettingsPayload> = {}): MarketSettingsPayload =>
  ({ ...defaultMarketSettings(comparableType), subjectArea: 200, ...overrides } as MarketSettingsPayload);

const read = (fixture: Fixture, type: ComparableType) => getMarketCalculation(fixture.publicId, fixture.organizationId, type);

async function stored(fixture: Fixture, type: ComparableType) {
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  return prisma.enfoqueMercado.findFirstOrThrow({ where: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1, tipoComparable: { SClave: type } } });
}

test("land and buildings for sale are two markets of one valuation; the cost approach takes the land one", async () => {
  const fixture = await createValuationFixture();
  await saveMarketSettings(fixture.publicId, fixture.user, settings("TERRENO_VENTA"));
  for (const price of [2_000_000, 2_000_000, 2_200_000, 2_200_000]) {
    await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable(`Lote ${price}`, 200, price));
  }
  await saveMarketSettings(fixture.publicId, fixture.user, settings("INMUEBLE_VENTA", { subjectArea: 150 }));
  for (const price of [4_500_000, 4_800_000]) {
    await createComparable(fixture.publicId, fixture.user, "INMUEBLE_VENTA", comparable(`Casa ${price}`, 150, price));
  }

  const [lands, buildings] = await Promise.all([read(fixture, "TERRENO_VENTA"), read(fixture, "INMUEBLE_VENTA")]);
  assert.equal(lands.comparables.length, 4);
  assert.equal(buildings.comparables.length, 2, "each market keeps its own comparables");
  assert.deepEqual([lands.configured, buildings.configured, (await read(fixture, "TERRENO_RENTA")).configured], [true, true, false]);
  const [land, building] = await Promise.all([stored(fixture, "TERRENO_VENTA"), stored(fixture, "INMUEBLE_VENTA")]);
  assert.equal(Number(land.NValorHomologadoUtilizado), 10_500);
  assert.equal(Number(building.NValorHomologadoUtilizado), 31_000);
  assert.equal((await getCostCalculation(fixture.publicId, fixture.organizationId)).market.adoptedUnitValue, 10_500, "the land market, not the buildings'");
});

test("land for rent is its own market: its area is the land's, its offers are rents, and it feeds no other approach", async () => {
  const fixture = await createValuationFixture();
  await saveMarketSettings(fixture.publicId, fixture.user, settings("TERRENO_RENTA", { adoptedUnitValue: 25 }));
  await createComparable(fixture.publicId, fixture.user, "TERRENO_RENTA", comparable("Patio de maniobras", 400, 10_000, { url: "https://portal.example/renta/1" }));

  const rents = await read(fixture, "TERRENO_RENTA");
  assert.equal(rents.settings.comparableType, "TERRENO_RENTA");
  assert.equal(rents.comparables[0].area, 400);
  const row = await prisma.comparableAvaluo.findFirstOrThrow({
    where: { UIdentificadorPublico: rents.comparables[0].id },
    include: { publicacionPropiedad: { include: { tipoOperacion: true } } },
  });
  assert.equal(Number(row.NSuperficieTerrenoCapturada), 400);
  assert.equal(row.publicacionPropiedad?.tipoOperacion.SClave, "RENTA");
  assert.equal(Number((await stored(fixture, "TERRENO_RENTA")).NValorMercado), 5_000, "200 m² of the subject × 25");
  assert.equal((await read(fixture, "INMUEBLE_RENTA")).comparables.length, 0, "the buildings' rent market is apart");
});

test("against the subject the lote tipo is kept aside: neither the market nor the cost approach uses it until chosen again", async () => {
  const fixture = await createValuationFixture();
  await saveMarketSettings(fixture.publicId, fixture.user, settings("TERRENO_VENTA", { baseArea: 140, typicalFrontage: 8, typicalDepth: 17.5 }));
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable("Lote", 200, 2_000_000));
  let market = await read(fixture, "TERRENO_VENTA");
  assert.equal(market.settings.homologationBasis, "LOTE_TIPO", "a lote tipo without the choice: against it, as before");
  assert.equal((await getCostCalculation(fixture.publicId, fixture.organizationId)).market.baseArea, 140);

  await saveMarketSettings(fixture.publicId, fixture.user, { ...market.settings, homologationBasis: "SUJETO", typicalFrontage: null });
  market = await read(fixture, "TERRENO_VENTA");
  assert.deepEqual([market.settings.homologationBasis, market.settings.baseArea, market.settings.typicalFrontage], ["SUJETO", 140, null]);
  assert.equal((await stored(fixture, "TERRENO_VENTA")).NSuperficieBase, null);
  assert.equal((await getCostCalculation(fixture.publicId, fixture.organizationId)).market.baseArea, null);

  await saveMarketSettings(fixture.publicId, fixture.user, { ...market.settings, homologationBasis: "LOTE_TIPO" });
  assert.equal(Number((await stored(fixture, "TERRENO_VENTA")).NSuperficieBase), 140, "chosen again, it is back");
});

test("a factor the firm creates is offered again, and a comparable keeps its value by the factor's key", async () => {
  const fixture = await createValuationFixture();
  const { factor } = await addCustomFactor(fixture.user, "Vista al parque");
  assert.deepEqual(factor, { key: "custom:vista-al-parque", label: "Vista al parque" });
  await addCustomFactor(fixture.user, "vista al PARQUE");
  assert.deepEqual(await getCustomFactors(fixture.organizationId), [factor], "kept once");

  const slots = [...DEFAULT_FACTOR_SLOTS.slice(0, 5), { type: "OTRO" as const, key: factor!.key, label: factor!.label }];
  await saveMarketSettings(fixture.publicId, fixture.user, settings("TERRENO_VENTA", { factorSlots: slots }));
  const vista = { type: "OTRO" as const, key: factor!.key, value: 1.1, subjectRating: null, comparableRating: null, justification: null };
  const zone = { type: "ZONA" as const, value: null, subjectRating: 0.9, comparableRating: 1.05, justification: "Calle superior" };
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable("Lote", 200, 2_000_000, { factors: [vista, zone] }));

  const market = await read(fixture, "TERRENO_VENTA");
  assert.deepEqual(market.settings.factorSlots.at(-1), { type: "OTRO", key: factor!.key, label: "Vista al parque" });
  const factors = market.comparables[0].factors;
  assert.equal(factors.find((item) => item.key === factor!.key)?.value, 1.1);
  const { value: zoneValue, ...zoneRatings } = factors.find((item) => item.type === "ZONA") ?? zone;
  assert.deepEqual(zoneRatings, { type: "ZONA", subjectRating: 0.9, comparableRating: 1.05, justification: "Calle superior" }, "ratings typed as =0.9/1.05");
  assert.ok(Math.abs((zoneValue ?? 0) - 0.9 / 1.05) < 1e-8);
  // 10,000 $/m² × 0.9/1.05 × 1.1, the surface factor is 1 (same area).
  assert.ok(Math.abs(Number((await stored(fixture, "TERRENO_VENTA")).NValorPromedioHomologado) - 10_000 * (0.9 / 1.05) * 1.1) < 1e-6);
});

test("characteristics, free text and the justification of each comparable are kept, also by a client that does not send them", async () => {
  const fixture = await createValuationFixture();
  const fields = [{ key: "shape", label: "FORMA DEL LOTE" }, { key: "custom:acceso", label: "ACCESO" }];
  await saveMarketSettings(fixture.publicId, fixture.user, settings("TERRENO_VENTA", {
    characteristicFields: fields, subjectCharacteristics: { "custom:acceso": "Pavimentado" }, showFactorJustification: false,
    offerLabels: ["ABUNDANTE", "ESCASA"], offerMark: 1, offerIntro: "Oferta del fraccionamiento.",
  }));
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable("Lote", 200, 2_000_000, {
    extra: { "custom:acceso": "Terracería" }, characteristicsText: "Lote en esquina.", factorJustification: "Zona inferior al sujeto.",
  }));
  let market = await read(fixture, "TERRENO_VENTA");
  assert.deepEqual(market.settings.characteristicFields, fields);
  assert.deepEqual(market.settings.subjectCharacteristics, { "custom:acceso": "Pavimentado" });
  assert.equal(market.settings.showFactorJustification, false);
  assert.deepEqual([market.settings.offerLabels, market.settings.offerMark, market.settings.offerIntro, market.settings.offerLevel],
    [["ABUNDANTE", "ESCASA"], 1, "Oferta del fraccionamiento.", null]);
  const [saved] = market.comparables;
  assert.deepEqual([saved.extra, saved.characteristicsText, saved.factorJustification],
    [{ "custom:acceso": "Terracería" }, "Lote en esquina.", "Zona inferior al sujeto."]);

  // A client of before sends neither the list, the offer grid nor the new fields of the comparable.
  const { characteristicFields: _f, subjectCharacteristics: _s, showFactorJustification: _j, offerLabels: _l, offerMark: _m, offerIntro: _i, ...former } = market.settings;
  await saveMarketSettings(fixture.publicId, fixture.user, { ...former, offerLevel: undefined } as MarketSettingsPayload);
  await updateComparable(fixture.publicId, fixture.user, saved.id, comparable("Lote", 200, 2_100_000));
  market = await read(fixture, "TERRENO_VENTA");
  assert.deepEqual(market.settings.characteristicFields, fields);
  assert.deepEqual([market.settings.offerMark, market.settings.showFactorJustification], [1, false]);
  assert.deepEqual([market.comparables[0].extra, market.comparables[0].factorJustification, market.comparables[0].price],
    [{ "custom:acceso": "Terracería" }, "Zona inferior al sujeto.", 2_100_000]);
});

test("the note under the homologation shows by default, and keeps the appraiser's text and choice", async () => {
  const fixture = await createValuationFixture();
  await saveMarketSettings(fixture.publicId, fixture.user, settings("TERRENO_VENTA"));
  let market = await read(fixture, "TERRENO_VENTA");
  assert.deepEqual([market.settings.showHomologationNote, market.settings.homologationNote], [true, null], "never chosen: shown, the format's text");

  await saveMarketSettings(fixture.publicId, fixture.user, settings("TERRENO_VENTA", { showHomologationNote: false, homologationNote: "Nota del perito." }));
  market = await read(fixture, "TERRENO_VENTA");
  assert.deepEqual([market.settings.showHomologationNote, market.settings.homologationNote], [false, "Nota del perito."]);

  // A client of before sends neither: both stay.
  const { showHomologationNote: _s, homologationNote: _n, ...former } = market.settings;
  await saveMarketSettings(fixture.publicId, fixture.user, former as MarketSettingsPayload);
  market = await read(fixture, "TERRENO_VENTA");
  assert.deepEqual([market.settings.showHomologationNote, market.settings.homologationNote], [false, "Nota del perito."]);
});

test("an offer level of before reads as the mark of the six options of the format", async () => {
  const fixture = await createValuationFixture();
  await saveMarketSettings(fixture.publicId, fixture.user, settings("TERRENO_VENTA", { offerLevel: "MEDIA_BAJA" }));
  const market = await read(fixture, "TERRENO_VENTA");
  assert.deepEqual([market.settings.offerMark, market.settings.offerLabels, market.settings.offerLevel], [3, null, "MEDIA_BAJA"]);
});

test("a comparable brought from another valuation of the firm keeps its photos", async () => {
  const fixture = await createValuationFixture();
  const base = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const other = await prisma.avaluo.create({
    data: {
      IdOrganizacion: base.IdOrganizacion, IdUsuarioCreador: base.IdUsuarioCreador, IdEstadoAvaluo: base.IdEstadoAvaluo,
      IdTipoAvaluo: base.IdTipoAvaluo, IdTipoInmueble: base.IdTipoInmueble, IdTipoOperacion: base.IdTipoOperacion,
      SFolio: `TEST-${randomUUID().slice(0, 8)}`, STitulo: "Otro avalúo de prueba", DFechaModificacion: new Date(),
    },
  });
  const found = comparable("Calle Juárez 12, Arandas", 140, 1_260_000);
  await createComparable(other.UIdentificadorPublico, fixture.user, "TERRENO_VENTA", found);
  const source = (await getMarketCalculation(other.UIdentificadorPublico, fixture.organizationId, "TERRENO_VENTA")).comparables[0];
  const photos = [{ id: randomUUID(), key: "organizaciones/x/fachada.jpg", title: "Fachada" }, { id: randomUUID(), key: "organizaciones/x/calle.jpg", title: "Calle" }];
  await prisma.comparableAvaluo.update({ where: { UIdentificadorPublico: source.id }, data: { JImagenesSnapshot: photos } });

  await addFoundComparables(fixture.publicId, fixture.user, "TERRENO_VENTA", {
    results: [{ id: source.id, sourceId: "despacho", origin: `avalúo ${other.SFolio}`, comparable: asFound(found) }],
  });
  const added = await prisma.comparableAvaluo.findFirstOrThrow({
    where: { avaluo: { UIdentificadorPublico: fixture.publicId }, tipoComparable: { SClave: "TERRENO_VENTA" } },
  });
  const copied = added.JImagenesSnapshot as Array<{ id: string; key: string; title: string }>;
  assert.deepEqual(copied.map((photo) => [photo.key, photo.title]), photos.map((photo) => [photo.key, photo.title]), "the same stored files");
  assert.equal(copied.some((photo) => photos.some((item) => item.id === photo.id)), false, "with ids of their own");
  assert.equal((await read(fixture, "TERRENO_VENTA")).comparables[0].photos.length, 2);

  // Without the result's id (a client of before), the data comes without photos.
  const later = await createValuationFixture();
  await addFoundComparables(later.publicId, later.user, "TERRENO_VENTA", {
    results: [{ sourceId: "despacho", origin: null, comparable: asFound(comparable("Otro lote", 150, 1_000_000)) }],
  });
  assert.equal((await read(later, "TERRENO_VENTA")).comparables[0].photos.length, 0);
});

test("the photos of a comparable of another firm are never copied", async () => {
  const mine = await createValuationFixture();
  const theirs = await createValuationFixture();
  await createComparable(theirs.publicId, theirs.user, "TERRENO_VENTA", comparable("De otro despacho", 140, 1_000_000));
  const source = (await getMarketCalculation(theirs.publicId, theirs.organizationId, "TERRENO_VENTA")).comparables[0];
  await prisma.comparableAvaluo.update({ where: { UIdentificadorPublico: source.id }, data: { JImagenesSnapshot: [{ id: randomUUID(), key: "ajena.jpg", title: "Ajena" }] } });
  await addFoundComparables(mine.publicId, mine.user, "TERRENO_VENTA", {
    results: [{ id: source.id, sourceId: "despacho", origin: null, comparable: asFound(comparable("Copiado a mano", 140, 1_000_000)) }],
  });
  assert.equal((await read(mine, "TERRENO_VENTA")).comparables[0].photos.length, 0);
});
