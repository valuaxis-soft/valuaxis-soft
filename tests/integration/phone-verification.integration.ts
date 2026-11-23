/**
 * The phone verification against the local database, with the Twilio gateway
 * pointed at a fake of its API (tests/support/fake-twilio-verify-server.ts):
 * the whole flow through the routes, one verified phone per account, the
 * switch that requires it to create valuations, the switch ignored without
 * keys, and what the audit keeps. No test here reaches Twilio.
 */
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage, type WorkUnitStore } from "next/dist/server/app-render/work-unit-async-storage.external";
import { POST as postValuation } from "../../src/app/api/avaluos/route";
import { POST as duplicateValuation } from "../../src/app/api/avaluos/[id]/duplicar/route";
import { GET as getPhone } from "../../src/app/api/cuenta/telefono/route";
import { POST as postCode } from "../../src/app/api/cuenta/telefono/codigo/route";
import { POST as postCheck } from "../../src/app/api/cuenta/telefono/verificar/route";
import { overridePhoneVerificationGateway, overridePhoneVerificationRequired } from "../../src/features/account/phone/phone-verification-provider";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { getValuationCreationCatalogs } from "../../src/features/valuations/services/valuation-catalogs.service";
import { createTwilioVerifyGateway } from "../../src/infrastructure/phone/twilio-verify-gateway";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { startFakeTwilioVerifyServer } from "../support/fake-twilio-verify-server";
import { createValuationFixture, prisma, TestCookieJar, withCookies } from "./support";

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;
type Body = { error?: string; code?: string; link?: string; data?: Record<string, unknown> };

let fake: Awaited<ReturnType<typeof startFakeTwilioVerifyServer>>;
const useFakeTwilio = () =>
  overridePhoneVerificationGateway(createTwilioVerifyGateway({ accountSid: "ACfake", authToken: "token-de-prueba", serviceSid: "VAfake", baseUrl: fake.url }));

before(async () => {
  fake = await startFakeTwilioVerifyServer();
});
// Off unless a test turns it on: the .env's keys are never used.
afterEach(() => {
  overridePhoneVerificationGateway(null);
  overridePhoneVerificationRequired(false);
});
after(async () => {
  overridePhoneVerificationGateway(undefined);
  overridePhoneVerificationRequired(undefined);
  await fake.close();
  await prisma.$disconnect();
});

/** An invented Mexican mobile number, different on every run so earlier runs never hold it. */
const inventedPhone = () => `55${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

async function signIn(fixture: Fixture) {
  const role = await prisma.rol.findUniqueOrThrow({ where: { SClave: "ADMINISTRADOR" } });
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

/** Creating a valuation revalidates the dashboard and schedules a notice: it needs a request in an action. */
function inAction<T>(jar: TestCookieJar, fn: () => Promise<T>): Promise<T> {
  return withCookies(jar, () => {
    const workStore = { route: "/integration-test", incrementalCache: {}, afterContext: { after: () => undefined } } as unknown as WorkStore;
    const unitStore = { type: "request", phase: "action", cookies: jar, userspaceMutableCookies: jar } as unknown as WorkUnitStore;
    return workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(unitStore, fn));
  });
}

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

async function call(jar: TestCookieJar, handler: Handler, path: string, body?: unknown, id = "") {
  const request = new Request(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.62", "user-agent": "Pruebas" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const run = () => handler(request, { params: Promise.resolve({ id }) });
  const response = await (handler === (postValuation as Handler) ? inAction(jar, run) : withCookies(jar, run));
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Body };
}

async function createValuation(jar: TestCookieJar, fixture: Fixture) {
  const catalogs = await getValuationCreationCatalogs(fixture.organizationId);
  return call(jar, postValuation as Handler, "/api/avaluos", {
    title: "Casa de prueba",
    clientName: "Cliente inventado",
    appraisalTypeId: catalogs.appraisalTypes[0].id,
    propertyTypeId: catalogs.propertyTypes[0].id,
    operationTypeId: catalogs.operationTypes[0].id,
  });
}

const sendCode = (jar: TestCookieJar, phone: string, channel = "sms") => call(jar, postCode as Handler, "/api/cuenta/telefono/codigo", { phone, channel });
const checkCode = (jar: TestCookieJar, phone: string, code: string) => call(jar, postCheck as Handler, "/api/cuenta/telefono/verificar", { phone, code });

test("a person verifies the phone with the code; a wrong code is refused; the audit keeps it masked", async () => {
  useFakeTwilio();
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);
  const typed = inventedPhone();
  const e164 = `+52${typed}`;

  const invalid = await sendCode(jar, "12345");
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error!, /no es válido/);

  const sent = await sendCode(jar, `${typed.slice(0, 2)} ${typed.slice(2, 6)} ${typed.slice(6)}`, "whatsapp");
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.data!.phone, e164);
  assert.deepEqual(fake.requests.at(-1)!.form, { To: e164, Channel: "whatsapp", Locale: "es" });
  const pendingRow = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: fixture.user.id } });
  assert.equal(pendingRow.STelefono, e164, "the number typed is kept for the next visit");
  assert.equal(pendingRow.BTelefonoVerificado, false);

  const wrong = await checkCode(jar, e164, "000000");
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error, "El código no es correcto. Revísalo y vuelve a escribirlo.");

  const right = await checkCode(jar, e164, fake.code);
  assert.equal(right.status, 200, JSON.stringify(right.body));
  assert.equal(right.body.data!.verified, true);

  const read = await call(jar, getPhone as Handler, "/api/cuenta/telefono");
  assert.equal(read.body.data!.phone, e164);
  assert.equal(read.body.data!.verified, true);
  assert.ok(read.body.data!.verifiedAt);

  const again = await sendCode(jar, typed);
  assert.equal(again.status, 409, "the same verified phone does not spend another message");

  const audits = await prisma.auditoria.findMany({ where: { IdUsuario: fixture.user.id, SAccion: { startsWith: "TELEFONO_" } }, orderBy: { IdAuditoria: "asc" } });
  assert.deepEqual(audits.map((row) => row.SAccion), ["TELEFONO_CODIGO_ENVIADO", "TELEFONO_VERIFICADO"]);
  const stored = JSON.stringify(audits.map((row) => row.JMetadatos));
  assert.ok(stored.includes(`+52 ••••••${typed.slice(-4)}`));
  assert.equal(stored.includes(typed), false, "the whole number is not in the audit");
  assert.equal(stored.includes(fake.code), false);
});

test("a phone verified by another account is refused, before sending and at the check", async () => {
  useFakeTwilio();
  const first = await createValuationFixture();
  const second = await createValuationFixture();
  const firstJar = await signIn(first);
  const secondJar = await signIn(second);
  const e164 = `+52${inventedPhone()}`;

  // The second account gets a code first, then the first account verifies the number.
  assert.equal((await sendCode(secondJar, e164)).status, 200);
  assert.equal((await sendCode(firstJar, e164)).status, 200);
  assert.equal((await checkCode(firstJar, e164, fake.code)).status, 200);

  const refusedSend = await sendCode(secondJar, e164);
  assert.equal(refusedSend.status, 409);
  assert.equal(refusedSend.body.error, "Ese teléfono ya está verificado en otra cuenta.");
  const refusedCheck = await checkCode(secondJar, e164, fake.code);
  assert.equal(refusedCheck.status, 409);
  assert.equal(refusedCheck.body.error, "Ese teléfono ya está verificado en otra cuenta.");

  // The database refuses it too (migration 062's partial unique index).
  await assert.rejects(
    prisma.usuario.update({ where: { IdUsuario: second.user.id }, data: { STelefono: e164, BTelefonoVerificado: true } }),
    (error: { code?: string }) => error.code === "P2002",
  );
});

test("with the switch on, creating or duplicating a valuation waits for the verified phone", async () => {
  useFakeTwilio();
  overridePhoneVerificationRequired(true);
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);

  const refused = await createValuation(jar, fixture);
  assert.equal(refused.status, 403);
  assert.equal(refused.body.code, "PHONE_VERIFICATION_REQUIRED");
  assert.equal(refused.body.link, "/cuenta#telefono");
  assert.match(refused.body.error!, /verifica tu teléfono en «Mi cuenta»/);
  const duplicate = await call(jar, duplicateValuation as Handler, `/api/avaluos/${fixture.publicId}/duplicar`, {}, fixture.publicId);
  assert.equal(duplicate.status, 403);

  const e164 = `+52${inventedPhone()}`;
  await sendCode(jar, e164);
  assert.equal((await checkCode(jar, e164, fake.code)).status, 200);
  const created = await createValuation(jar, fixture);
  assert.equal(created.status, 201, JSON.stringify(created.body));
});

test("without the Twilio keys nothing is asked: the switch is ignored and the routes say it is not enabled", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  overridePhoneVerificationGateway(null);
  overridePhoneVerificationRequired(true);
  const fixture = await createValuationFixture();
  const jar = await signIn(fixture);

  const created = await createValuation(jar, fixture);
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const read = await call(jar, getPhone as Handler, "/api/cuenta/telefono");
  assert.equal(read.body.data!.enabled, false);
  assert.equal(read.body.data!.required, false);
  const sent = await sendCode(jar, inventedPhone());
  assert.equal(sent.status, 503);
  assert.equal(sent.body.error, "La verificación de teléfono todavía no está habilitada.");
});
