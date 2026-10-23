import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { after, test } from "node:test";
import sharp from "sharp";
import { findDuplicates, getComparableCard, getValuationReview } from "../../src/features/valuations/calculation/comparable-card.service";
import { formatComparableId } from "../../src/features/valuations/calculation/comparable-card";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import {
  createComparable,
  getMarketCalculation,
  importComparables,
  removeComparableScreenshot,
  reuseComparable,
  saveComparableReview,
  saveMarketSettings,
  setComparableScreenshot,
  updateComparable,
} from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS, comparableFormValues, type ComparableType } from "../../src/features/valuations/calculation/market-types";
import { addFoundComparables, searchComparables } from "../../src/features/valuations/comparable-search/comparable-search.service";
import { concludeValuation, reopenValuation, saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { REVIEW_COMPARABLES_PERMISSIONS } from "../../src/features/auth/permissions";
import { authorizeApiUser } from "../../src/security/guards/api-guard";
import { createValuationFixture, prisma } from "./support";

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

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
  return created;
}

async function anotherValuation(base: Fixture) {
  const valuation = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: base.publicId } });
  const created = await prisma.avaluo.create({
    data: {
      IdOrganizacion: valuation.IdOrganizacion,
      IdUsuarioCreador: valuation.IdUsuarioCreador,
      IdEstadoAvaluo: valuation.IdEstadoAvaluo,
      IdTipoAvaluo: valuation.IdTipoAvaluo,
      IdTipoInmueble: valuation.IdTipoInmueble,
      IdTipoOperacion: valuation.IdTipoOperacion,
      SFolio: `TEST-${randomUUID().slice(0, 8)}`,
      STitulo: "Otro avalúo",
      DFechaModificacion: new Date(),
    },
  });
  return created.UIdentificadorPublico;
}

function comparable(location: string, area: number, price: number, extra: Partial<ComparableInputPayload> = {}): ComparableInputPayload {
  return {
    location, area, price, factors: [],
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
    notes: null, sourceName: "Inmuebles24", contactName: "Ana López", contactPhone: "348 123 4567", url: null, offerDate: "2026-10-01",
    ...extra,
  };
}

async function screenshotFile() {
  const buffer = await sharp({ create: { width: 60, height: 40, channels: 3, background: "#3366cc" } }).png().toBuffer();
  return new File([new Uint8Array(buffer)], "image.png", { type: "image/png" });
}

const market = (publicId: string, organizationId: number, type: ComparableType = "INMUEBLE_VENTA") =>
  getMarketCalculation(publicId, organizationId, type);

async function concludeAndReopen(publicId: string, owner: Fixture) {
  await saveValuationSections({
    publicId, organizationId: owner.organizationId, user: owner.user,
    sections: [{ id: "mercadoVenta", label: "VII", title: "ENFOQUE DE MERCADO EN VENTA", blocks: [] }],
  });
  await concludeValuation({ publicId, organizationId: owner.organizationId, user: owner.user });
  await reopenValuation({
    publicId, organizationId: owner.organizationId,
    user: { ...owner.user, permissions: [...owner.user.permissions, "AVALUO_REABRIR"] },
    reason: "Revisión de comparables", acceptedText: "Acepto reabrir el avalúo",
  });
}

test("the new fields are saved and read back; a client that leaves them out keeps them; the engine is untouched", async () => {
  const owner = await fixture();
  await saveMarketSettings(owner.publicId, owner.user, {
    comparableType: "INMUEBLE_VENTA", subjectArea: 100, baseArea: null, surfacePower: 6, adoptedUnitValue: null,
    justification: null, additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS,
  });
  await createComparable(owner.publicId, owner.user, "INMUEBLE_VENTA", comparable("Juárez 12, col. Centro, Arandas", 150, 3_000_000, {
    address: { state: "Jalisco", municipality: "Arandas", postalCode: "47180", neighborhood: "Centro", street: "Juárez", number: "12" },
    urbanProximity: "INTERMEDIA", operationType: "VENTA", latitude: 20.7092, longitude: -102.3467,
    consultedOn: "2026-10-20", validUntil: "2026-12-31", listingText: "Vendo casa en Arandas, 150 m² construidos.",
    url: "https://www.inmuebles24.com/propiedades/casa-1.html",
  }));
  const [stored] = (await market(owner.publicId, owner.organizationId)).comparables;
  assert.equal(stored.location, "Juárez 12, col. Centro, Arandas", "the single line stays what the dictamen prints");
  assert.deepEqual(stored.address, { state: "Jalisco", municipality: "Arandas", postalCode: "47180", neighborhood: "Centro", street: "Juárez", number: "12" });
  assert.equal(stored.urbanProximity, "INTERMEDIA");
  assert.equal(stored.operationType, "VENTA");
  assert.equal(stored.latitude, 20.7092);
  assert.equal(stored.longitude, -102.3467);
  assert.equal(stored.consultedOn, "2026-10-20");
  assert.equal(stored.validUntil, "2026-12-31");
  assert.equal(stored.listingText, "Vendo casa en Arandas, 150 m² construidos.");
  assert.match(formatComparableId(stored.folio) ?? "", /^C-\d{5,}$/);
  assert.equal(stored.screenshot, null);
  assert.equal(stored.review?.status, "POR_REVISAR");
  const publication = await prisma.publicacionPropiedad.findFirstOrThrow({
    where: { comparables: { some: { UIdentificadorPublico: stored.id } } },
  });
  assert.equal(publication.SDescripcion, "Vendo casa en Arandas, 150 m² construidos.", "the pasted listing is the publication's text");

  // A client of before sends none of the new fields: they stay as stored.
  const { address: _a, urbanProximity: _u, operationType: _o, latitude: _la, longitude: _lo, consultedOn: _c, validUntil: _v, listingText: _l, ...old } =
    comparableFormValues(stored);
  await updateComparable(owner.publicId, owner.user, stored.id, { ...old, price: 3_100_000, factors: [] });
  const [kept] = (await market(owner.publicId, owner.organizationId)).comparables;
  assert.equal(kept.price, 3_100_000);
  assert.deepEqual(kept.address, stored.address);
  assert.equal(kept.latitude, 20.7092);
  assert.equal(kept.listingText, stored.listingText);
  assert.equal(kept.folio, stored.folio, "editing keeps the number");

  // A lone coordinate is refused, as one outside its range is by the schema.
  await assert.rejects(updateComparable(owner.publicId, owner.user, stored.id, { ...comparableFormValues(kept), latitude: 20.5, longitude: null, factors: [] }),
    /latitud y la longitud/);

  // Screenshot: stored apart from the photos, replaced by a new one, survives edits, removed.
  await setComparableScreenshot(owner.publicId, owner.user, stored.id, await screenshotFile());
  const withScreenshot = (await market(owner.publicId, owner.organizationId)).comparables[0];
  assert.equal(withScreenshot.screenshot?.title, "Pantalla de referencia");
  assert.equal(withScreenshot.photos.length, 0, "the screenshot is not one of the photos");
  await updateComparable(owner.publicId, owner.user, stored.id, { ...comparableFormValues(withScreenshot), notes: "Revisado", factors: [] });
  const edited = (await market(owner.publicId, owner.organizationId)).comparables[0];
  assert.equal(edited.screenshot?.id, withScreenshot.screenshot?.id, "an edit keeps the screenshot");
  await setComparableScreenshot(owner.publicId, owner.user, stored.id, await screenshotFile());
  const replaced = (await market(owner.publicId, owner.organizationId)).comparables[0];
  assert.notEqual(replaced.screenshot?.id, withScreenshot.screenshot?.id);

  // The engine reads none of it: the calculation is the same as with the plain capture.
  const engine = await prisma.ejecucionCalculo.findFirstOrThrow({
    where: { SClaveCalculo: "MOTOR.MERCADO.INMUEBLE_VENTA", versionAvaluo: { avaluo: { UIdentificadorPublico: owner.publicId } } },
  });
  assert.deepEqual((engine.JValoresEntrada as { comparables: unknown[] }).comparables.length, 1);
  assert.equal(Object.keys((engine.JValoresEntrada as { comparables: Record<string, unknown>[] }).comparables[0]).sort().join(","), "area,factors,id,price");

  await removeComparableScreenshot(owner.publicId, owner.user, stored.id);
  assert.equal((await market(owner.publicId, owner.organizationId)).comparables[0].screenshot, null);
});

test("numbers grow per firm; reopening, searching and reusing keep the number, and the card lists the valuations", async () => {
  const owner = await fixture();
  const first = owner.publicId;
  await createComparable(first, owner.user, "TERRENO_VENTA", comparable("Virreyes 30, Arandas", 140, 1_220_000, {
    url: "https://portal.example/virreyes-30",
  }));
  await createComparable(first, owner.user, "TERRENO_VENTA", comparable("Hidalgo 8, Arandas", 160, 1_400_000));
  const [a, b] = (await market(first, owner.organizationId, "TERRENO_VENTA")).comparables;
  assert.ok(a.folio && b.folio && b.folio === a.folio + 1, "consecutive within the firm");
  await setComparableScreenshot(first, owner.user, a.id, await screenshotFile());

  // Another firm counts on its own.
  const other = await fixture();
  await createComparable(other.publicId, other.user, "TERRENO_VENTA", comparable("Virreyes 30, Arandas", 140, 1_220_000));
  assert.equal((await market(other.publicId, other.organizationId, "TERRENO_VENTA")).comparables[0].folio, 1);

  // Reopening copies the comparable with its number and its review.
  await saveComparableReview(first, owner.user, a.id, { status: "VERIFICADO", checks: { photo: true, price: true }, notes: null });
  await concludeAndReopen(first, owner);
  const reopened = (await market(first, owner.organizationId, "TERRENO_VENTA")).comparables;
  assert.deepEqual(reopened.map((item) => item.folio), [a.folio, b.folio]);
  assert.equal(reopened[0].review?.status, "VERIFICADO");
  assert.equal(reopened[0].review?.reviewedBy, "Perito");

  // Found in a search and added: the same number, with the screenshot.
  const second = await anotherValuation(owner);
  const found = await searchComparables(second, owner.user, {
    text: formatComparableId(a.folio) ?? "", type: "TERRENO_VENTA", areaMin: null, areaMax: null, priceMin: null, priceMax: null, limit: 20,
  });
  assert.deepEqual(found.results.map((hit) => hit.folio), [a.folio], "the number finds the comparable");
  await addFoundComparables(second, owner.user, "TERRENO_VENTA", { results: found.results.map(({ id, sourceId, origin, comparable: item }) => ({ id, sourceId, origin, comparable: item })) });
  const added = (await market(second, owner.organizationId, "TERRENO_VENTA")).comparables[0];
  assert.equal(added.folio, a.folio);
  assert.ok(added.screenshot, "the screenshot travels with it");
  assert.equal(added.review?.status, "POR_REVISAR", "the review is of each valuation");

  // "Usar el existente" in a third valuation, into another market.
  const third = await anotherValuation(owner);
  await reuseComparable(third, owner.user, "TERRENO_RENTA", b.id);
  const reused = (await market(third, owner.organizationId, "TERRENO_RENTA")).comparables[0];
  assert.equal(reused.folio, b.folio);
  assert.equal(reused.location, "Hidalgo 8, Arandas");
  assert.match(reused.notes ?? "", /Encontrado en Comparables del despacho/);

  // The card: its evidence and every valuation it is in today (the concluded version does not count twice).
  const card = await getComparableCard(added.id, owner.organizationId);
  assert.equal(card.comparable.folio, a.folio);
  assert.ok(card.comparable.screenshot?.url);
  const folios = await prisma.avaluo.findMany({ where: { UIdentificadorPublico: { in: [first, second] } }, select: { SFolio: true } });
  assert.deepEqual(card.uses.map((use) => use.folio).sort(), folios.map((row) => row.SFolio).sort());

  // Another firm cannot read the card nor reuse the comparable.
  const notFound = (error: Error & { status?: number }) => error.status === 404;
  await assert.rejects(getComparableCard(added.id, other.organizationId), notFound);
  await assert.rejects(reuseComparable(other.publicId, other.user, "TERRENO_VENTA", a.id), notFound);
});

test("duplicates are found by URL, address or phone and price, across valuations of the same firm only", async () => {
  const owner = await fixture();
  const stranger = await fixture();
  const marker = randomUUID().slice(0, 6);
  const street = `Calle ${marker}`;
  await createComparable(owner.publicId, owner.user, "TERRENO_VENTA", comparable(`${street} 45, col. Centro, Arandas`, 200, 2_000_000, {
    url: `https://portal.example/${marker}`, contactPhone: `33 ${marker.replace(/\D/g, "").padEnd(4, "1").slice(0, 4)} 9876`,
  }));
  await createComparable(stranger.publicId, stranger.user, "TERRENO_VENTA", comparable(`${street} 45, col. Centro, Arandas`, 200, 2_000_000, {
    url: `https://portal.example/${marker}`,
  }));
  const [source] = (await market(owner.publicId, owner.organizationId, "TERRENO_VENTA")).comparables;
  const next = await anotherValuation(owner);

  const byUrl = await findDuplicates(next, owner.organizationId, { url: `http://www.portal.example/${marker}/`, location: "", contactPhone: null, price: null });
  assert.deepEqual(byUrl.map((match) => [match.comparableId, match.reasons, match.sameValuation]), [[source.id, ["URL"], false]]);

  const byAddress = await findDuplicates(next, owner.organizationId, {
    url: null, location: "", address: { street, number: "45", neighborhood: "Centro", municipality: "Arandas" }, contactPhone: null, price: null,
  });
  assert.deepEqual(byAddress.map((match) => match.reasons), [["ADDRESS"]]);
  assert.equal(byAddress[0].folio, source.folio);

  const byPhone = await findDuplicates(next, owner.organizationId, { url: null, location: "Otro lugar", contactPhone: source.contactPhone, price: 2_015_000 });
  assert.deepEqual(byPhone.map((match) => match.reasons), [["PHONE_PRICE"]]);
  assert.deepEqual(await findDuplicates(next, owner.organizationId, { url: null, location: "Otro lugar", contactPhone: source.contactPhone, price: 2_100_000 }), []);

  // The valuation's own comparable is marked; another firm never sees this one.
  const own = await findDuplicates(owner.publicId, owner.organizationId, { url: `https://portal.example/${marker}`, location: "", contactPhone: null, price: null });
  assert.equal(own[0].sameValuation, true);
  const theirs = await findDuplicates(stranger.publicId, stranger.organizationId, { url: `https://portal.example/${marker}`, location: "", contactPhone: null, price: null });
  assert.equal(theirs.length, 1);
  assert.notEqual(theirs[0].comparableId, source.id);
  await assert.rejects(findDuplicates(owner.publicId, stranger.organizationId, byUrl[0] as never), (error: Error & { status?: number }) => error.status === 404);

  // An import row answered with "Usar el existente" brings that one, with its number.
  await importComparables(next, owner.user, "TERRENO_VENTA", [{ reuseFrom: source.id }, comparable("Nuevo 1, Arandas", 100, 900_000)]);
  const imported = (await market(next, owner.organizationId, "TERRENO_VENTA")).comparables;
  assert.equal(imported[0].folio, source.folio);
  assert.notEqual(imported[1].folio, source.folio);
});

test("the review is saved per comparable with who and when, lists every market, warns, and changes no calculation", async () => {
  const owner = await fixture();
  await saveMarketSettings(owner.publicId, owner.user, {
    comparableType: "INMUEBLE_VENTA", subjectArea: 100, baseArea: null, surfacePower: 6, adoptedUnitValue: null,
    justification: null, additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS,
  });
  await createComparable(owner.publicId, owner.user, "INMUEBLE_VENTA", comparable("Juárez 12, Arandas", 150, 3_000_000));
  await createComparable(owner.publicId, owner.user, "TERRENO_VENTA", comparable("Calle Hidalgo, Arandas", 200, 1_000_000, { contactName: "Lamudi", contactPhone: null }));
  const valueBefore = (await prisma.enfoqueMercado.findMany({ where: { versionAvaluo: { avaluo: { UIdentificadorPublico: owner.publicId } } } }))
    .map((row) => String(row.NValorMercado)).sort();

  const rows = await getValuationReview(owner.publicId, owner.organizationId);
  assert.deepEqual(rows.map((row) => row.type), ["TERRENO_VENTA", "INMUEBLE_VENTA"], "every market, in the order of the types");
  assert.deepEqual(rows[0].warnings.map((warning) => warning.key), ["NO_NUMBER", "PORTAL_CONTACT", "NO_SCREENSHOT"]);
  assert.deepEqual(rows[1].warnings.map((warning) => warning.key), ["BUILT_AREA", "NO_SCREENSHOT"], "150 m² against the subject's 100 m²");

  const review = await saveComparableReview(owner.publicId, owner.user, rows[1].comparable.id, {
    status: "CON_OBSERVACIONES", checks: { photo: true, builtArea: false }, notes: "La superficie del anuncio es de 120 m².",
  });
  assert.equal(review.status, "CON_OBSERVACIONES");
  assert.equal(review.reviewedBy, "Perito");
  assert.ok(review.reviewedAt && Date.now() - Date.parse(review.reviewedAt) < 60_000);
  const reread = await getValuationReview(owner.publicId, owner.organizationId);
  assert.deepEqual(reread[1].comparable.review?.checks, { photo: true, builtArea: false });
  assert.equal(reread[0].comparable.review?.status, "POR_REVISAR");

  const valueAfter = (await prisma.enfoqueMercado.findMany({ where: { versionAvaluo: { avaluo: { UIdentificadorPublico: owner.publicId } } } }))
    .map((row) => String(row.NValorMercado)).sort();
  assert.deepEqual(valueAfter, valueBefore);

  // A reviewer (AVALUO_REVISAR, no AVALUO_EDITAR) may review; the route lets either permission in.
  const reviewer = { ...owner.user, name: "Revisora", role: "REVISOR" as const, permissions: ["AVALUO_VER", "AVALUO_REVISAR"] };
  assert.equal(authorizeApiUser(reviewer, REVIEW_COMPARABLES_PERMISSIONS).ok, true);
  assert.equal(authorizeApiUser({ ...reviewer, permissions: ["AVALUO_VER"] }, REVIEW_COMPARABLES_PERMISSIONS).ok, false);
  assert.equal(authorizeApiUser(reviewer, "AVALUO_EDITAR").ok, false, "the rest of the valuation stays read-only for the reviewer");
  const byReviewer = await saveComparableReview(owner.publicId, reviewer, rows[0].comparable.id, { status: "RECHAZADO", checks: { address: false }, notes: "Sin número." });
  assert.equal(byReviewer.reviewedBy, "Revisora");
  assert.equal((await getValuationReview(owner.publicId, owner.organizationId))[0].comparable.review?.status, "RECHAZADO");

  // Another firm can neither read nor review it.
  const stranger = await fixture();
  const notFound = (error: Error & { status?: number }) => error.status === 404;
  await assert.rejects(getValuationReview(owner.publicId, stranger.organizationId), notFound);
  await assert.rejects(saveComparableReview(owner.publicId, stranger.user, rows[1].comparable.id, { status: "RECHAZADO", checks: {}, notes: null }), notFound);
  // And a concluded valuation keeps its review as it was.
  await saveValuationSections({
    publicId: owner.publicId, organizationId: owner.organizationId, user: owner.user,
    sections: [{ id: "mercadoVenta", label: "VII", title: "ENFOQUE DE MERCADO EN VENTA", blocks: [] }],
  });
  await concludeValuation({ publicId: owner.publicId, organizationId: owner.organizationId, user: owner.user });
  for (const actor of [owner.user, reviewer]) {
    await assert.rejects(saveComparableReview(owner.publicId, actor, rows[0].comparable.id, { status: "VERIFICADO", checks: {}, notes: null }),
      (error: Error & { status?: number }) => error.status === 409);
  }
});
