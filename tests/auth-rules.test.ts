import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOGIN_LOCK_MINUTES,
  MAX_LOGIN_RETRIES,
  SESSION_MAX_LIFETIME_SECONDS,
  SESSION_TTL_SECONDS,
} from "../src/features/auth/constants/auth.constants";
import { isTemporarilyLocked, nextLockDate } from "../src/features/auth/rules/authentication.rules";
import { buildOrganizationSlug, buildPersonalOrganizationName } from "../src/features/auth/rules/registration.rules";
import { buildSessionExpiration, computeRenewedExpiration } from "../src/features/auth/rules/session.rules";
import { hashPassword, verifyPassword } from "../src/features/auth/services/password.service";
import { validatePasswordPolicy } from "../src/features/auth/validations/password-policy";

const NOW = Date.parse("2026-09-28T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const TTL = SESSION_TTL_SECONDS * 1000;

test("a temporary lock applies only while its date is in the future", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  assert.equal(isTemporarilyLocked(null), false);
  assert.equal(isTemporarilyLocked(new Date(NOW + 1000)), true);
  assert.equal(isTemporarilyLocked(new Date(NOW)), false);
  assert.equal(isTemporarilyLocked(new Date(NOW - 1000)), false);
});

test("the account locks on the failure that reaches the retry limit, for the lock window", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  assert.equal(nextLockDate(0), null);
  assert.equal(nextLockDate(MAX_LOGIN_RETRIES - 2), null);
  assert.equal(nextLockDate(MAX_LOGIN_RETRIES - 1)?.getTime(), NOW + LOGIN_LOCK_MINUTES * 60 * 1000);
  assert.equal(nextLockDate(MAX_LOGIN_RETRIES + 10)?.getTime(), NOW + LOGIN_LOCK_MINUTES * 60 * 1000);
});

test("a new session expires after the idle timeout", () => {
  assert.equal(buildSessionExpiration(NOW).getTime(), NOW + TTL);
});

test("a session is not renewed while more than half of the idle timeout remains", () => {
  const createdAt = new Date(NOW - HOUR);
  assert.equal(computeRenewedExpiration({ createdAt, expiresAt: new Date(NOW + TTL), now: NOW }), null);
  assert.equal(computeRenewedExpiration({ createdAt, expiresAt: new Date(NOW + TTL / 2 + 1), now: NOW }), null);
});

test("a session close to expiring is extended to a full idle timeout from now", () => {
  const renewed = computeRenewedExpiration({ createdAt: new Date(NOW - 5 * HOUR), expiresAt: new Date(NOW + HOUR), now: NOW });
  assert.equal(renewed?.getTime(), NOW + TTL);
  // Exactly half remaining already qualifies.
  const atHalf = computeRenewedExpiration({ createdAt: new Date(NOW - HOUR), expiresAt: new Date(NOW + TTL / 2), now: NOW });
  assert.equal(atHalf?.getTime(), NOW + TTL);
});

test("an expired session is never renewed", () => {
  const createdAt = new Date(NOW - 10 * HOUR);
  assert.equal(computeRenewedExpiration({ createdAt, expiresAt: new Date(NOW), now: NOW }), null);
  assert.equal(computeRenewedExpiration({ createdAt, expiresAt: new Date(NOW - 1), now: NOW }), null);
});

test("renewal never goes past the absolute lifetime counted from login", () => {
  const maxLifetime = SESSION_MAX_LIFETIME_SECONDS * 1000;
  const createdAt = new Date(NOW - maxLifetime + 2 * HOUR);
  const renewed = computeRenewedExpiration({ createdAt, expiresAt: new Date(NOW + HOUR), now: NOW });
  assert.equal(renewed?.getTime(), createdAt.getTime() + maxLifetime);

  // Already expiring at the hard limit: nothing to extend.
  const lateCreatedAt = new Date(NOW - maxLifetime + HOUR);
  assert.equal(
    computeRenewedExpiration({ createdAt: lateCreatedAt, expiresAt: new Date(lateCreatedAt.getTime() + maxLifetime), now: NOW }),
    null,
  );
});

test("the personal space is named after the user", () => {
  assert.equal(buildPersonalOrganizationName("Álvaro"), "Espacio personal de Álvaro");
});

test("organization slugs are ASCII, hyphenated and unique per creation instant", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const stamp = NOW.toString(36);
  assert.equal(buildOrganizationSlug("Valuadores de los Altos, S.A."), `valuadores-de-los-altos-s-a-${stamp}`);
  assert.equal(buildOrganizationSlug("  Peña & Núñez  "), `pena-nunez-${stamp}`);
  assert.equal(buildOrganizationSlug("日本"), `organizacion-${stamp}`);
  assert.equal(buildOrganizationSlug(""), `organizacion-${stamp}`);
  const long = buildOrganizationSlug("a".repeat(300));
  assert.equal(long, `${"a".repeat(120)}-${stamp}`);
});

test("the password policy rejects each missing requirement and accepts a strong password", () => {
  assert.equal(validatePasswordPolicy("").valid, false);
  const cases: Array<[string, RegExp]> = [
    ["Ab1!short", /10 caracteres/],
    ["ABCDEFGHIJ1!", /minúscula/],
    ["abcdefghij1!", /mayúscula/],
    ["Abcdefghijk!", /número/],
    ["Abcdefghij12", /símbolo/],
  ];
  for (const [password, message] of cases) {
    const result = validatePasswordPolicy(password);
    assert.equal(result.valid, false, password);
    assert.match(result.errors.join(" "), message, password);
    assert.equal(result.score, 4, password);
  }
  assert.deepEqual(validatePasswordPolicy("Clave-Segura-2026"), { valid: true, errors: [], score: 5 });
});

test("passwords are stored as salted bcrypt hashes that only match the original", async () => {
  const first = await hashPassword("Clave-Segura-2026");
  const second = await hashPassword("Clave-Segura-2026");
  assert.match(first, /^\$2[aby]\$12\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("Clave-Segura-2026", first), true);
  assert.equal(await verifyPassword("clave-segura-2026", first), false);
  assert.equal(await verifyPassword("", first), false);
});
