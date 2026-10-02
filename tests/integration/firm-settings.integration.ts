import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { after, test } from "node:test";
import sharp from "sharp";
import { firmSettingsSchema } from "../../src/features/firm/firm-schemas";
import {
  deleteFirmLogo,
  getFactorCatalog,
  getFirmSettings,
  getLetterhead,
  replaceFirmLogo,
  saveFactorCatalog,
  saveFirmSettings,
  signedLogoUrl,
} from "../../src/features/firm/firm.service";
import { EMPTY_FACTOR_CATALOG, type FactorCatalog } from "../../src/features/valuations/calculation/factor-catalog";
import { SAMPLE_FACTOR_CATALOG } from "../support/sample-factor-catalog";
import { createComparable, getMarketCalculation, saveMarketSettings } from "../../src/features/valuations/calculation/market.service";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { createValuationFixture, prisma } from "./support";

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

/** Local storage writes under public/; remove what these tests stored. */
const storedOrganizations = new Set<string>();
after(async () => {
  for (const uuid of storedOrganizations) await rm(join(process.cwd(), "public", "organizaciones", uuid), { recursive: true, force: true });
  await prisma.$disconnect();
});

async function organizationUuid(fixture: Fixture) {
  const { UIdentificadorPublico } = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: fixture.organizationId } });
  storedOrganizations.add(UIdentificadorPublico);
  return UIdentificadorPublico;
}

async function png(color: string) {
  const buffer = await sharp({ create: { width: 40, height: 20, channels: 4, background: color } }).png().toBuffer();
  return new File([new Uint8Array(buffer)], "logo.png", { type: "image/png" });
}

const settings = firmSettingsSchema.parse({
  legalName: "  Valuadores de los Altos S.A. de C.V. ",
  rfc: "vaa010101ab1",
  address: "Av. Hidalgo 100, Arandas, Jalisco",
  phone: "348 000 0000",
  email: "Contacto@Despacho.MX",
  signers: [
    { name: "Ing. Álvaro Gutiérrez", cedula: "CED-12345", role: "Perito valuador" },
    { name: "Arq. Ana Ruiz", cedula: "7654321" },
  ],
  validityMonths: 12,
  folioPrefix: "vda",
});

const auditRows = (organizationId: number, action: string) =>
  prisma.auditoria.findMany({ where: { IdOrganizacion: organizationId, SAccion: action }, orderBy: { IdAuditoria: "asc" } });

/* ------------------------------------------------------------------ */
/*  Datos del despacho                                                 */
/* ------------------------------------------------------------------ */

test("a new firm starts with its name, the default prefix and validity, and nothing else", async () => {
  const fixture = await createValuationFixture();
  assert.deepEqual(await getFirmSettings(fixture.organizationId), {
    name: fixture.user.organizationName,
    legalName: null,
    rfc: null,
    address: null,
    phone: null,
    email: null,
    signers: [],
    validityMonths: 6,
    folioPrefix: "VLO",
    logoUrl: null,
  });
});

test("saving the firm's data updates only that firm, feeds the letterhead and is audited", async () => {
  const fixture = await createValuationFixture();
  const other = await createValuationFixture();
  await saveFirmSettings(fixture.user, settings);

  const saved = await getFirmSettings(fixture.organizationId);
  assert.deepEqual(saved, {
    name: fixture.user.organizationName,
    legalName: "Valuadores de los Altos S.A. de C.V.",
    rfc: "VAA010101AB1",
    address: "Av. Hidalgo 100, Arandas, Jalisco",
    phone: "348 000 0000",
    email: "contacto@despacho.mx",
    signers: [
      { name: "Ing. Álvaro Gutiérrez", cedula: "CED-12345", role: "Perito valuador" },
      { name: "Arq. Ana Ruiz", cedula: "7654321", role: "" },
    ],
    validityMonths: 12,
    folioPrefix: "VDA",
    logoUrl: null,
  });
  assert.deepEqual(await getLetterhead(fixture.organizationId), {
    name: fixture.user.organizationName,
    legalName: saved.legalName,
    rfc: saved.rfc,
    address: saved.address,
    phone: saved.phone,
    email: saved.email,
    logoUrl: null,
  });

  const untouched = await getFirmSettings(other.organizationId);
  assert.equal(untouched.legalName, null);
  assert.equal(untouched.folioPrefix, "VLO");

  const [audit] = await auditRows(fixture.organizationId, "FIRM_SETTINGS");
  assert.equal(audit.IdUsuario, fixture.user.id);
  assert.deepEqual(audit.JMetadatos, { folioPrefix: "VDA", validityMonths: 12 });
});

test("clearing optional fields stores them empty", async () => {
  const fixture = await createValuationFixture();
  await saveFirmSettings(fixture.user, settings);
  await saveFirmSettings(fixture.user, firmSettingsSchema.parse({ legalName: " ", rfc: "", email: "", validityMonths: 6, folioPrefix: "VDA" }));
  const saved = await getFirmSettings(fixture.organizationId);
  assert.equal(saved.legalName, null);
  assert.equal(saved.rfc, null);
  assert.equal(saved.email, null);
  assert.deepEqual(saved.signers, []);
});

test("a deleted or inactive firm cannot be read or saved", async () => {
  const fixture = await createValuationFixture();
  await prisma.organizacion.update({ where: { IdOrganizacion: fixture.organizationId }, data: { BActivo: false } });
  await assert.rejects(getFirmSettings(fixture.organizationId), /ORGANIZATION_NOT_FOUND/);
  await assert.rejects(getLetterhead(fixture.organizationId), /ORGANIZATION_NOT_FOUND/);
  await assert.rejects(saveFirmSettings(fixture.user, settings), /ORGANIZATION_NOT_FOUND/);
  await assert.rejects(getFactorCatalog(fixture.organizationId), /ORGANIZATION_NOT_FOUND/);
  await assert.rejects(saveFactorCatalog(fixture.user, null), /ORGANIZATION_NOT_FOUND/);
});

/* ------------------------------------------------------------------ */
/*  Logo                                                               */
/* ------------------------------------------------------------------ */

test("the logo is stored privately for the firm, replaced cleanly and removed", async () => {
  const fixture = await createValuationFixture();
  const other = await createValuationFixture();
  const uuid = await organizationUuid(fixture);

  const firstUrl = await replaceFirmLogo(fixture.user, await png("#1d4ed8"));
  assert.match(firstUrl ?? "", /^\/api\/organizacion\/despacho\/logo\?v=[0-9a-f-]{36}$/);
  assert.equal((await getFirmSettings(fixture.organizationId)).logoUrl, firstUrl);
  assert.equal((await getLetterhead(fixture.organizationId)).logoUrl, firstUrl);
  const first = await prisma.archivo.findUniqueOrThrow({ where: { UIdentificadorPublico: firstUrl!.split("v=")[1] } });
  assert.equal(first.IdOrganizacion, fixture.organizationId);
  assert.equal(first.BPrivado, true);
  assert.equal(first.STipoMime, "image/jpeg", "normalized to JPEG");
  assert.ok(first.SClaveObjeto.startsWith(`organizaciones/${uuid}/perfil/logotipo/`));
  assert.ok(existsSync(join(process.cwd(), "public", first.SClaveObjeto)));
  assert.equal(await signedLogoUrl(fixture.organizationId), `/${first.SClaveObjeto}`);

  // Another firm never sees it.
  assert.equal(await signedLogoUrl(other.organizationId), null);
  assert.equal((await getFirmSettings(other.organizationId)).logoUrl, null);

  const secondUrl = await replaceFirmLogo(fixture.user, await png("#dc2626"));
  assert.notEqual(secondUrl, firstUrl);
  const previous = await prisma.archivo.findUniqueOrThrow({ where: { IdArchivo: first.IdArchivo } });
  assert.equal(previous.BActivo, false);
  assert.ok(previous.DFechaEliminacion);
  assert.ok(!existsSync(join(process.cwd(), "public", first.SClaveObjeto)), "the old file is deleted");
  const principal = await prisma.relacionArchivo.count({ where: { SEntidad: "ORGANIZACION_LOGO", SIdentificadorEntidad: uuid, BPrincipal: true } });
  assert.equal(principal, 1, "a single current logo");
  assert.equal((await auditRows(fixture.organizationId, "FIRM_LOGO")).length, 2);

  const second = await prisma.archivo.findUniqueOrThrow({ where: { UIdentificadorPublico: secondUrl!.split("v=")[1] } });
  await deleteFirmLogo(fixture.user);
  assert.equal((await getFirmSettings(fixture.organizationId)).logoUrl, null);
  assert.equal(await signedLogoUrl(fixture.organizationId), null);
  assert.ok(!existsSync(join(process.cwd(), "public", second.SClaveObjeto)));
  await deleteFirmLogo(fixture.user); // nothing left: no error
});

test("only real JPEG, PNG or WebP images are accepted as a logo", async () => {
  const fixture = await createValuationFixture();
  await organizationUuid(fixture);
  const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).gif().toBuffer();
  await assert.rejects(replaceFirmLogo(fixture.user, new File([new Uint8Array(gif)], "logo.gif", { type: "image/gif" })), /Tipo de archivo no permitido/);
  await assert.rejects(replaceFirmLogo(fixture.user, new File(["no es imagen"], "logo.png", { type: "image/png" })), /no es una imagen valida/);
  const jpeg = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).jpeg().toBuffer();
  await assert.rejects(replaceFirmLogo(fixture.user, new File([new Uint8Array(jpeg)], "logo.png", { type: "image/png" })), /no coincide con el tipo declarado/);
  assert.equal((await getFirmSettings(fixture.organizationId)).logoUrl, null);
});

/* ------------------------------------------------------------------ */
/*  Factor catalog per firm                                            */
/* ------------------------------------------------------------------ */

const customCatalog: FactorCatalog = {
  factors: { ZONA: [{ label: "Igual", value: 1 }, { label: "Mejor", value: 1.08 }, { label: "Peor", value: 0.92 }] },
  limits: { factorMin: 0.8, factorMax: 1.2, resultantMin: 0.7, resultantMax: 1.3 },
};

test("each firm has its own factor catalog; saving and resetting are audited", async () => {
  const fixture = await createValuationFixture();
  const other = await createValuationFixture();
  await saveFactorCatalog(fixture.user, customCatalog);

  assert.deepEqual(await getFactorCatalog(fixture.organizationId), { catalog: customCatalog, customized: true });
  assert.deepEqual(await getFactorCatalog(other.organizationId), { catalog: EMPTY_FACTOR_CATALOG, customized: false });

  await saveFactorCatalog(fixture.user, null);
  assert.deepEqual(await getFactorCatalog(fixture.organizationId), { catalog: EMPTY_FACTOR_CATALOG, customized: false });
  assert.equal((await auditRows(fixture.organizationId, "FACTOR_CATALOG_SAVE")).length, 1);
  assert.equal((await auditRows(fixture.organizationId, "FACTOR_CATALOG_RESET")).length, 1);
});

test("a stored catalog that no longer validates falls back to the proposal", async () => {
  const fixture = await createValuationFixture();
  await prisma.organizacion.update({ where: { IdOrganizacion: fixture.organizationId }, data: { JCatalogoFactores: { factors: "roto" } } });
  const { catalog, customized } = await getFactorCatalog(fixture.organizationId);
  assert.deepEqual(catalog, EMPTY_FACTOR_CATALOG);
  assert.equal(customized, true, "the firm did store something");
});

/* ------------------------------------------------------------------ */
/*  Market comparables follow the firm's catalog                       */
/* ------------------------------------------------------------------ */

const base: Omit<ComparableInputPayload, "location" | "factors"> = {
  area: 200, price: 1_600_000, landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null,
  services: null, notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null,
};

async function zoneOf(fixture: Fixture, type: "TERRENO_VENTA" | "INMUEBLE_RENTA", location: string) {
  const calculation = await getMarketCalculation(fixture.publicId, fixture.organizationId, type);
  return calculation.comparables.find((row) => row.location === location)!.factors.find((factor) => factor.type === "ZONA")!;
}

test("with a firm catalog, comparables follow the subject's new rating using that catalog's values", async () => {
  const fixture = await createValuationFixture();
  await saveFactorCatalog(fixture.user, customCatalog);
  const current = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  const withSubject = (option: string | null) => ({
    ...current.settings,
    factorSlots: current.settings.factorSlots.map((slot) => (slot.type === "ZONA" ? { ...slot, subjectOption: option } : slot)),
  });
  // A comparable captured before the subject was rated is not touched by the first rating.
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", {
    ...base, location: "Antes", factors: [{ type: "ZONA", value: 1 / 1.08, subjectRating: 1, comparableRating: 1.08, justification: null }],
  });
  await saveMarketSettings(fixture.publicId, fixture.user, withSubject("Igual"));
  assert.equal((await zoneOf(fixture, "TERRENO_VENTA", "Antes")).justification, null, "the first rating does not rewrite comparables");

  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", {
    ...base, location: "Del catálogo", factors: [{ type: "ZONA", value: 1 / 0.92, subjectRating: 1, comparableRating: 0.92, justification: "Zona: sujeto Igual (1) / comparable Peor (0.92)" }],
  });
  await saveMarketSettings(fixture.publicId, fixture.user, withSubject("Mejor"));

  const followed = await zoneOf(fixture, "TERRENO_VENTA", "Del catálogo");
  assert.equal(followed.subjectRating, 1.08);
  assert.ok(Math.abs((followed.value ?? 0) - 1.08 / 0.92) < 1e-6);
  assert.equal(followed.justification, "Zona: sujeto Mejor (1.08) / comparable Peor (0.92)");
  assert.equal((await zoneOf(fixture, "TERRENO_VENTA", "Antes")).subjectRating, 1.08, "rated with the previous option, so it follows too");
});

test("a subject option missing from the catalog, or clearing it, leaves the comparables alone", async () => {
  const fixture = await createValuationFixture();
  const current = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  const withSubject = (option: string | null) => ({
    ...current.settings,
    factorSlots: current.settings.factorSlots.map((slot) => (slot.type === "ZONA" ? { ...slot, subjectOption: option } : slot)),
  });
  await saveMarketSettings(fixture.publicId, fixture.user, withSubject("Similar"));
  await createComparable(fixture.publicId, fixture.user, "TERRENO_VENTA", {
    ...base, location: "Fijo", factors: [{ type: "ZONA", value: 1 / 1.05, subjectRating: 1, comparableRating: 1.05, justification: "manual" }],
  });

  await saveMarketSettings(fixture.publicId, fixture.user, withSubject("Opción que ya no existe"));
  assert.equal((await zoneOf(fixture, "TERRENO_VENTA", "Fijo")).subjectRating, 1);
  await saveMarketSettings(fixture.publicId, fixture.user, withSubject(null));
  const zone = await zoneOf(fixture, "TERRENO_VENTA", "Fijo");
  assert.equal(zone.subjectRating, 1);
  assert.equal(zone.justification, "manual");
});

test("following the subject's rating only touches comparables of the same type in the same valuation", async () => {
  const fixture = await createValuationFixture();
  const other = await createValuationFixture();
  const factor = { type: "ZONA" as const, value: 1 / 1.05, subjectRating: 1, comparableRating: 1.05, justification: null };
  for (const target of [fixture, other]) {
    await saveFactorCatalog(target.user, SAMPLE_FACTOR_CATALOG);
    const land = await getMarketCalculation(target.publicId, target.organizationId, "TERRENO_VENTA");
    await saveMarketSettings(target.publicId, target.user, {
      ...land.settings,
      factorSlots: land.settings.factorSlots.map((slot) => (slot.type === "ZONA" ? { ...slot, subjectOption: "Similar" } : slot)),
    });
    await createComparable(target.publicId, target.user, "TERRENO_VENTA", { ...base, location: "Terreno", factors: [factor] });
  }
  const rent = await getMarketCalculation(fixture.publicId, fixture.organizationId, "INMUEBLE_RENTA");
  await saveMarketSettings(fixture.publicId, fixture.user, {
    ...rent.settings,
    factorSlots: [...rent.settings.factorSlots.filter((slot) => slot.type !== "ZONA"), { type: "ZONA", label: "Zona", subjectOption: "Similar" }],
  });
  await createComparable(fixture.publicId, fixture.user, "INMUEBLE_RENTA", { ...base, location: "Renta", factors: [factor] });

  const land = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  await saveMarketSettings(fixture.publicId, fixture.user, {
    ...land.settings,
    factorSlots: land.settings.factorSlots.map((slot) => (slot.type === "ZONA" ? { ...slot, subjectOption: "Superior" } : slot)),
  });

  assert.equal((await zoneOf(fixture, "TERRENO_VENTA", "Terreno")).subjectRating, 1.05);
  assert.equal((await zoneOf(fixture, "INMUEBLE_RENTA", "Renta")).subjectRating, 1, "the rent comparables keep their rating");
  assert.equal((await zoneOf(other, "TERRENO_VENTA", "Terreno")).subjectRating, 1, "another firm's valuation is untouched");
});

test("another organization cannot change a valuation's market settings or comparables", async () => {
  const fixture = await createValuationFixture();
  const intruder = await createValuationFixture();
  const current = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  await assert.rejects(saveMarketSettings(fixture.publicId, intruder.user, { ...current.settings, adoptedUnitValue: 1 }), (error: Error & { status?: number }) => error.status === 404);
  await assert.rejects(
    createComparable(fixture.publicId, intruder.user, "TERRENO_VENTA", { ...base, location: "Intruso", factors: [] }),
    (error: Error & { status?: number }) => error.status === 404,
  );
  await assert.rejects(getMarketCalculation(fixture.publicId, intruder.organizationId, "TERRENO_VENTA"), (error: Error & { status?: number }) => error.status === 404);
  const after = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.equal(after.comparables.length, 0);
  assert.equal(after.settings.adoptedUnitValue, current.settings.adoptedUnitValue);
});
