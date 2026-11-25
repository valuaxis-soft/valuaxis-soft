/**
 * The matrix's evidence in the database: a failure report with its responses
 * (1.9 and 3.4), the specialty of who signs from a verified accreditation
 * (1.7) and the version in the activity log of a valuation (3.3).
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { firmSettingsSchema } from "../../src/features/firm/firm-schemas";
import { getValuationDefaults, saveFirmSettings } from "../../src/features/firm/firm.service";
import { createFailureReport, listFailureReports, respondToFailureReport } from "../../src/features/support/failure-report.service";
import { auditValuation } from "../../src/features/valuations/services/valuation-audit";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

const origin = { ip: "127.0.0.1", userAgent: "pruebas" };
const request = () => new Request("http://localhost/api/prueba", { headers: { "x-forwarded-for": "127.0.0.1", "user-agent": "pruebas" } });

test("a failure report is recorded with its valuation; its responses give its status and only its author reads it", async () => {
  const fixture = await createValuationFixture();
  const other = await createValuationFixture();
  const { id } = await createFailureReport(fixture.user, {
    valuationId: fixture.publicId,
    happenedOn: "2026-11-24",
    description: "Al concluir no se descargó el PDF del avalúo de prueba.",
  }, null, origin);

  const [mine] = await listFailureReports({ userId: fixture.user.id });
  assert.equal(mine.id, id);
  assert.equal(mine.status, "RECIBIDO");
  assert.equal(mine.happenedOn, "2026-11-24");
  assert.match(mine.valuation ?? "", /^TEST-/);
  assert.equal(mine.valuationId, fixture.publicId);
  assert.equal((await listFailureReports({ userId: other.user.id })).length, 0, "another user does not read it");

  // A valuation of another organization is not found.
  await assert.rejects(
    createFailureReport(other.user, { valuationId: fixture.publicId, happenedOn: "2026-11-24", description: "Un avalúo que no es suyo." }, null, origin),
    (error: Error & { status?: number }) => error.status === 404,
  );

  await respondToFailureReport(other.user, id, { status: "EN_REVISION", response: "Lo estamos revisando." }, origin);
  await respondToFailureReport(other.user, id, { status: "CORREGIDO", response: "Se corrigió la descarga." }, origin);
  const [answered] = await listFailureReports({ userId: fixture.user.id });
  assert.equal(answered.status, "CORREGIDO");
  assert.deepEqual(answered.responses.map((response) => response.status), ["EN_REVISION", "CORREGIDO"]);
  assert.ok((await listFailureReports()).some((report) => report.id === id), "the operator reads every report");
});

test("a new valuation's signer takes the specialty of the verified accreditation of the same cédula", async () => {
  const fixture = await createValuationFixture();
  const role = await prisma.rol.findFirstOrThrow({ where: { SClave: "ADMINISTRADOR" } });
  await prisma.miembroOrganizacion.create({ data: { IdOrganizacion: fixture.organizationId, IdUsuario: fixture.user.id, IdRol: role.IdRol } });
  await saveFirmSettings(fixture.user, firmSettingsSchema.parse({ validityMonths: 6, folioPrefix: "ESP", signers: [{ name: "Ing. Persona Inventada", cedula: "7654321", role: "" }] }));
  const defaults = () => prisma.$transaction((tx) => getValuationDefaults(tx, fixture.organizationId));

  assert.equal((await defaults()).signers[0].specialty, undefined, "without an accreditation, none");
  await prisma.acreditacionUsuario.create({
    data: { IdUsuario: fixture.user.id, SEstado: "EN_REVISION", SNumeroCedula: "7654321", SProgramaAcademico: "Maestría en Valuación Inmobiliaria" },
  });
  assert.equal((await defaults()).signers[0].specialty, undefined, "only a verified one");
  await prisma.acreditacionUsuario.update({ where: { IdUsuario: fixture.user.id }, data: { SEstado: "ACREDITADO", SNivelAcademico: "MAESTRIA", BProgramaValuacion: true } });
  assert.equal((await defaults()).signers[0].specialty, "Maestría en Valuación Inmobiliaria");
});

test("an action on a valuation records the user, the IP and the version it was in", async () => {
  const fixture = await createValuationFixture();
  await auditValuation({ action: "UPDATE_DATA", user: fixture.user, valuationPublicId: fixture.publicId, request: request(), metadata: { campo0: "Título" } });
  const row = await prisma.auditoria.findFirstOrThrow({
    where: { SEntidad: "Avaluo", SIdentificadorEntidad: fixture.publicId, SAccion: "VALUATION_UPDATE_DATA" },
    orderBy: { DFechaEvento: "desc" },
  });
  assert.equal(row.IdUsuario, fixture.user.id);
  assert.ok(row.SDireccionIP);
  assert.deepEqual(row.JMetadatos, { campo0: "Título", versionAvaluo: 1 });
});
