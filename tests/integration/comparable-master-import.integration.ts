import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import type { AuthUser } from "../../src/features/auth/model";
import { findDuplicates, getComparableCard } from "../../src/features/valuations/calculation/comparable-card.service";
import type { CellValue } from "../../src/features/valuations/calculation/comparable-import";
import { MASTER_COLUMNS } from "../../src/features/valuations/calculation/comparable-master";
import { readComparableFile } from "../../src/features/valuations/calculation/comparable-workbook";
import { getMarketCalculation } from "../../src/features/valuations/calculation/market.service";
import { listComparableBase } from "../../src/features/valuations/comparable-base/comparable-base.service";
import { exportFirmBase, exportValuationComparables } from "../../src/features/valuations/comparable-base/comparable-export.service";
import { previewComparableImport, runComparableImport, type ComparableFile } from "../../src/features/valuations/comparable-base/comparable-import.service";
import { parseComparableListParams } from "../../src/features/valuations/comparable-base/comparable-list-params";
import { parseComparableSheet } from "../../src/features/valuations/calculation/comparable-import-plan";
import { ownBaseSource } from "../../src/features/valuations/comparable-search/sources/own-base.source";
import { createValuationFixture, prisma } from "./support";

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

after(() => prisma.$disconnect());

const headers = MASTER_COLUMNS.map((column) => column.header);
const file = (rows: Array<Record<string, CellValue>>, destination: ComparableFile["destination"] = null): ComparableFile => ({
  rows: [["VALUAXIS SOFT"], [], [], [], ["01"], headers, ...rows.map((row) => headers.map((header) => row[header] ?? null))],
  destination,
});

async function anotherValuation(base: Fixture, folio: string, locked = false) {
  const valuation = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: base.publicId } });
  const created = await prisma.avaluo.create({
    data: {
      IdOrganizacion: valuation.IdOrganizacion,
      IdUsuarioCreador: valuation.IdUsuarioCreador,
      IdEstadoAvaluo: valuation.IdEstadoAvaluo,
      IdTipoAvaluo: valuation.IdTipoAvaluo,
      IdTipoInmueble: valuation.IdTipoInmueble,
      IdTipoOperacion: valuation.IdTipoOperacion,
      SFolio: folio,
      STitulo: "Otro avalúo",
      BBloqueado: locked,
      DFechaBloqueo: locked ? new Date() : null,
      DFechaModificacion: new Date(),
    },
  });
  return created.UIdentificadorPublico;
}

const listing = (marker: string, id: string, extra: Record<string, CellValue> = {}): Record<string, CellValue> => ({
  "Estado de uso": "Aceptado", "Tipo de inmueble": "Terreno", "Operación": "Venta", "Portal / fuente": "Inmuebles24",
  "ID publicación": `${marker}-${id}`, "Calle y número": `Hidalgo ${id}`, "Colonia / localidad": `Centro ${marker}`, "Municipio": `Arandas${marker}`,
  "Estado": "Jalisco", "Sup. terreno (m²)": 200 + Number(id), "Precio de oferta": 1_000_000 + Number(id) * 1000, "Base del unitario": "Terreno m²",
  "URL de publicación": `https://www.inmuebles24.com/propiedades/${marker}-${id}.html?utm_source=x`, "Contacto / anunciante": "Ana López",
  "Teléfono": "3481234567", "Datos verificados": "Sí", "Revisó": "Álvaro", "Fecha revisión": "20/10/2026",
  ...extra,
});

const reviewer = (fixture: Fixture): AuthUser => ({ ...fixture.user, permissions: ["AVALUO_VER", "AVALUO_EDITAR"] });
const baseRows = (organizationId: number, query: Record<string, string> = {}) => listComparableBase(organizationId, parseComparableListParams(query));

test("Solo base general keeps each row as a comparable of the base without a valuation, with its review and listing data", async () => {
  const fixture = await createValuationFixture();
  const marker = randomUUID().slice(0, 6);
  const sheet = file([listing(marker, "1"), listing(marker, "2", { "Estado de uso": "Pendiente" }), listing(marker, "3", { "Estado de uso": "Descartado" })], "BASE");

  const preview = await previewComparableImport(fixture.user, { kind: "base" }, sheet, { destination: null, defaultType: null });
  assert.equal(preview.destination, "BASE", "the destination comes from INICIO");
  assert.equal(preview.format, "MAESTRA");
  assert.equal(preview.valid, 2);
  assert.equal(preview.skipped, 1, "Descartado is not imported");
  assert.deepEqual(preview.rows.map((row) => row.review), ["VERIFICADO", "POR_REVISAR", null]);

  const summary = await runComparableImport(fixture.user, { kind: "base" }, sheet, { destination: null, defaultType: null, reuse: {}, merge: {} });
  assert.deepEqual(summary.toBase, { created: 2, updated: 0, kept: 0 });
  assert.equal(summary.toValuations, 0);

  const page = await baseRows(fixture.organizationId, { municipio: `Arandas${marker}` });
  assert.equal(page.total, 2);
  assert.ok(page.items.every((item) => item.folio && item.uses.length === 0), "numbered, used in no valuation");
  const stored = await prisma.comparableAvaluo.findMany({ where: { IdOrganizacion: fixture.organizationId, IdAvaluo: null } });
  assert.equal(stored.length, 2);
  assert.ok(stored.every((row) => row.IdVersionAvaluo === null));

  const first = page.items.find((item) => item.location.startsWith("Hidalgo 1,"));
  assert.ok(first);
  const card = await getComparableCard(first.id, fixture.organizationId);
  assert.equal(card.valuation, null);
  assert.equal(card.comparable.review?.status, "VERIFICADO");
  assert.equal(card.comparable.review?.reviewedBy, "Álvaro");
  assert.equal(card.comparable.listingDetails?.publicationId, `${marker}-1`);
  assert.equal(card.comparable.propertyDetails?.unitBasis, "TERRENO_M2");
  assert.equal(card.comparable.price, 1_001_000);

  // Another organization sees none of it.
  const stranger = await createValuationFixture();
  assert.equal((await baseRows(stranger.organizationId, { municipio: `Arandas${marker}` })).total, 0);
  await assert.rejects(getComparableCard(first.id, stranger.organizationId), (error: Error & { status?: number }) => error.status === 404);
});

test("the same portal and publication id, or the same canonical URL, is the same comparable: the import proposes merging", async () => {
  const fixture = await createValuationFixture();
  const marker = randomUUID().slice(0, 6);
  await runComparableImport(fixture.user, { kind: "base" }, file([listing(marker, "1")], "BASE"), { destination: null, defaultType: null, reuse: {}, merge: {} });
  const [original] = (await baseRows(fixture.organizationId, { municipio: `Arandas${marker}` })).items;

  // The same publication with a new price, and the same URL written another way (no www, another query, trailing slash).
  const again = file([
    listing(marker, "1", { "Precio de oferta": 950_000, "Fecha de consulta": "22/10/2099" }),
    listing(marker, "9", {
      "ID publicación": null, "Calle y número": "Otra 5", "Sup. terreno (m²)": 999, "Precio de oferta": 5,
      "URL de publicación": `http://inmuebles24.com/propiedades/${marker}-1.html/?ref=mail#fotos`,
    }),
  ], "BASE");
  const preview = await previewComparableImport(fixture.user, { kind: "base" }, again, { destination: null, defaultType: null });
  assert.deepEqual(preview.rows[0].duplicates?.[0].reasons.slice(0, 2), ["PUBLICATION", "URL"]);
  assert.equal(preview.rows[0].suggested, `merge:${original.id}`);
  assert.deepEqual(preview.rows[1].duplicates?.[0].reasons, ["URL"]);
  assert.equal(preview.rows[1].suggested, `merge:${original.id}`);

  // "Es el mismo" for the first (newer data stays, the number too), "son diferentes" for the second.
  const summary = await runComparableImport(fixture.user, { kind: "base" }, again, {
    destination: null, defaultType: null, reuse: {}, merge: { 7: original.id },
  });
  assert.deepEqual(summary.toBase, { created: 1, updated: 1, kept: 0 });
  const page = await baseRows(fixture.organizationId, { municipio: `Arandas${marker}` });
  assert.equal(page.total, 2);
  const merged = page.items.find((item) => item.folio === original.folio);
  assert.equal(merged?.price, 950_000);
  assert.equal(merged?.id, original.id, "a comparable of the base without a valuation is updated in place");
});

test("Ambos from the Comparables page adds each row to the valuation of its folio; unknown or concluded folios stay in the base with a warning", async () => {
  const fixture = await createValuationFixture();
  const marker = randomUUID().slice(0, 6);
  const open = `AV-${marker}`;
  const openId = await anotherValuation(fixture, open);
  const locked = `CL-${marker}`;
  await anotherValuation(fixture, locked, true);
  const stranger = await createValuationFixture();
  const theirs = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: stranger.publicId }, select: { SFolio: true } });
  const sheet = file([
    listing(marker, "1", { "Folio avalúo": open.toLowerCase() }),
    listing(marker, "2", { "Folio avalúo": "NO-EXISTE" }),
    listing(marker, "3", { "Folio avalúo": locked }),
    listing(marker, "4", { "Folio avalúo": theirs.SFolio }),
    listing(marker, "5", { "Tipo de inmueble": "Casa habitación", "Sup. construcción (m²)": 120, "Base del unitario": "Construcción m²", "Folio avalúo": open }),
  ], "AMBOS");
  const preview = await previewComparableImport(fixture.user, { kind: "base" }, sheet, { destination: null, defaultType: null });
  assert.deepEqual(preview.rows.map((row) => row.target?.kind), ["valuation", "base", "base", "base", "valuation"]);
  assert.match(preview.rows[1].warnings?.join(" ") ?? "", /No hay un avalúo con folio NO-EXISTE/);
  assert.match(preview.rows[2].warnings?.join(" ") ?? "", /concluido/);
  assert.match(preview.rows[3].warnings?.join(" ") ?? "", /No hay un avalúo/, "a folio of another organization is unknown here");

  const summary = await runComparableImport(fixture.user, { kind: "base" }, sheet, { destination: null, defaultType: null, reuse: {}, merge: {} });
  assert.equal(summary.toValuations, 2);
  assert.equal(summary.toBase.created, 3);
  const land = (await getMarketCalculation(openId, fixture.organizationId, "TERRENO_VENTA")).comparables;
  const built = (await getMarketCalculation(openId, fixture.organizationId, "INMUEBLE_VENTA")).comparables;
  assert.equal(land.length, 1);
  assert.equal(built.length, 1);
  assert.equal(land[0].review?.status, "VERIFICADO");
  assert.equal((await baseRows(fixture.organizationId, { municipio: `Arandas${marker}` })).total, 5, "one card per listing in the base");
  assert.equal((await baseRows(stranger.organizationId, { municipio: `Arandas${marker}` })).total, 0);

  // Solo avalúo: a row without a usable folio is not imported.
  const only = await previewComparableImport(fixture.user, { kind: "base" }, sheet, { destination: "AVALUO", defaultType: null });
  assert.deepEqual(only.rows.map((row) => row.target?.kind), ["valuation", "skip", "skip", "skip", "valuation"]);
});

test("from a valuation's market: other types go to the base with Ambos, the folio is informative, and a reviewer-less user imports por revisar", async () => {
  const fixture = await createValuationFixture();
  const marker = randomUUID().slice(0, 6);
  const folio = (await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId }, select: { SFolio: true } })).SFolio;
  const origin = { kind: "valuation" as const, valuationId: fixture.publicId, valuationFolio: folio, type: "TERRENO_VENTA" as const };
  const sheet = file([
    listing(marker, "1", { "Tipo de inmueble": null, "Operación": null, "Folio avalúo": "OTRO-1" }),
    listing(marker, "2", { "Tipo de inmueble": "Departamento", "Operación": "Renta", "Sup. construcción (m²)": 80, "Base del unitario": "Construcción m²" }),
  ]);
  const viewer: AuthUser = { ...fixture.user, permissions: ["AVALUO_VER", "AVALUO_EDITAR"].filter((key) => key !== "AVALUO_EDITAR") };
  // Without review permission, "Aceptado + Sí" imports por revisar (the route itself requires editing; the rule is the review's).
  const asViewer = await previewComparableImport(viewer, origin, sheet, { destination: null, defaultType: "TERRENO_VENTA" });
  assert.equal(asViewer.rows[0].review, "POR_REVISAR");
  assert.match(asViewer.rows[0].warnings?.join(" ") ?? "", /no puede revisar/);

  const preview = await previewComparableImport(reviewer(fixture), origin, sheet, { destination: null, defaultType: "TERRENO_VENTA" });
  assert.equal(preview.destination, "AMBOS");
  assert.deepEqual(preview.rows.map((row) => row.target?.kind), ["valuation", "base"]);
  assert.match(preview.rows[0].warnings?.join(" ") ?? "", /no es el de este avalúo/);
  assert.match(preview.rows[1].warnings?.join(" ") ?? "", /inmuebles en renta/);
  const summary = await runComparableImport(reviewer(fixture), origin, sheet, { destination: null, defaultType: "TERRENO_VENTA", reuse: {}, merge: {} });
  assert.equal(summary.toValuations, 1);
  assert.equal(summary.toBase.created, 1);

  // The comparable in the base without a valuation is found from a valuation: by duplicates and by the search.
  const [rent] = (await baseRows(fixture.organizationId, { municipio: `Arandas${marker}`, tipo: "INMUEBLE_RENTA" })).items;
  assert.ok(rent);
  const matches = await findDuplicates(fixture.publicId, fixture.organizationId, {
    url: `https://inmuebles24.com/propiedades/${marker}-2.html`, location: "", contactPhone: null, price: null,
  });
  assert.equal(matches[0]?.comparableId, rent.id);
  assert.equal(matches[0]?.valuation, null);
  const found = await ownBaseSource.search(
    { text: `Arandas${marker}`, type: "INMUEBLE_RENTA", areaMin: null, areaMax: null, priceMin: null, priceMax: null, limit: 10 },
    { organizationId: fixture.organizationId, valuationId: (await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } })).IdAvaluo, signal: new AbortController().signal },
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].origin, "base general");
});

test("export: the base with its filters and a valuation's market, re-importable; contact only for who can edit", async () => {
  const fixture = await createValuationFixture();
  const marker = randomUUID().slice(0, 6);
  await runComparableImport(fixture.user, { kind: "base" }, file([
    listing(marker, "1"), listing(marker, "2", { "Municipio": `Tepa${marker}` }),
  ], "BASE"), { destination: null, defaultType: null, reuse: {}, merge: {} });
  await runComparableImport(fixture.user, { kind: "valuation", valuationId: fixture.publicId, valuationFolio: "x", type: "TERRENO_VENTA" },
    file([listing(marker, "3", { "Municipio": `Arandas${marker}` })]), { destination: "AVALUO", defaultType: "TERRENO_VENTA", reuse: {}, merge: {} });

  const filtered = await exportFirmBase(fixture.user, parseComparableListParams({ municipio: `Arandas${marker}` }));
  assert.equal(filtered.count, 2, "the filters of the page apply");
  const exported = await readComparableFile(filtered.buffer, "base.xlsx");
  assert.equal(exported.destination, "BASE");
  const rows = parseComparableSheet(exported.rows, { defaultType: null }).rows;
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.payload?.contactPhone === "3481234567" && row.folio));

  const viewer: AuthUser = { ...fixture.user, permissions: ["AVALUO_VER"] };
  const hidden = parseComparableSheet((await readComparableFile((await exportFirmBase(viewer, parseComparableListParams({ municipio: `Arandas${marker}` }))).buffer, "b.xlsx")).rows, { defaultType: null }).rows;
  assert.ok(hidden.every((row) => row.payload?.contactPhone === null && row.payload?.contactName === null));

  // Imported back, each row is recognized by its number and proposed as the same comparable.
  const back = await previewComparableImport(fixture.user, { kind: "base" }, exported, { destination: null, defaultType: null });
  assert.deepEqual(back.rows.map((row) => ({ folio: row.duplicates?.some((match) => match.reasons.includes("FOLIO")), suggested: Boolean(row.suggested) })),
    [{ folio: true, suggested: true }, { folio: true, suggested: true }], JSON.stringify(back.rows));

  // A valuation's market: its folio in INICIO and in each row; imported back into it, the comparable is updated in place.
  const market = await exportValuationComparables(fixture.user, fixture.publicId, "TERRENO_VENTA");
  assert.equal(market.count, 1);
  const marketFile = await readComparableFile(market.buffer, "mercado.xlsx");
  const folio = market.folio;
  const marketRows = parseComparableSheet(marketFile.rows, { defaultType: null }).rows;
  assert.equal(marketRows[0].valuationFolio, folio);
  const origin = { kind: "valuation" as const, valuationId: fixture.publicId, valuationFolio: folio, type: "TERRENO_VENTA" as const };
  const again = await previewComparableImport(fixture.user, origin, marketFile, { destination: null, defaultType: "TERRENO_VENTA" });
  const answer = again.rows[0].suggested;
  assert.ok(answer);
  await runComparableImport(fixture.user, origin, marketFile, {
    destination: null, defaultType: "TERRENO_VENTA", reuse: {}, merge: { [again.rows[0].row]: answer.split(":")[1] },
  });
  assert.equal((await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).comparables.length, 1, "not duplicated in its valuation");
});
