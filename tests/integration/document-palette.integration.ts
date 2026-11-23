/**
 * Despacho → Colores del dictamen against the local database: the firm's
 * palette is kept without a migration, only the administrator changes it,
 * a new valuation and a new template start with it, and the valuations the
 * firm already had (and other firms) keep their colours.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { GET, PUT } from "../../src/app/api/organizacion/despacho/paleta/route";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import {
  DOCUMENT_PALETTE_FIELD_KEY,
  applyFirmDocumentPalette,
  getFirmDocumentPalette,
  saveFirmDocumentPalette,
} from "../../src/features/firm/document-palette.service";
import { saveValuation } from "../../src/features/valuations/actions/save-valuation.action";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import { initialSectionsFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { DEFAULT_DOCUMENT_PALETTE } from "../../src/features/valuations/services/document-palette";
import { documentPagePresentation } from "../../src/features/valuations/services/page-presentation";
import { createBlankValuationTemplate, getValuationTemplate } from "../../src/features/valuations/services/valuation-template.service";
import { saveValuationSections, type SectionPayload } from "../../src/features/valuations/services/valuation-workflow.service";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { createValuationFixture, prisma, TestCookieJar, withCookies } from "./support";

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

after(() => prisma.$disconnect());

const VINO = { strong: "#6B1F2E", pastel: "#F2D7DB" };
const BOSQUE = { strong: "#1E5631", pastel: "#D5E8D4" };

/** A member of the fixture's organization with `roleKey`, signed in. */
async function signIn(fixture: Fixture, roleKey: string) {
  const role = await prisma.rol.findUniqueOrThrow({ where: { SClave: roleKey } });
  await prisma.miembroOrganizacion.create({
    data: { IdOrganizacion: fixture.organizationId, IdUsuario: fixture.user.id, IdRol: role.IdRol, DFechaModificacion: new Date() },
  });
  const token = createSecureToken();
  await prisma.sesion.create({
    data: {
      IdUsuario: fixture.user.id,
      IdOrganizacion: fixture.organizationId,
      STokenHash: hashToken(token),
      DFechaExpiracion: new Date(Date.now() + 60 * 60 * 1000),
      DFechaUltimaActividad: new Date(),
    },
  });
  const jar = new TestCookieJar();
  jar.set(AUTH_SESSION_COOKIE, token);
  return jar;
}

const put = (jar: TestCookieJar, body: unknown) =>
  withCookies(jar, () => PUT(new Request("http://localhost/api/organizacion/despacho/paleta", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.20", "user-agent": "Pruebas" },
    body: JSON.stringify(body),
  })));

const documentPalette = async (publicId: string, organizationId: number) => {
  const valuation = await getValuationByPublicId(publicId, organizationId);
  assert.ok(valuation);
  return documentPagePresentation(initialSectionsFor(valuation)).palette;
};

test("the firm's palette is kept in a custom field, read back, and reset to the document's own blue", async () => {
  const owner = await createValuationFixture();
  const stranger = await createValuationFixture();
  assert.deepEqual(await getFirmDocumentPalette(owner.organizationId), { palette: DEFAULT_DOCUMENT_PALETTE, customized: false });

  assert.deepEqual(await saveFirmDocumentPalette(owner.user, VINO), { palette: VINO, customized: true });
  // Without a migration: one custom field of the firm keeps it.
  const field = await prisma.campoPersonalizado.findFirstOrThrow({ where: { IdOrganizacion: owner.organizationId, SClave: DOCUMENT_PALETTE_FIELD_KEY } });
  assert.deepEqual(field.JConfiguracion, VINO);
  // Saving again changes the same field.
  assert.deepEqual((await saveFirmDocumentPalette(owner.user, BOSQUE)).palette, BOSQUE);
  assert.equal(await prisma.campoPersonalizado.count({ where: { IdOrganizacion: owner.organizationId, SClave: DOCUMENT_PALETTE_FIELD_KEY } }), 1);
  // Another firm keeps the document's own.
  assert.deepEqual(await getFirmDocumentPalette(stranger.organizationId), { palette: DEFAULT_DOCUMENT_PALETTE, customized: false });

  // Null, or the default blue itself, goes back to it.
  assert.deepEqual(await saveFirmDocumentPalette(owner.user, null), { palette: DEFAULT_DOCUMENT_PALETTE, customized: false });
  assert.deepEqual(await saveFirmDocumentPalette(owner.user, VINO), { palette: VINO, customized: true });
  assert.deepEqual(await saveFirmDocumentPalette(owner.user, DEFAULT_DOCUMENT_PALETTE), { palette: DEFAULT_DOCUMENT_PALETTE, customized: false });
  const audit = await prisma.auditoria.findMany({ where: { IdOrganizacion: owner.organizationId, SAccion: { in: ["DOCUMENT_PALETTE_SAVE", "DOCUMENT_PALETTE_RESET"] } } });
  assert.equal(audit.length, 5);
});

test("through the route, everyone who sees valuations reads the palette and only the administrator changes it", async () => {
  // Without a session.
  const anonymous = new TestCookieJar();
  assert.equal((await withCookies(anonymous, () => GET())).status, 401);
  assert.equal((await put(anonymous, { palette: VINO })).status, 401);

  for (const roleKey of ["VALUADOR", "REVISOR", "CONSULTA"]) {
    const fixture = await createValuationFixture();
    const jar = await signIn(fixture, roleKey);
    const read = await withCookies(jar, () => GET());
    assert.equal(read.status, 200, roleKey);
    assert.deepEqual((await read.json()).data, { palette: DEFAULT_DOCUMENT_PALETTE, customized: false });
    assert.equal((await put(jar, { palette: VINO })).status, 403, roleKey);
    assert.equal((await getFirmDocumentPalette(fixture.organizationId)).customized, false, roleKey);
  }

  const firm = await createValuationFixture();
  const admin = await signIn(firm, "ADMINISTRADOR");
  const saved = await put(admin, { palette: { strong: "#6b1f2e", pastel: "#f2d7db" } });
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).data, { palette: VINO, customized: true });
  // Only two hex colours: anything else is refused and nothing changes.
  for (const bad of [{ palette: { strong: "vino", pastel: "#F2D7DB" } }, { palette: { strong: "#6B1F2E", pastel: "#FFF" } }, { palette: { strong: "#6B1F2E;x", pastel: "#F2D7DB" } }, { palette: "vino" }, {}]) {
    assert.equal((await put(admin, bad)).status, 400, JSON.stringify(bad));
  }
  assert.deepEqual(await getFirmDocumentPalette(firm.organizationId), { palette: VINO, customized: true });
  const reset = await put(admin, { palette: null });
  assert.equal(reset.status, 200);
  assert.deepEqual((await reset.json()).data, { palette: DEFAULT_DOCUMENT_PALETTE, customized: false });
});

test("a new valuation starts with the firm's palette; the valuations it already had keep theirs", async () => {
  const firm = await createValuationFixture();
  const jar = await signIn(firm, "ADMINISTRADOR");
  const { IdTipoAvaluo, IdTipoInmueble, IdTipoOperacion } = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: firm.publicId } });
  const create = (title: string) =>
    withCookies(jar, () => saveValuation({ title, appraisalTypeId: IdTipoAvaluo, propertyTypeId: IdTipoInmueble, operationTypeId: IdTipoOperacion }), { request: true });
  const created = async (title: string) => {
    const result = await create(title);
    assert.ok(result.ok && result.data, JSON.stringify(result));
    return result.data.id;
  };

  // Before the firm chooses: the document's own colours, with nothing stored.
  const before = await created("Casa inventada antes de la paleta");
  assert.equal(await documentPalette(before, firm.organizationId), undefined);

  await saveFirmDocumentPalette(firm.user, VINO);
  const born = await created("Casa inventada con la paleta del despacho");
  assert.deepEqual(await documentPalette(born, firm.organizationId), VINO);
  // The ones that existed do not change.
  assert.equal(await documentPalette(before, firm.organizationId), undefined);
  assert.equal(await documentPalette(firm.publicId, firm.organizationId), undefined);

  // The valuation chooses its own, saved with its document; the firm changing its palette later does not touch it.
  const valuation = await getValuationByPublicId(born, firm.organizationId);
  assert.ok(valuation);
  const sections = initialSectionsFor(valuation).map((section) => (section.id === "caratula" ? { ...section, palette: BOSQUE } : section));
  const editor = { ...firm.user, permissions: [...firm.user.permissions, "AVALUO_EDITAR"] };
  await saveValuationSections({ publicId: born, organizationId: firm.organizationId, user: editor, sections: JSON.parse(JSON.stringify(buildSectionsPayload(sections))) as SectionPayload[] });
  assert.deepEqual(await documentPalette(born, firm.organizationId), BOSQUE);
  await saveFirmDocumentPalette(firm.user, { strong: "#4B2A6B", pastel: "#E3D7F0" });
  assert.deepEqual(await documentPalette(born, firm.organizationId), BOSQUE);
  // A version that already carries a palette is not repainted by the firm's.
  const { IdVersionTrabajo } = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: born } });
  assert.ok(IdVersionTrabajo);
  await prisma.$transaction((tx) => applyFirmDocumentPalette(tx, IdVersionTrabajo, firm.organizationId));
  assert.deepEqual(await documentPalette(born, firm.organizationId), BOSQUE);

  // Back to the document's own: the next valuation starts with nothing stored.
  await saveFirmDocumentPalette(firm.user, null);
  assert.equal(await documentPalette(await created("Casa inventada sin paleta"), firm.organizationId), undefined);
});

test("a new template starts with the firm's palette", async () => {
  const firm = await createValuationFixture();
  const { IdTipoAvaluo } = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: firm.publicId } });
  const plain = await createBlankValuationTemplate({ user: firm.user, name: "Plantilla inventada sin paleta", appraisalTypeId: IdTipoAvaluo, propertyTypeId: null });
  assert.equal(documentPagePresentation((await getValuationTemplate(firm.organizationId, plain.id))?.content.sections ?? []).palette, undefined);

  await saveFirmDocumentPalette(firm.user, VINO);
  const coloured = await createBlankValuationTemplate({ user: firm.user, name: "Plantilla inventada con paleta", appraisalTypeId: IdTipoAvaluo, propertyTypeId: null });
  assert.deepEqual(documentPagePresentation((await getValuationTemplate(firm.organizationId, coloured.id))?.content.sections ?? []).palette, VINO);
  // The template made before keeps its colours.
  assert.equal(documentPagePresentation((await getValuationTemplate(firm.organizationId, plain.id))?.content.sections ?? []).palette, undefined);
});
