/**
 * FAL-04 of the audit of week 8: typing 1.05 in the «Fondo» factor of a
 * comparable answered «No se pudo guardar el comparable.» (HTTP 500). The
 * firm's own factors are all of type OTRO, and the database keeps one factor
 * of each type per comparable: a comparable with two of them («Fondo» and
 * another of the firm's, or «Otro») could not be saved.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { addCustomFactor } from "../../src/features/firm/firm.service";
import type { ComparableInputPayload, MarketSettingsPayload } from "../../src/features/valuations/calculation/market-schemas";
import { createComparable, getMarketCalculation, saveMarketSettings, updateComparable } from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS, defaultMarketSettings } from "../../src/features/valuations/calculation/market-types";
import { ValuationWorkflowError } from "../../src/features/valuations/services/valuation-workflow/errors";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

const comparable = (factors: ComparableInputPayload["factors"]): ComparableInputPayload => ({
  location: "Lote C4", area: 200, price: 2_000_000, factors,
  landUse: null, shape: "Regular", zone: "Calle Tipo", frontage: 8, depth: 25, topography: "Plano", services: "Completos",
  notes: null, sourceName: "Portal", contactName: null, contactPhone: null, url: null, offerDate: "2026-11-01",
});

const own = (key: string, value: number) => ({ type: "OTRO" as const, key, value, subjectRating: null, comparableRating: null, justification: null });

test("a comparable keeps two of the firm's own factors and «Otro»: «Fondo» 1.05 is saved", async () => {
  const fixture = await createValuationFixture();
  const { factor: fondo } = await addCustomFactor(fixture.user, "Fondo");
  const { factor: vista } = await addCustomFactor(fixture.user, "Vista");
  const slots = [
    ...DEFAULT_FACTOR_SLOTS.slice(0, 3),
    { type: "OTRO" as const, key: fondo!.key, label: "Fondo" },
    { type: "OTRO" as const, key: vista!.key, label: "Vista" },
    { type: "OTRO" as const, label: "Otro" },
  ];
  await saveMarketSettings(fixture.publicId, fixture.user, { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 200, factorSlots: slots } as MarketSettingsPayload);
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", comparable([own(vista!.key, 0.95)]));
  const [created] = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).comparables;

  const typed = [own(vista!.key, 0.95), own(fondo!.key, 1.05), { ...own("x", 0.98), key: undefined }];
  await updateComparable(fixture.publicId, fixture.user, created.id, comparable(typed));

  const market = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  const factors = market.comparables[0].factors;
  assert.equal(factors.find((item) => item.key === fondo!.key)?.value, 1.05);
  assert.equal(factors.find((item) => item.key === vista!.key)?.value, 0.95);
  assert.equal(factors.find((item) => item.type === "OTRO" && !item.key)?.value, 0.98);

  // Saved again without «Vista», it is gone; «Fondo» stays.
  await updateComparable(fixture.publicId, fixture.user, created.id, comparable([own(fondo!.key, 1.05)]));
  const again = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).comparables[0].factors;
  assert.deepEqual(again.filter((item) => item.type === "OTRO").map((item) => [item.key ?? null, item.value]), [[fondo!.key, 1.05]]);
});

/* Video 8.13, 18:01: «son seis factores… lo de hasta ocho lo sacaron de la IA». */
test("six factors per homologation: a seventh is refused; one saved with eight keeps them and may take one out, not add it back", async () => {
  const fixture = await createValuationFixture();
  const six = DEFAULT_FACTOR_SLOTS;
  const eight = [...six, { type: "FORMA" as const, label: "Forma" }, { type: "TOPOGRAFIA" as const, label: "Topografía" }];
  const save = (factorSlots: MarketSettingsPayload["factorSlots"]) =>
    saveMarketSettings(fixture.publicId, fixture.user, { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 200, factorSlots } as MarketSettingsPayload);
  const refused = (error: unknown) => error instanceof ValuationWorkflowError && error.status === 400 && /hasta 6 factores, sin contar el FRe/.test(error.message);

  await save(six);
  await assert.rejects(save(eight.slice(0, 7)), refused, "a seventh is not added");

  // A homologation saved while eight were allowed (FAL-12).
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const row = await prisma.enfoqueMercado.findFirstOrThrow({ where: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1 } });
  const stored = row.JConfiguracion as Record<string, unknown>;
  await prisma.enfoqueMercado.update({ where: { IdEnfoqueMercado: row.IdEnfoqueMercado }, data: { JConfiguracion: { ...stored, factorSlots: eight } } });

  await save(eight);
  assert.equal((await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).settings.factorSlots.length, 8, "it keeps its eight");
  await save(eight.slice(0, 7));
  await assert.rejects(save(eight), refused, "taken out, it does not come back beyond six");
});
