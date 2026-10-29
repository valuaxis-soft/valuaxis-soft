/**
 * Professional accreditation against the local database, with the SEP check
 * simulated (the real one is not available: docs/ACREDITACION.md). Uploads are
 * QR images made here with made-up data; nothing is sent to the SEP.
 */
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { after, test } from "node:test";
import QRCode from "qrcode";
import {
  AccreditationError,
  getAccreditation,
  resolveAccreditation,
  submitAccreditation,
  valuationRequiresUnaccreditedNotice,
} from "../../src/features/accreditation/accreditation.service";
import type { SepCheck } from "../../src/features/accreditation/accreditation-rules";
import type { SepVerifier } from "../../src/features/accreditation/sep-verifier";
import { createAuthUserFixture, createValuationFixture, prisma } from "./support";

after(async () => {
  await prisma.$disconnect();
});

/** A made-up CURP, different on every run so the same-CURP check only sees this test's accounts. */
const fakeCurp = () => `XEXX${String(randomInt(0, 1_000_000)).padStart(6, "0")}HNEXXXA4`;
const sepUrl = (curp: string, folio = "123456789") =>
  `https://cedulaprofesional.sep.gob.mx/cedula-profesional/validar-folio?curp=${curp}&id=${folio}`;
const qrOf = async (text: string) => new Uint8Array(await QRCode.toBuffer(text, { type: "png", scale: 6 }));

/** Stands in for the SEP: answers what the test says and records what it was asked. */
function simulatedSep(answer: SepCheck) {
  const asked: string[] = [];
  const verifier: SepVerifier = async (link) => {
    asked.push(link.url);
    return answer;
  };
  return { verifier, asked };
}
const sepConfirms = (name: string) => simulatedSep({ kind: "read", validCedula: true, cedulaNumber: "7654321", name });

/** An appraiser named "Juan Pérez López" who issues a valuation of his own. */
async function appraiserWithValuation() {
  const fixture = await createValuationFixture({ precision: "shown" });
  await prisma.usuario.update({
    where: { IdUsuario: fixture.user.id },
    data: { SNombre: "Juan", SApellidoPaterno: "Pérez", SApellidoMaterno: "López" },
  });
  return fixture;
}

async function rowOf(userId: number) {
  return prisma.acreditacionUsuario.findUniqueOrThrow({ where: { IdUsuario: userId } });
}

test("without the SEP check, an upload goes to review with the link; an administrator approves it for good", async () => {
  const { user, publicId, organizationId } = await appraiserWithValuation();
  const curp = fakeCurp();
  assert.equal((await getAccreditation(user.id)).status, "NO_ACREDITADO");
  assert.equal(await valuationRequiresUnaccreditedNotice(publicId, organizationId), true);

  const view = await submitAccreditation({ user, bytes: await qrOf(sepUrl(curp)) });
  assert.equal(view.status, "EN_REVISION");
  assert.equal(view.automatic, "NO_DISPONIBLE");
  assert.equal(view.folio, "123456789");

  const pending = await rowOf(user.id);
  assert.equal(pending.SUrlVerificacion, sepUrl(curp));
  assert.match(pending.SCurpHash ?? "", /^(hmac|sha256):[0-9a-f]{64}$/);
  const stored = JSON.stringify({ ...pending, SUrlVerificacion: null });
  assert.ok(!stored.includes(curp), "outside the review link, the CURP is not stored in clear");
  assert.equal(await valuationRequiresUnaccreditedNotice(publicId, organizationId), true, "in review still prints the notice");

  const dryRun = await resolveAccreditation({ email: user.email, decision: "approve", resolvedBy: "prueba", apply: false });
  assert.deepEqual([dryRun.before, dryRun.after, dryRun.applied], ["EN_REVISION", "ACREDITADO", false]);
  assert.equal((await rowOf(user.id)).SEstado, "EN_REVISION", "a dry run writes nothing");

  await resolveAccreditation({ email: user.email.toUpperCase(), decision: "approve", resolvedBy: "prueba", apply: true });
  const approved = await rowOf(user.id);
  assert.equal(approved.SEstado, "ACREDITADO");
  assert.equal(approved.SUrlVerificacion, null, "the link with the CURP is erased once resolved");
  assert.equal(approved.SResueltoPor, "prueba");
  assert.ok(approved.DFechaVerificacion);
  assert.equal(await valuationRequiresUnaccreditedNotice(publicId, organizationId), false);

  await assert.rejects(submitAccreditation({ user, bytes: await qrOf(sepUrl(fakeCurp())) }), (error) => error instanceof AccreditationError && error.status === 409);
});

test("when the SEP confirms a valid cédula with the user's name, the upload accredits at once", async () => {
  const { user, publicId, organizationId } = await appraiserWithValuation();
  const curp = fakeCurp();
  const sep = sepConfirms("LOPEZ PEREZ JUAN");
  const view = await submitAccreditation({ user, bytes: await qrOf(sepUrl(curp, "987654321")), verifier: sep.verifier });
  assert.equal(view.status, "ACREDITADO");
  assert.equal(view.cedulaNumber, "7654321");
  assert.equal(view.sepName, "LOPEZ PEREZ JUAN");
  assert.deepEqual(sep.asked, [sepUrl(curp, "987654321")]);
  const row = await rowOf(user.id);
  assert.equal(row.SUrlVerificacion, null);
  assert.equal(row.SResultadoAutomatico, "COINCIDE");
  assert.equal(await valuationRequiresUnaccreditedNotice(publicId, organizationId), false);
});

test("a name that does not match goes to review; rejected, it can be uploaded again", async () => {
  const { user } = await appraiserWithValuation();
  const curp = fakeCurp();
  const view = await submitAccreditation({ user, bytes: await qrOf(sepUrl(curp)), verifier: sepConfirms("ANA RUIZ DIAZ").verifier });
  assert.equal(view.status, "EN_REVISION");
  assert.equal(view.automatic, "NO_COINCIDE");

  await resolveAccreditation({ email: user.email, decision: "reject", resolvedBy: "prueba", reason: "el nombre no coincide", apply: true });
  const rejected = await rowOf(user.id);
  assert.equal(rejected.SEstado, "RECHAZADO");
  assert.equal(rejected.SMotivo, "el nombre no coincide");
  assert.equal(rejected.SUrlVerificacion, null);
  assert.equal((await getAccreditation(user.id)).reason, "el nombre no coincide");

  const again = await submitAccreditation({ user, bytes: await qrOf(sepUrl(curp)), verifier: sepConfirms("Juan Pérez López").verifier });
  assert.equal(again.status, "ACREDITADO");
});

test("a file without a SEP QR is refused and changes nothing", async () => {
  const fixture = await createAuthUserFixture({ label: "sin-qr" });
  const user = { id: fixture.userId, organizationId: fixture.organizationId };
  await assert.rejects(
    submitAccreditation({ user, bytes: await qrOf(sepUrl(fakeCurp()).replace("sep.gob.mx", "sep.gob.mx.evil.com")) }),
    (error) => error instanceof AccreditationError && /no lleva a cedulaprofesional/.test(error.message),
  );
  await assert.rejects(
    submitAccreditation({ user, bytes: new TextEncoder().encode("no es un archivo válido") }),
    (error) => error instanceof AccreditationError,
  );
  assert.equal(await prisma.acreditacionUsuario.findUnique({ where: { IdUsuario: fixture.userId } }), null);
});

test("the same CURP on a second account goes to review even when the SEP confirms it", async () => {
  const first = await appraiserWithValuation();
  const second = await appraiserWithValuation();
  const curp = fakeCurp();
  assert.equal((await submitAccreditation({ user: first.user, bytes: await qrOf(sepUrl(curp)), verifier: sepConfirms("JUAN PEREZ LOPEZ").verifier })).status, "ACREDITADO");
  const view = await submitAccreditation({ user: second.user, bytes: await qrOf(sepUrl(curp)), verifier: sepConfirms("JUAN PEREZ LOPEZ").verifier });
  assert.equal(view.status, "EN_REVISION");
  assert.match(view.reason ?? "", /otra cuenta/);
});

test("a revoked accreditation prints the notice again and never re-accredits on its own", async () => {
  const { user, publicId, organizationId } = await appraiserWithValuation();
  const curp = fakeCurp();
  await submitAccreditation({ user, bytes: await qrOf(sepUrl(curp)), verifier: sepConfirms("JUAN PEREZ LOPEZ").verifier });
  await assert.rejects(resolveAccreditation({ email: user.email, decision: "approve", resolvedBy: "prueba", apply: true }), AccreditationError);

  await resolveAccreditation({ email: user.email, decision: "revoke", resolvedBy: "prueba", reason: "cédula suspendida", apply: true });
  const revoked = await rowOf(user.id);
  assert.equal(revoked.SEstado, "RECHAZADO");
  assert.ok(revoked.DFechaRevocacion);
  assert.match(revoked.SMotivo ?? "", /Revocada: cédula suspendida/);
  assert.equal(await valuationRequiresUnaccreditedNotice(publicId, organizationId), true);

  const again = await submitAccreditation({ user, bytes: await qrOf(sepUrl(curp)), verifier: sepConfirms("JUAN PEREZ LOPEZ").verifier });
  assert.equal(again.status, "EN_REVISION");
});

test("the notice follows the valuation's responsible user, and its creator when there is none", async () => {
  const { user: creator, publicId, organizationId } = await appraiserWithValuation();
  const responsible = await appraiserWithValuation();
  await submitAccreditation({ user: responsible.user, bytes: await qrOf(sepUrl(fakeCurp())), verifier: sepConfirms("JUAN PEREZ LOPEZ").verifier });

  await prisma.avaluo.update({ where: { UIdentificadorPublico: publicId }, data: { IdUsuarioResponsable: responsible.user.id } });
  assert.equal(await valuationRequiresUnaccreditedNotice(publicId, organizationId), false, "accredited responsible, unaccredited creator");

  await submitAccreditation({ user: creator, bytes: await qrOf(sepUrl(fakeCurp())), verifier: sepConfirms("JUAN PEREZ LOPEZ").verifier });
  await prisma.acreditacionUsuario.update({ where: { IdUsuario: responsible.user.id }, data: { SEstado: "RECHAZADO" } });
  assert.equal(await valuationRequiresUnaccreditedNotice(publicId, organizationId), true, "unaccredited responsible, accredited creator");

  await prisma.avaluo.update({ where: { UIdentificadorPublico: publicId }, data: { IdUsuarioResponsable: null } });
  assert.equal(await valuationRequiresUnaccreditedNotice(publicId, organizationId), false, "without a responsible, the creator issues");
});
