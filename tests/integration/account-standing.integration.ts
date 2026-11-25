/**
 * Closing and suspending accounts and the retention of concluded valuations
 * (docs/CUENTAS.md) against the local database, with the emails captured in
 * memory: the voluntary closure, a suspension with its notice, inactivity,
 * and the matrix's acceptance test (a fictitious expired valuation gets the
 * warning email first and then is suppressed). Every flow checks that the
 * balance never changes; with the flags off nothing is sent or deleted.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test, type TestContext } from "node:test";
import { Prisma } from "@prisma/client";
import { accountSuspendedResponse } from "../../src/features/account/standing/account-standing-http";
import { addDays, addMonths } from "../../src/features/account/standing/account-standing-rules";
import {
  AccountStandingError,
  applySuspension,
  endRestriction,
  getAccountStanding,
  getAccountStandingView,
  listAccountRestrictions,
  noticeSuspension,
  recordClosureByEmail,
  recordSuspensionResponse,
  requestAccountClosure,
} from "../../src/features/account/standing/account-standing.service";
import { runInactivity } from "../../src/features/account/standing/inactivity.service";
import { authenticateWithPassword } from "../../src/features/auth/services/authentication.service";
import { adjustCredits, getCreditBalance } from "../../src/features/billing/credits.service";
import { runRetention } from "../../src/features/valuations/retention/retention.service";
import { SUPPRESSED_VALUATION_TITLE } from "../../src/features/valuations/retention/valuation-suppression";
import { getEmailService, type AccountNoticeEmailInput } from "../../src/infrastructure/email/email.service";
import { createAuthUserFixture, createValuationFixture, prisma, testIp } from "./support";

after(async () => {
  await prisma.$disconnect();
});

function captureNotices(t: TestContext) {
  const sent: AccountNoticeEmailInput[] = [];
  t.mock.method(getEmailService(), "sendAccountNotice", async (input: AccountNoticeEmailInput) => {
    sent.push(input);
  });
  return sent;
}

function withFlag(t: TestContext, name: "ACCOUNT_INACTIVITY_ENABLED" | "VALUATION_RETENTION_ENABLED", value: string | undefined) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

async function operator() {
  const fixture = await createAuthUserFixture({ label: "operador" });
  return { id: fixture.userId, organizationId: fixture.organizationId };
}

const noticesOf = (userId: number) => prisma.avisoCorreo.findMany({ where: { IdUsuario: userId }, orderBy: { IdAvisoCorreo: "asc" } });

describe("voluntary closure", () => {
  test("records the request, blocks the access, schedules the data's blocking and keeps the balance", async (t) => {
    const sent = captureNotices(t);
    const fixture = await createAuthUserFixture({ label: "baja" });
    await adjustCredits({ organizationId: fixture.organizationId, credits: 7, reason: "Saldo de prueba" });
    const session = await prisma.sesion.create({
      data: { IdUsuario: fixture.userId, IdOrganizacion: fixture.organizationId, STokenHash: randomUUID(), DFechaExpiracion: addDays(new Date(), 1) },
    });

    const now = new Date();
    const result = await requestAccountClosure(
      { id: fixture.userId, name: "baja Prueba", email: fixture.email, organizationId: fixture.organizationId },
      { ip: "10.0.0.1" },
      now,
    );
    assert.equal(result.requestedAt, now.toISOString());

    const [row] = await prisma.suspensionCuenta.findMany({ where: { IdUsuario: fixture.userId } });
    assert.equal(row.STipo, "BAJA");
    assert.equal(row.SOrigen, "USUARIO");
    assert.equal(row.BBloqueaAcceso, true);
    assert.equal(row.DFechaInicio?.toISOString(), now.toISOString());
    assert.equal(row.DFechaSupresionProgramada?.getUTCFullYear(), now.getUTCFullYear() + 10);
    assert.equal((await prisma.sesion.findUniqueOrThrow({ where: { IdSesion: session.IdSesion } })).BRevocada, true);

    const standing = await getAccountStanding(fixture.userId);
    assert.deepEqual(standing, { access: false, canProduce: false, restriction: "BAJA" });
    const login = await authenticateWithPassword({ email: fixture.email, password: fixture.password as string, ip: testIp() });
    assert.deepEqual(login, { ok: false, reason: "ACCOUNT_CLOSED" });

    // The email with the effects, logged with its text and version.
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /saldo a favor, sin vencimiento/);
    assert.match(sent[0].text, /sección 17\.10/);
    assert.match(sent[0].text, /sección 7\.3 del Aviso de privacidad integral/);
    const [log] = await noticesOf(fixture.userId);
    assert.equal(log.STipo, "BAJA");
    assert.equal(log.SDestinatario, fixture.email);
    assert.equal(log.BEnviado, true);
    assert.equal(log.STexto, sent[0].text);
    assert.equal(log.SIdentificadorEntidad, row.UIdentificadorPublico);

    // Asking again returns the same request.
    await requestAccountClosure({ id: fixture.userId, name: "baja Prueba", email: fixture.email, organizationId: fixture.organizationId });
    assert.equal(await prisma.suspensionCuenta.count({ where: { IdUsuario: fixture.userId } }), 1);

    // The operator sees it and reactivates it: access back, balance intact.
    const op = await operator();
    const listed = (await listAccountRestrictions()).find((entry) => entry.id === row.UIdentificadorPublico);
    assert.equal(listed?.kind, "BAJA");
    await endRestriction(op, row.UIdentificadorPublico, "REACTIVACION");
    assert.deepEqual(await getAccountStanding(fixture.userId), { access: true, canProduce: true, restriction: null });
    assert.equal(sent.at(-1)?.subject, "Tu cuenta está activa de nuevo · Valuaxis Soft");
    assert.equal(await getCreditBalance(fixture.organizationId), 7);
  });

  test("a closure asked for by email is recorded by the operator the same way", async (t) => {
    captureNotices(t);
    const fixture = await createAuthUserFixture({ label: "baja-correo" });
    const op = await operator();
    const { created } = await recordClosureByEmail(op, fixture.email.toUpperCase());
    assert.equal(created, true);
    const row = await prisma.suspensionCuenta.findFirstOrThrow({ where: { IdUsuario: fixture.userId } });
    assert.equal(row.SOrigen, "CORREO");
    assert.equal(row.IdUsuarioOperador, op.id);
    assert.equal((await getAccountStanding(fixture.userId)).access, false);
    await assert.rejects(recordClosureByEmail(op, "nadie-registrado@example.test"), AccountStandingError);
  });
});

describe("suspension decided by the operator", () => {
  test("notice with the cause and five business days, then the suspension: consult yes, produce no, balance intact", async (t) => {
    const sent = captureNotices(t);
    const fixture = await createAuthUserFixture({ label: "suspension" });
    await adjustCredits({ organizationId: fixture.organizationId, credits: 3, reason: "Saldo de prueba" });
    const op = await operator();
    // Monday 9 Nov 2026, 10:00 in Mexico City. Monday 16 is a day of rest (third Monday of November):
    // the five business days are 10, 11, 12, 13 and 17 Nov.
    const noticedAt = new Date("2026-11-09T16:00:00Z");

    const notice = await noticeSuspension(op, { email: fixture.email, cause: "PRESTAMO", detail: "La cuenta se usó desde dos despachos.", urgent: false, blockAccess: false }, noticedAt);
    assert.equal(notice.deadline, "2026-11-18T05:59:59.999Z");
    assert.equal(notice.startedAt, null);
    const pendingView = await getAccountStandingView(fixture.userId, noticedAt);
    assert.equal(pendingView.standing.canProduce, true);
    assert.equal(pendingView.pendingNotice?.cause, "PRESTAMO");
    assert.match(sent[0].text, /Préstamo de la cuenta a otra persona\. La cuenta se usó desde dos despachos\./);
    assert.match(sent[0].text, /cinco días hábiles/);

    await assert.rejects(applySuspension(op, notice.id, addDays(noticedAt, 2)), /Todavía corre el plazo/);
    await assert.rejects(
      noticeSuspension(op, { email: fixture.email, cause: "PRESTAMO", urgent: false, blockAccess: true }),
      /Solo la verificación de identidad/,
    );
    await recordSuspensionResponse(op, notice.id, "Fue un error de mi asistente.", addDays(noticedAt, 1));

    const startedAt = addDays(noticedAt, 9);
    await applySuspension(op, notice.id, startedAt);
    const standing = await getAccountStanding(fixture.userId, addDays(startedAt, 1));
    assert.deepEqual(standing, { access: true, canProduce: false, restriction: "OTRA" });
    const blocked = await accountSuspendedResponse(fixture.userId);
    assert.equal(blocked?.status, 403);
    assert.equal((await blocked?.json()).code, "ACCOUNT_SUSPENDED");

    const row = await prisma.suspensionCuenta.findFirstOrThrow({ where: { IdUsuario: fixture.userId } });
    assert.equal(row.SCausa, "PRESTAMO");
    assert.equal(row.DFechaAviso?.toISOString(), noticedAt.toISOString());
    assert.equal(row.SRespuesta, "Fue un error de mi asistente.");
    assert.equal(row.DFechaInicio?.toISOString(), startedAt.toISOString());

    await endRestriction(op, notice.id, "ACLARADA");
    assert.equal(await accountSuspendedResponse(fixture.userId), null);
    assert.deepEqual((await noticesOf(fixture.userId)).map((log) => log.STipo), ["SUSPENSION_AVISO", "SUSPENSION", "REACTIVACION"]);
    assert.equal(await getCreditBalance(fixture.organizationId), 3);
  });

  test("an urgent identity check suspends at once and closes the door until it is lifted", async (t) => {
    const sent = captureNotices(t);
    const fixture = await createAuthUserFixture({ label: "suplantacion" });
    const op = await operator();
    const notice = await noticeSuspension(op, { email: fixture.email, cause: "SUPLANTACION", urgent: true, blockAccess: true });
    assert.ok(notice.startedAt);
    assert.equal((await getAccountStanding(fixture.userId)).access, false);
    assert.match(sent[0].text, /Por tratarse de un caso urgente/);
    assert.match(sent[0].text, /restablecemos de inmediato la consulta y la descarga/);
    await endRestriction(op, notice.id, "ACLARADA");
    assert.equal((await getAccountStanding(fixture.userId)).access, true);
  });
});

describe("inactivity", () => {
  test("off by default: --apply only counts", async (t) => {
    const sent = captureNotices(t);
    withFlag(t, "ACCOUNT_INACTIVITY_ENABLED", undefined);
    const fixture = await createAuthUserFixture({ label: "inactiva-apagada" });
    await prisma.usuario.update({ where: { IdUsuario: fixture.userId }, data: { DFechaCreacion: addMonths(new Date(), -4) } });
    const result = await runInactivity({ apply: true, userIds: [fixture.userId] });
    assert.deepEqual(result, { reviewed: 1, notices: 1, disabled: 0, withdrawn: 0, failedEmails: 0, applied: false });
    assert.equal(sent.length, 0);
    assert.equal(await prisma.suspensionCuenta.count({ where: { IdUsuario: fixture.userId } }), 0);
  });

  test("email after three months, disabled afterwards, reactivated by the operator with the balance intact", async (t) => {
    const sent = captureNotices(t);
    withFlag(t, "ACCOUNT_INACTIVITY_ENABLED", "true");
    const fixture = await createAuthUserFixture({ label: "inactiva" });
    await adjustCredits({ organizationId: fixture.organizationId, credits: 4, reason: "Saldo de prueba" });
    const now = new Date();
    await prisma.usuario.update({ where: { IdUsuario: fixture.userId }, data: { DFechaCreacion: addMonths(now, -3) } });

    // A dry run counts and writes nothing.
    assert.equal((await runInactivity({ apply: false, userIds: [fixture.userId], now })).notices, 1);
    assert.equal(sent.length, 0);

    const first = await runInactivity({ apply: true, userIds: [fixture.userId], now });
    assert.equal(first.notices, 1);
    assert.match(sent[0].text, /durante tres meses/);
    assert.equal((await getAccountStanding(fixture.userId, now)).canProduce, true);
    // The next day nothing repeats.
    assert.deepEqual(await runInactivity({ apply: true, userIds: [fixture.userId], now: addDays(now, 1) }), {
      reviewed: 1, notices: 0, disabled: 0, withdrawn: 0, failedEmails: 0, applied: true,
    });

    const later = addDays(now, 15);
    assert.equal((await runInactivity({ apply: true, userIds: [fixture.userId], now: later })).disabled, 1);
    const row = await prisma.suspensionCuenta.findFirstOrThrow({ where: { IdUsuario: fixture.userId } });
    assert.equal(row.STipo, "INACTIVIDAD");
    assert.equal(row.DFechaAviso?.toISOString(), now.toISOString());
    assert.equal(row.DFechaInicio?.toISOString(), later.toISOString());
    assert.deepEqual(await getAccountStanding(fixture.userId, later), { access: true, canProduce: false, restriction: "INACTIVIDAD" });
    assert.match(sent[1].text, /doce horas naturales, con tu saldo intacto/);

    await endRestriction(await operator(), row.UIdentificadorPublico, "REACTIVACION", addDays(later, 1));
    assert.equal((await getAccountStanding(fixture.userId)).canProduce, true);
    const ended = await prisma.suspensionCuenta.findUniqueOrThrow({ where: { IdSuspensionCuenta: row.IdSuspensionCuenta } });
    assert.equal(ended.SMotivoFin, "REACTIVACION");
    // The reactivation restarts the count: no new notice the day after.
    assert.equal((await runInactivity({ apply: true, userIds: [fixture.userId], now: addDays(later, 2) })).notices, 0);
    assert.deepEqual((await noticesOf(fixture.userId)).map((log) => log.STipo), ["INACTIVIDAD", "INHABILITACION", "REACTIVACION"]);
    assert.equal(await getCreditBalance(fixture.organizationId), 4);
  });

  test("a valuation created after the notice withdraws it", async (t) => {
    captureNotices(t);
    withFlag(t, "ACCOUNT_INACTIVITY_ENABLED", "true");
    const valuation = await createValuationFixture({ precision: "shown" });
    const userId = valuation.user.id;
    await prisma.usuario.update({ where: { IdUsuario: userId }, data: { DFechaCreacion: addMonths(new Date(), -6), BCorreoVerificado: true, DFechaVerificacionCorreo: new Date() } });
    await prisma.avaluo.update({ where: { UIdentificadorPublico: valuation.publicId }, data: { DFechaCreacion: addMonths(new Date(), -5) } });
    const now = new Date();
    assert.equal((await runInactivity({ apply: true, userIds: [userId], now })).notices, 1);
    await prisma.avaluo.update({ where: { UIdentificadorPublico: valuation.publicId }, data: { DFechaCreacion: addDays(now, 2) } });
    assert.equal((await runInactivity({ apply: true, userIds: [userId], now: addDays(now, 3) })).withdrawn, 1);
    const row = await prisma.suspensionCuenta.findFirstOrThrow({ where: { IdUsuario: userId } });
    assert.equal(row.SMotivoFin, "ACTIVIDAD");
    assert.equal(row.DFechaInicio, null);
  });
});

/** A concluded valuation with what a real one carries: content with an image, a comparable with the advertiser's contact, a cover file, a subject property and its credit consumption. */
async function concludedValuationFixture(concludedAt: Date) {
  const valuation = await createValuationFixture();
  const { user, organizationId } = valuation;
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: valuation.publicId }, include: { organizacion: true } });
  const versionId = avaluo.IdVersionTrabajo ?? (await prisma.versionAvaluo.create({
    data: { IdAvaluo: avaluo.IdAvaluo, IdUsuarioCreador: user.id, IdEstadoVersionAvaluo: (await prisma.estadoVersionAvaluo.findFirstOrThrow()).IdEstadoVersionAvaluo, INumeroVersion: 1 },
  })).IdVersionAvaluo;
  const [fileType, relationType, comparableType, source, operation, publicationState] = await Promise.all([
    prisma.tipoArchivo.findUniqueOrThrow({ where: { SClave: "OTRO" } }),
    prisma.tipoRelacionArchivo.findUniqueOrThrow({ where: { SClave: "AVALUO" } }),
    prisma.tipoComparable.findUniqueOrThrow({ where: { SClave: "TERRENO_VENTA" } }),
    // No migration seeds the listing sources; the app creates them as it captures (market.service), and so does the test.
    prisma.fuenteInmobiliaria.upsert({ where: { SNombre: "Anuncio de prueba" }, create: { SNombre: "Anuncio de prueba" }, update: {} }),
    prisma.tipoOperacion.findFirstOrThrow({ where: { BActivo: true } }),
    prisma.estadoPublicacion.findUniqueOrThrow({ where: { SClave: "ACTIVA" } }),
  ]);
  const file = (key: string) =>
    prisma.archivo.create({
      data: {
        IdOrganizacion: organizationId, IdUsuarioCarga: user.id, IdTipoArchivo: fileType.IdTipoArchivo, SBucket: "local",
        SClaveObjeto: key, SNombreOriginal: "foto.jpg", STipoMime: "image/jpeg", ITamanoBytes: BigInt(10), SChecksum: randomUUID(),
      },
    });

  // An editor image referenced from the content, as the editor saves it.
  const editorKey = `uploads/2026-01/${randomUUID()}.jpg`;
  const editorFile = await file(editorKey);
  await prisma.cargaArchivo.create({
    data: { IdUsuario: user.id, IdOrganizacion: organizationId, IdArchivo: editorFile.IdArchivo, SIdentificadorCarga: editorKey, BCompletada: true, DFechaFinalizacion: new Date() },
  });
  const section = await prisma.seccionDocumento.create({ data: { IdVersionAvaluo: versionId, SClave: "DATOS", SNombre: "Datos generales" } });
  const nodeType = await prisma.tipoNodoDocumento.findFirstOrThrow({ where: { BActivo: true } });
  await prisma.nodoDocumento.create({
    data: {
      IdSeccionDocumento: section.IdSeccionDocumento,
      IdTipoNodoDocumento: nodeType.IdTipoNodoDocumento,
      SClave: "foto",
      STitulo: "Fotografía",
      JConfiguracion: { kind: "image", src: `/api/archivos/imagen?key=${encodeURIComponent(editorKey)}` } satisfies Prisma.JsonObject,
    },
  });
  // The cover image, under the valuation's folder and related to it.
  const coverKey = `organizaciones/${avaluo.organizacion.UIdentificadorPublico}/avaluos/${avaluo.UIdentificadorPublico}/caratula/imagen-principal/${randomUUID()}.jpg`;
  const cover = await file(coverKey);
  await prisma.relacionArchivo.create({
    data: { IdArchivo: cover.IdArchivo, IdTipoRelacionArchivo: relationType.IdTipoRelacionArchivo, SEntidad: "AVALUO_PRUEBA", SIdentificadorEntidad: avaluo.UIdentificadorPublico },
  });

  // A comparable with the advertiser's contact, only in this valuation.
  const property = (name: string) => prisma.propiedad.create({ data: { IdOrganizacion: organizationId, IdTipoInmueble: avaluo.IdTipoInmueble, SNombre: name } });
  const listed = await property("Terreno anunciado");
  const publication = await prisma.publicacionPropiedad.create({
    data: {
      IdPropiedad: listed.IdPropiedad, IdFuenteInmobiliaria: source.IdFuenteInmobiliaria, IdTipoOperacion: operation.IdTipoOperacion,
      IdEstadoPublicacion: publicationState.IdEstadoPublicacion, SURL: "https://example.test/anuncio", SNombreContacto: "Anunciante Inventado", STelefonoContacto: "3300000000",
    },
  });
  const comparableData = (propertyId: number) => ({
    IdPropiedad: propertyId, IdUsuarioSeleccion: user.id, IdTipoComparable: comparableType.IdTipoComparable,
    JPropiedadSnapshot: {}, JDireccionSnapshot: {}, JUbicacionSnapshot: {}, JPublicacionSnapshot: { contacto: "Anunciante Inventado" },
  });
  await prisma.comparableAvaluo.create({ data: { ...comparableData(listed.IdPropiedad), IdAvaluo: avaluo.IdAvaluo, IdVersionAvaluo: versionId, IdPublicacionPropiedad: publication.IdPublicacionPropiedad } });
  // Another comparable whose property the firm's base also keeps: the property stays.
  const shared = await property("Terreno de la base");
  await prisma.comparableAvaluo.create({ data: { ...comparableData(shared.IdPropiedad), IdAvaluo: avaluo.IdAvaluo, IdVersionAvaluo: versionId } });
  await prisma.comparableAvaluo.create({ data: { ...comparableData(shared.IdPropiedad), IdOrganizacion: organizationId } });
  const subject = await property("Inmueble valuado");

  await prisma.avaluo.update({
    where: { IdAvaluo: avaluo.IdAvaluo },
    data: {
      BBloqueado: true, DFechaBloqueo: concludedAt, DFechaConclusion: concludedAt, IdVersionFinal: versionId, IdVersionTrabajo: null,
      IdPropiedadSujeto: subject.IdPropiedad, SNombreCliente: "Cliente Inventado",
    },
  });
  await adjustCredits({ organizationId, credits: 5, reason: "Saldo de prueba" });
  await prisma.movimientoCreditos.create({
    data: { IdOrganizacion: organizationId, STipo: "CONSUMO", ICreditos: -1, IdAvaluo: avaluo.IdAvaluo, IdUsuario: user.id, SDescripcion: "Avalúo de prueba concluido" },
  });
  return {
    valuationId: avaluo.IdAvaluo, publicId: avaluo.UIdentificadorPublico, organizationId, userId: user.id, versionId,
    editorKey, coverKey, listedPropertyId: listed.IdPropiedad, publicationId: publication.IdPublicacionPropiedad,
    sharedPropertyId: shared.IdPropiedad, subjectPropertyId: subject.IdPropiedad,
  };
}

describe("retention of concluded valuations (matrix 1.12)", () => {
  test("acceptance: a fictitious expired valuation gets the warning email first and then is suppressed", async (t) => {
    const sent = captureNotices(t);
    const deleted: string[] = [];
    const storage = { deleteObject: async (key: string) => void deleted.push(key) };
    const now = new Date();
    const fixture = await concludedValuationFixture(addMonths(now, -13));
    const scope = { valuationIds: [fixture.valuationId], storage };
    const balance = await getCreditBalance(fixture.organizationId);
    assert.equal(balance, 4);

    // Flag off: --apply only counts; nothing sent, nothing deleted.
    withFlag(t, "VALUATION_RETENTION_ENABLED", undefined);
    assert.deepEqual(await runRetention({ apply: true, now, ...scope }), {
      reviewed: 1, warnings: 1, suppressed: 0, blocked: 0, failedEmails: 0, filesDeleted: 0, fileErrors: 0, applied: false,
    });
    assert.equal(sent.length, 0);
    assert.equal(await prisma.versionAvaluo.count({ where: { IdAvaluo: fixture.valuationId } }), 1);

    // On: the warning first, even though the retention already expired; nothing suppressed yet.
    withFlag(t, "VALUATION_RETENTION_ENABLED", "true");
    const warned = await runRetention({ apply: true, now, ...scope });
    assert.equal(warned.warnings, 1);
    assert.equal(warned.suppressed, 0);
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /Descarga o respalda el reporte del avalúo TEST-/);
    assert.doesNotMatch(sent[0].text, /Cliente Inventado/);
    const [log] = await noticesOf(fixture.userId);
    assert.equal(log.STipo, "GUARDA_POR_VENCER");
    assert.equal(log.SIdentificadorEntidad, fixture.publicId);
    assert.equal(await prisma.versionAvaluo.count({ where: { IdAvaluo: fixture.valuationId } }), 1);

    // Thirty days after the warning: suppressed, without a second email.
    const later = addDays(now, 30);
    const dry = await runRetention({ apply: false, now: later, ...scope });
    assert.equal(dry.suppressed, 1);
    assert.equal(await prisma.versionAvaluo.count({ where: { IdAvaluo: fixture.valuationId } }), 1);
    const result = await runRetention({ apply: true, now: later, ...scope });
    assert.deepEqual({ suppressed: result.suppressed, blocked: result.blocked, warnings: result.warnings }, { suppressed: 1, blocked: 0, warnings: 0 });
    assert.equal(sent.length, 1);

    const row = await prisma.avaluo.findUniqueOrThrow({ where: { IdAvaluo: fixture.valuationId } });
    assert.equal(row.DFechaSupresion?.toISOString(), later.toISOString());
    assert.equal(row.STitulo, SUPPRESSED_VALUATION_TITLE);
    assert.equal(row.SNombreCliente, null);
    assert.equal(row.BActivo, false);
    assert.match(row.SFolio, /^TEST-/);
    assert.equal(await prisma.versionAvaluo.count({ where: { IdAvaluo: fixture.valuationId } }), 0);
    assert.equal(await prisma.seccionDocumento.count({ where: { IdVersionAvaluo: fixture.versionId } }), 0);
    assert.equal(await prisma.comparableAvaluo.count({ where: { IdAvaluo: fixture.valuationId } }), 0);
    assert.equal(await prisma.publicacionPropiedad.count({ where: { IdPublicacionPropiedad: fixture.publicationId } }), 0);
    assert.equal(await prisma.propiedad.count({ where: { IdPropiedad: { in: [fixture.listedPropertyId, fixture.subjectPropertyId] } } }), 0);
    assert.equal(await prisma.propiedad.count({ where: { IdPropiedad: fixture.sharedPropertyId } }), 1, "the firm's base keeps its property");
    assert.equal(await prisma.archivo.count({ where: { SClaveObjeto: { in: [fixture.editorKey, fixture.coverKey] } } }), 0);
    assert.deepEqual([...deleted].sort(), [fixture.coverKey, fixture.editorKey].sort());
    // The ledger and the email log stay as they were.
    assert.equal(await prisma.movimientoCreditos.count({ where: { IdAvaluo: fixture.valuationId } }), 1);
    assert.equal(await getCreditBalance(fixture.organizationId), balance);
    assert.equal((await noticesOf(fixture.userId)).length, 1);

    // Done once: the next run has nothing to do.
    assert.equal((await runRetention({ apply: true, now: addDays(later, 1), ...scope })).reviewed, 0);
  });

  test("a valuation within its retention is left alone", async (t) => {
    const sent = captureNotices(t);
    withFlag(t, "VALUATION_RETENTION_ENABLED", "true");
    const now = new Date();
    const fixture = await concludedValuationFixture(addMonths(now, -2));
    const result = await runRetention({ apply: true, now, valuationIds: [fixture.valuationId], storage: { deleteObject: async () => undefined } });
    assert.deepEqual({ warnings: result.warnings, suppressed: result.suppressed }, { warnings: 0, suppressed: 0 });
    assert.equal(sent.length, 0);
    assert.equal(await prisma.versionAvaluo.count({ where: { IdAvaluo: fixture.valuationId } }), 1);
  });

  test("an image another valuation of the firm still uses is kept, in the database and in storage", async (t) => {
    captureNotices(t);
    withFlag(t, "VALUATION_RETENTION_ENABLED", "true");
    const deleted: string[] = [];
    const now = new Date();
    const fixture = await concludedValuationFixture(addMonths(now, -13));
    // A copy of the valuation (as «Duplicar» leaves it) whose content points to the same image.
    const copy = await prisma.avaluo.findUniqueOrThrow({ where: { IdAvaluo: fixture.valuationId } });
    const copyRow = await prisma.avaluo.create({
      data: {
        IdOrganizacion: copy.IdOrganizacion, IdUsuarioCreador: copy.IdUsuarioCreador, IdEstadoAvaluo: copy.IdEstadoAvaluo, IdTipoAvaluo: copy.IdTipoAvaluo,
        IdTipoInmueble: copy.IdTipoInmueble, IdTipoOperacion: copy.IdTipoOperacion, SFolio: `${copy.SFolio}-C`, STitulo: "Copia", IdAvaluoOrigen: copy.IdAvaluo,
      },
    });
    const version = await prisma.versionAvaluo.create({
      data: { IdAvaluo: copyRow.IdAvaluo, IdUsuarioCreador: copy.IdUsuarioCreador, IdEstadoVersionAvaluo: (await prisma.estadoVersionAvaluo.findFirstOrThrow({ where: { BActivo: true } })).IdEstadoVersionAvaluo, INumeroVersion: 1 },
    });
    const section = await prisma.seccionDocumento.create({ data: { IdVersionAvaluo: version.IdVersionAvaluo, SClave: "DATOS", SNombre: "Datos generales" } });
    await prisma.nodoDocumento.create({
      data: {
        IdSeccionDocumento: section.IdSeccionDocumento,
        IdTipoNodoDocumento: (await prisma.tipoNodoDocumento.findFirstOrThrow({ where: { BActivo: true } })).IdTipoNodoDocumento,
        SClave: "foto",
        STitulo: "Fotografía",
        JConfiguracion: { kind: "image", src: `/api/archivos/imagen?key=${encodeURIComponent(fixture.editorKey)}` },
      },
    });

    await runRetention({ apply: true, now, valuationIds: [fixture.valuationId] , storage: { deleteObject: async (key) => void deleted.push(key) } });
    const result = await runRetention({ apply: true, now: addDays(now, 30), valuationIds: [fixture.valuationId], storage: { deleteObject: async (key) => void deleted.push(key) } });
    assert.equal(result.suppressed, 1);
    assert.equal(await prisma.archivo.count({ where: { SClaveObjeto: fixture.editorKey } }), 1);
    assert.deepEqual(deleted, [fixture.coverKey]);
  });
});
