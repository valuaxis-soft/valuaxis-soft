/**
 * The phone verification without the database: how a typed number becomes
 * E.164, how it is masked, what the user reads for each failure, and the
 * Twilio Verify gateway against a fake of its API (no network, no messages).
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { formatPhone, maskPhone, normalizePhone } from "../src/features/account/phone/phone-number";
import { PhoneVerificationError } from "../src/features/account/phone/phone-verification-gateway";
import {
  isPhoneVerificationEnabled,
  isPhoneVerificationRequired,
  overridePhoneVerificationGateway,
  overridePhoneVerificationRequired,
} from "../src/features/account/phone/phone-verification-provider";
import { createTwilioVerifyGateway } from "../src/infrastructure/phone/twilio-verify-gateway";
import { startFakeTwilioVerifyServer } from "./support/fake-twilio-verify-server";

// Invented numbers and credentials.
const ACCOUNT_SID = "ACfake00000000000000000000000000";
const AUTH_TOKEN = "token-de-prueba";
const SERVICE_SID = "VAfake00000000000000000000000000";

afterEach(() => {
  overridePhoneVerificationGateway(undefined);
  overridePhoneVerificationRequired(undefined);
});

test("a Mexican number typed in any usual way becomes +52 and its ten digits", () => {
  for (const typed of ["3312345678", "33 1234 5678", "(33) 1234-5678", "33.1234.5678", "523312345678", "+52 33 1234 5678", "+521 33 1234 5678", "5213312345678", "0052 33 1234 5678"]) {
    assert.equal(normalizePhone(typed), "+523312345678", typed);
  }
});

test("another country needs its + and code; anything else is not a phone", () => {
  assert.equal(normalizePhone("+1 (415) 555-0100"), "+14155550100");
  assert.equal(normalizePhone("+34 600 000 000"), "+34600000000");
  for (const typed of ["", "12345", "331234567", "33123456789", "+52 33 1234 567", "teléfono", "33-1234-5678 ext 2", "+0 123 456 789", "+1234567"]) {
    assert.equal(normalizePhone(typed), null, typed);
  }
});

test("logs and the audit see the country and the last four digits only", () => {
  assert.equal(maskPhone("+523312345678"), "+52 ••••••5678");
  assert.equal(maskPhone("+14155550100"), "+••••••0100");
  assert.equal(maskPhone("+523312345678").includes("3312"), false);
  assert.equal(formatPhone("+523312345678"), "+52 3312345678");
});

test("every failure reads in Spanish with its status; the duplicate phone says so", () => {
  const taken = new PhoneVerificationError("taken");
  assert.equal(taken.message, "Ese teléfono ya está verificado en otra cuenta.");
  assert.equal(taken.status, 409);
  assert.match(new PhoneVerificationError("wrong_code").message, /código no es correcto/);
  assert.match(new PhoneVerificationError("expired").message, /venció/);
  assert.equal(new PhoneVerificationError("too_many_sends").status, 429);
  assert.equal(new PhoneVerificationError("invalid_number").status, 400);
  assert.equal(new PhoneVerificationError("configuration").status, 503);
});

test("the gateway sends and checks a code as Twilio Verify expects, with Basic auth and form bodies", async () => {
  const fake = await startFakeTwilioVerifyServer();
  try {
    const gateway = createTwilioVerifyGateway({ accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN, serviceSid: SERVICE_SID, baseUrl: fake.url });
    await gateway.sendCode("+523312345678", "whatsapp");
    assert.equal(await gateway.checkCode("+523312345678", "000000"), false, "a wrong code is pending, not an error");
    assert.equal(await gateway.checkCode("+523312345678", fake.code), true);

    const [send, wrong] = fake.requests;
    assert.equal(send.path, `/v2/Services/${SERVICE_SID}/Verifications`);
    assert.deepEqual(send.form, { To: "+523312345678", Channel: "whatsapp", Locale: "es" });
    assert.equal(send.authorization, `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64")}`);
    assert.equal(wrong.path, `/v2/Services/${SERVICE_SID}/VerificationCheck`);
    assert.deepEqual(wrong.form, { To: "+523312345678", Code: "000000" });

    // Approved, Twilio deletes the verification: a second check is a 404.
    await assert.rejects(gateway.checkCode("+523312345678", fake.code), (error: PhoneVerificationError) => error.kind === "expired");
  } finally {
    await fake.close();
  }
});

test("Twilio's errors become the user's messages, and the log never holds the code, the token or the number", async (t) => {
  const answers: Record<string, { status: number; body: Record<string, unknown> }> = {
    invalid: { status: 400, body: { code: 60200, message: "Invalid parameter `To`: +5233", status: 400 } },
    sends: { status: 429, body: { code: 60203, message: "Max send attempts reached", status: 429 } },
    checks: { status: 429, body: { code: 60202, message: "Max check attempts reached", status: 429 } },
    whatsapp: { status: 400, body: { code: 60223, message: "Delivery channel disabled: WHATSAPP", status: 400 } },
    auth: { status: 401, body: { code: 20003, message: "Authenticate", status: 401 } },
    landline: { status: 400, body: { code: 60205, message: "SMS is not supported by landline phone number", status: 400 } },
    limit: { status: 429, body: { code: 20429, message: "Too many requests", status: 429 } },
    exhausted: { status: 200, body: { status: "max_attempts_reached" } },
    server: { status: 503, body: {} },
  };
  let next = "invalid";
  const fake = await startFakeTwilioVerifyServer({ respond: () => answers[next] });
  const warnings: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => warnings.push(args.join(" ")));
  try {
    const gateway = createTwilioVerifyGateway({ accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN, serviceSid: SERVICE_SID, baseUrl: fake.url });
    const expected: Record<string, [string, "send" | "check"]> = {
      invalid: ["invalid_number", "send"],
      sends: ["too_many_sends", "send"],
      checks: ["too_many_checks", "check"],
      whatsapp: ["channel_unavailable", "send"],
      auth: ["configuration", "send"],
      landline: ["landline", "send"],
      limit: ["rate_limit", "check"],
      exhausted: ["too_many_checks", "check"],
      server: ["unavailable", "send"],
    };
    for (const [scenario, [kind, operation]] of Object.entries(expected)) {
      next = scenario;
      const call = operation === "send" ? gateway.sendCode("+523312345678", "sms") : gateway.checkCode("+523312345678", "987654");
      await assert.rejects(call, (error: unknown) => error instanceof PhoneVerificationError && error.kind === kind, scenario);
    }
    const log = warnings.join("\n");
    assert.ok(log.includes("+52 ••••••5678"));
    for (const secret of ["3312345678", "987654", AUTH_TOKEN]) assert.equal(log.includes(secret), false, secret);
  } finally {
    await fake.close();
  }
});

test("a provider that does not answer is «unavailable»", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const gateway = createTwilioVerifyGateway({ accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN, serviceSid: SERVICE_SID, baseUrl: "http://127.0.0.1:9/v2" });
  await assert.rejects(gateway.sendCode("+523312345678", "sms"), (error: unknown) => error instanceof PhoneVerificationError && error.kind === "unavailable");
});

test("the requirement is ignored without the provider, and said once in the log", (t) => {
  const warnings: string[] = [];
  t.mock.method(console, "warn", (message: string) => warnings.push(message));
  overridePhoneVerificationGateway(null);
  overridePhoneVerificationRequired(true);
  assert.equal(isPhoneVerificationEnabled(), false);
  assert.equal(isPhoneVerificationRequired(), false);
  assert.equal(isPhoneVerificationRequired(), false);
  assert.equal(warnings.filter((line) => line.includes("PHONE_VERIFICATION_REQUIRED")).length, 1);

  overridePhoneVerificationGateway({ sendCode: async () => undefined, checkCode: async () => true });
  assert.equal(isPhoneVerificationRequired(), true);
  overridePhoneVerificationRequired(false);
  assert.equal(isPhoneVerificationRequired(), false);
});
