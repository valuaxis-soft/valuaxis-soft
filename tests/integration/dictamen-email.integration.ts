/**
 * Sending the dictamen by email, end to end on the local database, without a
 * browser or a mail server: Chromium is replaced by a fake that "prints" a
 * small PDF, and the email is captured from the development provider.
 */
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { after, before, beforeEach, test, type TestContext } from "node:test";
import type { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { chromium } from "playwright-core";
import { POST } from "../../src/app/api/avaluos/[id]/dictamen/correo/route";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { sendDictamenByEmail } from "../../src/features/valuations/services/dictamen-email.service";
import { concludeValuation, saveValuationSections, ValuationWorkflowError } from "../../src/features/valuations/services/valuation-workflow.service";
import { AmazonSesEmailService } from "../../src/infrastructure/email/amazon-ses-email.service";
import { getEmailService, type DictamenEmailInput } from "../../src/infrastructure/email/email.service";
import { PdfRenderError } from "../../src/infrastructure/pdf/chromium-pdf";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { createValuationFixture, prisma, TestCookieJar, withCookies } from "./support";

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const FAKE_PDF = Buffer.from("%PDF-1.7\n% dictamen de prueba\n%%EOF\n");
const INPUT = { to: ["cliente@example.test"], subject: "Dictamen de avalúo", message: "Buen día,\n\nLe compartimos el dictamen." };

const storedOrganizations = new Set<string>();
let originalChromiumPath: string | undefined;

before(() => {
  originalChromiumPath = process.env.CHROMIUM_PATH;
});
beforeEach(() => {
  process.env.CHROMIUM_PATH = "/fake/chromium";
});
after(async () => {
  if (originalChromiumPath === undefined) delete process.env.CHROMIUM_PATH;
  else process.env.CHROMIUM_PATH = originalChromiumPath;
  for (const uuid of storedOrganizations) await rm(join(process.cwd(), "public", "organizaciones", uuid), { recursive: true, force: true });
  await prisma.$disconnect();
});

/** Replaces Chromium: records what was opened and returns `pdf` as the printed page. */
function fakeChromium(t: TestContext, pdf: Buffer = FAKE_PDF) {
  const opened: Array<{ url: string; cookies: Array<{ name: string; value: string }> }> = [];
  t.mock.method(chromium, "launch", async () => {
    let cookies: Array<{ name: string; value: string }> = [];
    let url = "";
    const page = {
      setDefaultTimeout() {},
      async goto(target: string) {
        url = target;
        opened.push({ url: target, cookies });
        return { ok: () => true, status: () => 200 };
      },
      url: () => url,
      async emulateMedia() {},
      async evaluate() {},
      locator: () => ({ count: async () => 3 }),
      waitForTimeout: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
      pdf: async () => pdf,
    };
    return {
      async newContext() {
        return {
          async addCookies(list: Array<{ name: string; value: string }>) {
            cookies = list.map(({ name, value }) => ({ name, value }));
          },
          async route() {},
          newPage: async () => page,
        };
      },
      async close() {},
    };
  });
  return opened;
}

/** Captures the dictamen emails instead of printing them. */
function captureDictamenEmails(t: TestContext, fail = false) {
  const sent: DictamenEmailInput[] = [];
  t.mock.method(getEmailService(), "sendDictamenEmail", async (input: DictamenEmailInput) => {
    if (fail) throw new Error("SES rejected the message");
    sent.push(input);
  });
  return sent;
}

async function editableFixture() {
  const fixture = await createValuationFixture();
  const organization = await prisma.organizacion.update({
    where: { IdOrganizacion: fixture.organizationId },
    data: { SCorreo: "contacto@despacho.mx", STelefono: "348 000 0000" },
  });
  storedOrganizations.add(organization.UIdentificadorPublico);
  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: fixture.user,
    sections: [{ id: "costos", label: "ENF. COSTOS", title: "ENF. COSTOS", blocks: [] }],
  });
  return { ...fixture, firmName: organization.SNombre };
}

const exportsOf = async (fixture: Fixture) => {
  const { IdAvaluo } = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  return prisma.exportacionAvaluo.findMany({
    where: { IdAvaluo },
    include: { archivo: { include: { tipoArchivo: true } } },
    orderBy: { IdExportacionAvaluo: "asc" },
  });
};

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

test("the dictamen leaves in the firm's name with the PDF attached, and the PDF is kept as an export", async (t) => {
  const opened = fakeChromium(t);
  const sent = captureDictamenEmails(t);
  const fixture = await editableFixture();

  const result = await sendDictamenByEmail(fixture.user, fixture.publicId, "session-token", INPUT);
  const folio = (await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } })).SFolio;
  assert.deepEqual(result, { filename: `Dictamen-${folio}.pdf`, bytes: FAKE_PDF.length });

  assert.equal(opened.length, 1);
  assert.match(opened[0].url, new RegExp(`/avaluos/${fixture.publicId}/dictamen$`));
  assert.deepEqual(opened[0].cookies, [{ name: AUTH_SESSION_COOKIE, value: "session-token" }], "printed with the user's own session");

  assert.equal(sent.length, 1);
  const email = sent[0];
  assert.deepEqual(email.to, INPUT.to);
  assert.equal(email.replyTo, "contacto@despacho.mx", "replies go to the firm");
  assert.equal(email.subject, INPUT.subject);
  assert.equal(email.message, INPUT.message);
  assert.equal(email.folio, folio);
  assert.deepEqual(email.firm, { name: fixture.firmName, phone: "348 000 0000", email: "contacto@despacho.mx" });
  assert.equal(email.pdf.filename, `Dictamen-${folio}.pdf`);
  assert.ok(email.pdf.content.equals(FAKE_PDF));

  const [exported] = await exportsOf(fixture);
  assert.equal(exported.STipoExportacion, "DICTAMEN_CORREO");
  assert.deepEqual(exported.JParametros, { to: INPUT.to });
  assert.equal(exported.SEstado, "COMPLETADA");
  assert.equal(exported.IdUsuario, fixture.user.id);
  assert.equal(exported.archivo?.IdOrganizacion, fixture.organizationId);
  assert.equal(exported.archivo?.tipoArchivo.SClave, "PDF_BORRADOR", "an open valuation sends a draft");
  assert.equal(exported.archivo?.BPrivado, true);

  // Through SES, the sender reads "<firm> vía Valuaxis" and the PDF is attached.
  const commands: SendEmailCommand[] = [];
  const ses = new AmazonSesEmailService(
    { async send(command) { commands.push(command); return {}; } },
    { region: "us-east-1", accessKeyId: "k", secretAccessKey: "s", fromEmail: "no-reply@example.test", fromName: "Valuaxis" },
  );
  await ses.sendDictamenEmail(email);
  const raw = Buffer.from(commands[0].input.Content?.Raw?.Data ?? new Uint8Array()).toString("utf8");
  const from = /^From: =\?UTF-8\?B\?([^?]+)\?= <([^>]+)>/m.exec(raw);
  assert.ok(from, "an encoded From header");
  assert.equal(Buffer.from(from[1], "base64").toString("utf8"), `${fixture.firmName} vía Valuaxis`);
  assert.equal(from[2], "no-reply@example.test");
  assert.deepEqual(commands[0].input.ReplyToAddresses, ["contacto@despacho.mx"]);
  assert.match(raw, new RegExp(`filename="Dictamen-${folio}\\.pdf"`));
});

test("a concluded valuation sends its final PDF", async (t) => {
  fakeChromium(t);
  captureDictamenEmails(t);
  const fixture = await editableFixture();
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user: fixture.user });
  await sendDictamenByEmail(fixture.user, fixture.publicId, "session-token", INPUT);
  const [exported] = await exportsOf(fixture);
  const { IdVersionFinal } = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  assert.equal(exported.archivo?.tipoArchivo.SClave, "PDF_FINAL");
  assert.equal(exported.IdVersionAvaluo, IdVersionFinal);
});

test("another organization cannot email a valuation: nothing is printed, stored or sent", async (t) => {
  const opened = fakeChromium(t);
  const sent = captureDictamenEmails(t);
  const fixture = await editableFixture();
  const intruder = await createValuationFixture();

  await assert.rejects(sendDictamenByEmail(intruder.user, fixture.publicId, "token", INPUT), (error: unknown) =>
    error instanceof ValuationWorkflowError && error.status === 404);
  assert.equal(opened.length, 0);
  assert.equal(sent.length, 0);
  assert.deepEqual(await exportsOf(fixture), []);
});

test("a valuation without content cannot be emailed", async (t) => {
  const opened = fakeChromium(t);
  const sent = captureDictamenEmails(t);
  const fixture = await createValuationFixture();
  await assert.rejects(sendDictamenByEmail(fixture.user, fixture.publicId, "token", INPUT), (error: unknown) =>
    error instanceof ValuationWorkflowError && error.status === 409);
  assert.equal(opened.length, 0);
  assert.equal(sent.length, 0);
});

test("a PDF over 25 MB is not emailed, with a Spanish explanation", async (t) => {
  fakeChromium(t, Buffer.alloc(25 * 1024 * 1024 + 1, 0x20));
  const sent = captureDictamenEmails(t);
  const fixture = await editableFixture();
  await assert.rejects(sendDictamenByEmail(fixture.user, fixture.publicId, "token", INPUT), (error: unknown) =>
    error instanceof ValuationWorkflowError && error.status === 413 && /más de 25 MB/.test(error.message));
  assert.equal(sent.length, 0);
});

test("when the email provider fails, the user is told the PDF was kept and to try again", async (t) => {
  fakeChromium(t);
  captureDictamenEmails(t, true);
  t.mock.method(console, "error", () => {});
  const fixture = await editableFixture();
  await assert.rejects(sendDictamenByEmail(fixture.user, fixture.publicId, "token", INPUT), (error: unknown) =>
    error instanceof ValuationWorkflowError && error.status === 502 && error.message.startsWith("El PDF se generó y quedó guardado"));
  assert.equal((await exportsOf(fixture)).length, 1, "the generated PDF is kept");
});

test("without a PDF renderer nothing is sent", async (t) => {
  delete process.env.CHROMIUM_PATH;
  const sent = captureDictamenEmails(t);
  const fixture = await editableFixture();
  await assert.rejects(sendDictamenByEmail(fixture.user, fixture.publicId, "token", INPUT), PdfRenderError);
  assert.equal(sent.length, 0);
  assert.deepEqual(await exportsOf(fixture), []);
});

/* ------------------------------------------------------------------ */
/*  Route: permission and validation                                   */
/* ------------------------------------------------------------------ */

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

async function post(jar: TestCookieJar, publicId: string, body: unknown) {
  const request = new Request(`http://localhost/api/avaluos/${publicId}/dictamen/correo`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.9", "user-agent": "Pruebas" },
    body: JSON.stringify(body),
  });
  const context = { params: Promise.resolve({ id: publicId }) } as Parameters<typeof POST>[1];
  const response = await withCookies(jar, () => POST(request, context));
  return { status: response.status, body: (await response.json()) as { error?: string; fields?: Array<{ path: string; message: string }>; data?: unknown } };
}

test("roles without the share permission cannot email the dictamen, and the denial is audited", async (t) => {
  for (const roleKey of ["CONSULTA", "REVISOR"]) {
    const opened = fakeChromium(t);
    const sent = captureDictamenEmails(t);
    const fixture = await editableFixture();
    const jar = await signIn(fixture, roleKey);
    const response = await post(jar, fixture.publicId, INPUT);
    assert.equal(response.status, 403, roleKey);
    assert.equal(response.body.error, "Permiso insuficiente");
    assert.equal(opened.length + sent.length, 0);
    const denied = await prisma.auditoria.findFirst({ where: { IdUsuario: fixture.user.id, SAccion: "API_PERMISSION_DENIED", SIdentificadorEntidad: "AVALUO_COMPARTIR" } });
    assert.ok(denied, `${roleKey} denial recorded`);
  }
});

test("without a session the route answers 401", async () => {
  const fixture = await createValuationFixture();
  const response = await post(new TestCookieJar(), fixture.publicId, INPUT);
  assert.equal(response.status, 401);
});

test("invalid recipients are rejected with Spanish messages before anything is printed", async (t) => {
  const opened = fakeChromium(t);
  const fixture = await editableFixture();
  const jar = await signIn(fixture, "VALUADOR");

  const invalid = await post(jar, fixture.publicId, { ...INPUT, to: ["cliente@example.test", "no-es-correo"] });
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error ?? "", /^Los datos enviados no son válidos \(.+\)\.$/);
  assert.deepEqual(invalid.body.fields, [{ path: "to.1", message: "Hay un correo que no es válido." }]);

  const none = await post(jar, fixture.publicId, { ...INPUT, to: [] });
  assert.deepEqual(none.body.fields, [{ path: "to", message: "Escribe al menos un correo." }]);
  const many = await post(jar, fixture.publicId, { ...INPUT, to: Array.from({ length: 6 }, (_, index) => `p${index}@example.test`) });
  assert.deepEqual(many.body.fields, [{ path: "to", message: "Máximo 5 destinatarios." }]);
  const empty = await post(jar, fixture.publicId, { ...INPUT, subject: " ", message: "" });
  assert.deepEqual(empty.body.fields?.map((field) => field.message), ["Escribe el asunto.", "Escribe el mensaje."]);
  assert.equal(opened.length, 0);
});

test("an appraiser emails the dictamen through the route; the export is audited with the recipients", async (t) => {
  fakeChromium(t);
  const sent = captureDictamenEmails(t);
  const fixture = await editableFixture();
  const jar = await signIn(fixture, "VALUADOR");

  const response = await post(jar, fixture.publicId, { ...INPUT, to: ["Cliente@Example.test", "cliente@example.test", "otro@example.test"] });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, { to: ["cliente@example.test", "otro@example.test"] });
  assert.deepEqual(sent[0].to, ["cliente@example.test", "otro@example.test"], "lowercased and deduplicated");

  const audit = await prisma.auditoria.findFirstOrThrow({ where: { SIdentificadorEntidad: fixture.publicId, SAccion: "VALUATION_EXPORT" } });
  assert.equal(audit.IdUsuario, fixture.user.id);
  assert.equal(audit.SDireccionIP, "203.0.113.9");
  assert.deepEqual(audit.JMetadatos, { format: "pdf", channel: "email", recipients: "cliente@example.test, otro@example.test", bytes: FAKE_PDF.length });
});

test("through the route, another organization's valuation is not found", async (t) => {
  const opened = fakeChromium(t);
  const sent = captureDictamenEmails(t);
  const victim = await editableFixture();
  const intruder = await createValuationFixture();
  const jar = await signIn(intruder, "ADMINISTRADOR");
  const response = await post(jar, victim.publicId, INPUT);
  assert.equal(response.status, 404);
  assert.equal(opened.length + sent.length, 0);
});
