import assert from "node:assert/strict";
import { test } from "node:test";
import { EmailConfigurationError, EmailDeliveryError } from "../src/infrastructure/email/email.errors";
import { buildResendConfig, createEmailService } from "../src/infrastructure/email/email-service.factory";
import {
  RESEND_MAX_ATTACHMENTS_BASE64_BYTES,
  RESEND_TIMEOUT_MS,
  ResendEmailService,
  type ResendEmailConfig,
} from "../src/infrastructure/email/resend-email.service";

const API_KEY = "re_test_not_a_real_key";

const config: ResendEmailConfig = {
  apiKey: API_KEY,
  fromEmail: "no-reply@example.test",
  fromName: "Valuaxis Soft",
  replyTo: "contacto@example.test",
};

type Call = { url: string; init: RequestInit; body: Record<string, unknown> };

function fakeFetch(respond: () => Promise<Response> | Response = () => Response.json({ id: "email-1" })) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init!, body: JSON.parse(String(init!.body)) });
    return respond();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const resetInput = {
  to: "persona@example.test",
  name: "Persona",
  resetUrl: "https://app.example.test/restablecer-contrasena?token=abc",
};

const dictamenInput = {
  to: ["cliente@example.test", "otro@example.test"],
  replyTo: "despacho@example.test",
  subject: "Dictamen del avalúo VX-001",
  message: "Le comparto el dictamen.",
  folio: "VX-001",
  firm: { name: "Despacho Ejemplo", phone: null, email: "despacho@example.test" },
  pdf: { filename: "Dictamen VX-001.pdf", content: Buffer.from("%PDF-1.7 contenido de prueba") },
};

test("resend posts a system email with sender, reply-to, subject, text and html", async () => {
  const { calls, fetchImpl } = fakeFetch();
  await new ResendEmailService(config, fetchImpl).sendPasswordResetEmail(resetInput);

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.url, "https://api.resend.com/emails");
  assert.equal(call.init.method, "POST");
  assert.equal(new Headers(call.init.headers).get("authorization"), `Bearer ${API_KEY}`);
  assert.ok(call.init.signal instanceof AbortSignal);
  assert.equal(call.body.from, '"Valuaxis Soft" <no-reply@example.test>');
  assert.deepEqual(call.body.to, ["persona@example.test"]);
  assert.equal(call.body.reply_to, "contacto@example.test");
  assert.equal(call.body.subject, "Restablece tu contraseña de Valuaxis Soft");
  assert.match(String(call.body.text), /restablecer-contrasena\?token=abc/);
  assert.match(String(call.body.html), /Restablecer contraseña/);
  assert.equal(call.body.attachments, undefined);
});

test("resend sends the dictamen in the firm's name with the PDF as base64", async () => {
  const { calls, fetchImpl } = fakeFetch();
  await new ResendEmailService(config, fetchImpl).sendDictamenEmail(dictamenInput);

  const { body } = calls[0];
  assert.equal(body.from, '"Despacho Ejemplo vía Valuaxis Soft" <no-reply@example.test>');
  assert.deepEqual(body.to, dictamenInput.to);
  // Replies go to the firm, not to the system reply-to.
  assert.equal(body.reply_to, "despacho@example.test");
  assert.equal(body.subject, "Dictamen del avalúo VX-001");
  assert.match(String(body.text), /Le comparto el dictamen/);
  assert.deepEqual(body.attachments, [
    { filename: "Dictamen VX-001.pdf", content: dictamenInput.pdf.content.toString("base64"), content_type: "application/pdf" },
  ]);
});

test("resend sends no reply-to when the firm has no email", async () => {
  const { calls, fetchImpl } = fakeFetch();
  await new ResendEmailService(config, fetchImpl).sendDictamenEmail({ ...dictamenInput, replyTo: null });
  assert.equal("reply_to" in calls[0].body, false);
});

test("resend maps a non-2xx answer to an EmailDeliveryError and never logs the key", async (t) => {
  const errorLog = t.mock.method(console, "error", () => {});
  const { fetchImpl } = fakeFetch(() =>
    Response.json({ statusCode: 403, name: "validation_error", message: "The domain is not verified." }, { status: 403 }),
  );

  await assert.rejects(
    new ResendEmailService(config, fetchImpl).sendPasswordResetEmail(resetInput),
    (error) =>
      error instanceof EmailDeliveryError &&
      error.message === "No pudimos enviar el correo por Resend." &&
      error.cause instanceof Error &&
      error.cause.message === "The domain is not verified.",
  );
  assert.equal(errorLog.mock.callCount(), 1);
  const logged = JSON.stringify(errorLog.mock.calls[0].arguments);
  assert.match(logged, /"status":403/);
  assert.doesNotMatch(logged, new RegExp(API_KEY));
});

test("resend maps a network failure or a timeout to an EmailDeliveryError", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const failure of [new TypeError("fetch failed"), new DOMException("The operation was aborted due to timeout", "TimeoutError")]) {
    const { fetchImpl } = fakeFetch(() => Promise.reject(failure));
    await assert.rejects(
      new ResendEmailService(config, fetchImpl).sendPasswordResetEmail(resetInput),
      (error) => error instanceof EmailDeliveryError && error.cause === failure,
    );
  }
  assert.ok(RESEND_TIMEOUT_MS > 0 && RESEND_TIMEOUT_MS < 120_000);
});

test("resend refuses an attachment over its 40 MB limit without calling the API", async () => {
  const { calls, fetchImpl } = fakeFetch();
  const tooBig = Buffer.alloc(Math.ceil((RESEND_MAX_ATTACHMENTS_BASE64_BYTES / 4) * 3) + 3);
  await assert.rejects(
    new ResendEmailService(config, fetchImpl).sendDictamenEmail({ ...dictamenInput, pdf: { filename: "x.pdf", content: tooBig } }),
    (error) => error instanceof EmailDeliveryError && /40 MB/.test(error.message),
  );
  assert.equal(calls.length, 0);
});

const resendEnv = (values: Record<string, string>) =>
  ({ EMAIL_PROVIDER: "resend", APP_URL: "https://app.example.test", ...values }) as Record<string, string> as NodeJS.ProcessEnv;

test("the factory refuses resend without an API key", () => {
  assert.throws(
    () => createEmailService(resendEnv({ EMAIL_FROM_ADDRESS: "no-reply@example.test", EMAIL_FROM_NAME: "Valuaxis Soft" })),
    (error) => error instanceof EmailConfigurationError && error.message.includes("RESEND_API_KEY"),
  );
});

test("the factory builds resend with the generic sender, falling back to the SES sender", () => {
  assert.ok(
    createEmailService(resendEnv({ RESEND_API_KEY: API_KEY, EMAIL_FROM_ADDRESS: "a@example.test", EMAIL_FROM_NAME: "A" })) instanceof
      ResendEmailService,
  );
  assert.deepEqual(
    buildResendConfig(resendEnv({ RESEND_API_KEY: API_KEY, SES_FROM_EMAIL: "ses@example.test", SES_FROM_NAME: "SES", EMAIL_REPLY_TO: "r@example.test" })),
    { apiKey: API_KEY, fromEmail: "ses@example.test", fromName: "SES", replyTo: "r@example.test" },
  );
  assert.equal(
    buildResendConfig(resendEnv({ RESEND_API_KEY: API_KEY, EMAIL_FROM_ADDRESS: "new@example.test", SES_FROM_EMAIL: "old@example.test", EMAIL_FROM_NAME: "N" })).fromEmail,
    "new@example.test",
  );
});

test("the factory rejects an unknown provider listing the three valid ones", () => {
  assert.throws(
    () => createEmailService({ EMAIL_PROVIDER: "brevo" } as Record<string, string> as NodeJS.ProcessEnv),
    (error) => error instanceof EmailConfigurationError && /"resend"/.test(error.message),
  );
});

test("pnpm env:check fails at startup for resend without an API key, naming the variable", async () => {
  const { spawnSync } = await import("node:child_process");
  const run = (extra: Record<string, string>) =>
    spawnSync(process.execPath, ["--import", "tsx", "scripts/check-env.ts"], {
      encoding: "utf8",
      env: { NODE_ENV: "production", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DATABASE_URL: "postgresql://localhost/x", EMAIL_PROVIDER: "resend", ...extra },
    });

  const missing = run({});
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /RESEND_API_KEY/);
  assert.equal(run({ RESEND_API_KEY: API_KEY }).status, 0);
});
