/**
 * The operator's registry of users (/operador/usuarios): only OPERATOR_EMAILS
 * open it, anyone else gets 404; it lists people of every firm with their
 * memberships and counts, never what their valuations say; every export is
 * audited. Names, emails and phones are invented.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import ExcelJS from "exceljs";
import { GET as exportRoute } from "../../src/app/api/operador/usuarios/exportar/route";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { USER_DIRECTORY_AUDIT } from "../../src/features/operator/user-directory-audit";
import { parseUserDirectoryParams } from "../../src/features/operator/user-directory-params";
import { listUserDirectoryPage } from "../../src/features/operator/user-directory.repository";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { createValuationFixture, prisma, TestCookieJar, withCookies } from "./support";

after(() => prisma.$disconnect());

const previousOperators = process.env.OPERATOR_EMAILS;
after(() => {
  process.env.OPERATOR_EMAILS = previousOperators;
});

/** A verified member of `organizationId` with `roleKey`, and a session there. */
async function signIn(userId: number, organizationId: number, roleKey = "ADMINISTRADOR") {
  const role = await prisma.rol.findUniqueOrThrow({ where: { SClave: roleKey } });
  await prisma.usuario.update({ where: { IdUsuario: userId }, data: { BCorreoVerificado: true, DFechaVerificacionCorreo: new Date() } });
  await prisma.miembroOrganizacion.upsert({
    where: { IdOrganizacion_IdUsuario: { IdOrganizacion: organizationId, IdUsuario: userId } },
    create: { IdOrganizacion: organizationId, IdUsuario: userId, IdRol: role.IdRol },
    update: { IdRol: role.IdRol, BActivo: true },
  });
  const token = createSecureToken();
  await prisma.sesion.create({
    data: {
      IdUsuario: userId,
      IdOrganizacion: organizationId,
      STokenHash: hashToken(token),
      DFechaExpiracion: new Date(Date.now() + 60 * 60 * 1000),
      DFechaUltimaActividad: new Date(),
    },
  });
  const jar = new TestCookieJar();
  jar.set(AUTH_SESSION_COOKIE, token);
  return jar;
}

const exportRequest = (query = "") =>
  new Request(`http://localhost/api/operador/usuarios/exportar${query ? `?${query}` : ""}`, {
    headers: { "x-real-ip": "203.0.113.41", "user-agent": "Pruebas" },
  });

async function sheetText(response: Response) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const sheet = workbook.getWorksheet("Usuarios");
  assert.ok(sheet);
  const rows: string[][] = [];
  sheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1).map((value) => (value instanceof Date ? value.toISOString() : String(value ?? "")))));
  return rows;
}

test("the operator's registry: 404 for anyone else, people of every firm, no valuation content, exports audited", async () => {
  const tag = `Zqx${randomUUID().slice(0, 6)}`;
  const [firmA, firmB, own] = await Promise.all([createValuationFixture(), createValuationFixture(), createValuationFixture()]);

  // Two people in two firms, with a valuation each whose title and client must never leak.
  const valuations = await prisma.avaluo.findMany({ where: { UIdentificadorPublico: { in: [firmA.publicId, firmB.publicId] } } });
  const secretTitle = `Casa secreta ${tag}`;
  const secretClient = `Cliente secreto ${tag}`;
  await prisma.avaluo.updateMany({
    where: { IdAvaluo: { in: valuations.map((valuation) => valuation.IdAvaluo) } },
    data: { STitulo: secretTitle, SNombreCliente: secretClient },
  });
  await prisma.avaluo.update({ where: { UIdentificadorPublico: firmA.publicId }, data: { DFechaConclusion: new Date() } });
  await prisma.usuario.update({ where: { IdUsuario: firmA.user.id }, data: { SNombre: `Ana ${tag}`, SApellidoPaterno: "Inventada" } });
  await prisma.usuario.update({ where: { IdUsuario: firmB.user.id }, data: { SNombre: `Beto ${tag}`, STelefono: `33${tag.slice(3)}` } });
  await prisma.acreditacionUsuario.create({ data: { IdUsuario: firmA.user.id, SEstado: "ACREDITADO", SNivelAcademico: "MAESTRIA", BProgramaValuacion: true } });
  const jarA = await signIn(firmA.user.id, firmA.organizationId, "VALUADOR");
  await signIn(firmB.user.id, firmB.organizationId);

  const operatorJar = await signIn(own.user.id, own.organizationId);
  const operatorEmail = own.user.email;

  // Without the variable nobody is an operator; with it, only the listed email.
  delete process.env.OPERATOR_EMAILS;
  assert.equal((await withCookies(operatorJar, () => exportRoute(exportRequest()))).status, 404);
  process.env.OPERATOR_EMAILS = `otra-persona@example.test, ${operatorEmail.toUpperCase()}`;

  const denied = await withCookies(jarA, () => exportRoute(exportRequest()));
  assert.equal(denied.status, 404, "a person who is not an operator does not learn the route exists");
  assert.equal((await withCookies(new TestCookieJar(), () => exportRoute(exportRequest()))).status, 404, "without a session, 404 too");
  const deniedAudit = await prisma.auditoria.findFirst({ where: { IdUsuario: firmA.user.id, SAccion: "OPERATOR_ACCESS_DENIED" } });
  assert.ok(deniedAudit, "the attempt is audited");

  // People of several firms, their memberships, accreditation and counts.
  const page = await listUserDirectoryPage(parseUserDirectoryParams({ q: tag }), 25);
  assert.equal(page.total, 2);
  const ana = page.items.find((item) => item.email === firmA.user.email);
  const beto = page.items.find((item) => item.email === firmB.user.email);
  assert.ok(ana && beto);
  assert.equal(ana.name, `Ana ${tag} Inventada`);
  assert.deepEqual(ana.memberships, [{ organization: firmA.user.organizationName, kind: "PERSONAL", role: "Valuador" }]);
  assert.equal(ana.accreditation, "ACREDITADO");
  assert.equal(ana.accreditationLevel, "Maestría");
  assert.equal(ana.emailVerified, true);
  assert.deepEqual([ana.valuationsCreated, ana.valuationsConcluded], [1, 1]);
  assert.deepEqual([beto.valuationsCreated, beto.valuationsConcluded], [1, 0]);
  assert.equal(beto.accreditation, "NO_ACREDITADO");
  assert.equal(beto.memberships[0]?.organization, firmB.user.organizationName);

  // Search by phone and by email; filter by accreditation; sort by sign-up date.
  assert.deepEqual((await listUserDirectoryPage(parseUserDirectoryParams({ q: `33${tag.slice(3)}` }), 25)).items.map((item) => item.email), [firmB.user.email]);
  assert.deepEqual((await listUserDirectoryPage(parseUserDirectoryParams({ q: firmA.user.email.toUpperCase() }), 25)).items.map((item) => item.email), [firmA.user.email]);
  assert.deepEqual((await listUserDirectoryPage(parseUserDirectoryParams({ q: tag, acreditado: "si" }), 25)).items.map((item) => item.email), [firmA.user.email]);
  assert.deepEqual((await listUserDirectoryPage(parseUserDirectoryParams({ q: tag, acreditado: "no" }), 25)).items.map((item) => item.email), [firmB.user.email]);
  const asc = (await listUserDirectoryPage(parseUserDirectoryParams({ q: tag, dir: "asc" }), 25)).items.map((item) => item.email);
  const desc = (await listUserDirectoryPage(parseUserDirectoryParams({ q: tag, dir: "desc" }), 25)).items.map((item) => item.email);
  assert.deepEqual(asc, [...desc].reverse());
  const secondPage = await listUserDirectoryPage(parseUserDirectoryParams({ q: tag, page: "2" }), 1);
  assert.equal(secondPage.items.length, 1);
  assert.equal(secondPage.total, 2);

  // Nothing of a valuation in what the page renders.
  const payload = JSON.stringify(page);
  for (const secret of [secretTitle, secretClient, firmA.publicId, firmB.publicId, ...valuations.map((valuation) => valuation.SFolio)]) {
    assert.equal(payload.includes(secret), false, `the directory must not carry ${secret}`);
  }

  // The operator exports; the file has no valuation content and the export is audited.
  const exported = await withCookies(operatorJar, () => exportRoute(exportRequest(`q=${tag}`)));
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get("content-disposition") ?? "", /Usuarios-Valuaxis-/);
  const rows = await sheetText(exported);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.slice(1).map((row) => row[1]).sort(), [firmA.user.email, firmB.user.email].sort());
  const fileText = JSON.stringify(rows);
  for (const secret of [secretTitle, secretClient, ...valuations.map((valuation) => valuation.SFolio)]) {
    assert.equal(fileText.includes(secret), false, `the export must not carry ${secret}`);
  }
  const audit = await prisma.auditoria.findFirst({
    where: { IdUsuario: own.user.id, SAccion: USER_DIRECTORY_AUDIT.export },
    orderBy: { IdAuditoria: "desc" },
  });
  assert.ok(audit, "the export is audited");
  assert.equal(audit.SDireccionIP, "203.0.113.41");
  assert.equal((audit.JMetadatos as { q?: string; rows?: number }).q, tag);
  assert.equal((audit.JMetadatos as { rows?: number }).rows, 2);
});

test("the registry's last access is the latest of a password sign-in, a Google sign-in and the session's activity", async () => {
  const fixture = await createValuationFixture();
  const user = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: fixture.user.id }, select: { SCorreo: true } });
  const byEmail = async () => (await listUserDirectoryPage(parseUserDirectoryParams({ q: user.SCorreo }), 25)).items[0];

  // Signed in only with Google, before the account recorded it: the account has no date, the identity and the session do.
  await prisma.usuario.update({ where: { IdUsuario: fixture.user.id }, data: { DFechaUltimoAcceso: null } });
  const provider = await prisma.proveedorIdentidad.findFirstOrThrow({ select: { IdProveedorIdentidad: true } });
  const googleAt = new Date("2026-11-20T10:00:00Z");
  await prisma.identidadUsuario.create({
    data: {
      IdUsuario: fixture.user.id,
      IdProveedorIdentidad: provider.IdProveedorIdentidad,
      SIdentificadorProveedor: `google-${randomUUID()}`,
      SCorreoProveedor: user.SCorreo,
      BCorreoVerificadoProveedor: true,
      DFechaUltimoAcceso: googleAt,
    },
  });
  assert.equal((await byEmail()).lastAccessAt?.toISOString(), googleAt.toISOString());

  const activeAt = new Date("2026-11-22T18:30:00Z");
  await prisma.sesion.create({
    data: {
      IdUsuario: fixture.user.id,
      IdOrganizacion: fixture.organizationId,
      STokenHash: hashToken(createSecureToken()),
      DFechaExpiracion: new Date(Date.now() + 60 * 60 * 1000),
      DFechaUltimaActividad: activeAt,
    },
  });
  assert.equal((await byEmail()).lastAccessAt?.toISOString(), activeAt.toISOString(), "a long session counts as being here");
});
