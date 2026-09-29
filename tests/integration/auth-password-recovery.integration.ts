import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { AUTH_SESSION_COOKIE, PASSWORD_RESET_TTL_MINUTES } from "../../src/features/auth/constants/auth.constants";
import { authenticateWithPassword } from "../../src/features/auth/services/authentication.service";
import { verifyPassword } from "../../src/features/auth/services/password.service";
import {
  consumePasswordRecoveryToken,
  requestPasswordRecovery,
} from "../../src/features/auth/services/password-recovery.service";
import { createSecureSession, getCurrentSession } from "../../src/features/auth/services/session.service";
import { hashToken } from "../../src/security/tokens/token-hashing";
import {
  TestCookieJar,
  assertLocalDatabase,
  captureAuthEmails,
  createAuthUserFixture,
  prisma,
  testIp,
  tokenFromLink,
  withCookies,
} from "./support";

after(() => prisma.$disconnect());
before(() => assertLocalDatabase());

const NEW_PASSWORD = "Nueva-Clave-2026!";

function login(email: string, password: string) {
  return withCookies(new TestCookieJar(), () => authenticateWithPassword({ email, password, ip: testIp() }));
}

test("asking to reset an unknown email answers the same and sends nothing", async (t) => {
  const mail = captureAuthEmails(t);
  const known = await createAuthUserFixture();
  const tokensBefore = await prisma.tokenRecuperacionContrasena.count();

  const unknownAnswer = await requestPasswordRecovery(`nadie-${randomUUID()}@example.test`, "10.0.0.1", "UA");
  assert.equal(mail.passwordReset.length, 0);
  assert.equal(await prisma.tokenRecuperacionContrasena.count(), tokensBefore);

  const knownAnswer = await requestPasswordRecovery(known.email, "10.0.0.1", "UA");
  assert.equal(mail.passwordReset.length, 1);
  // The caller cannot tell the two cases apart.
  assert.equal(unknownAnswer, undefined);
  assert.deepEqual(knownAnswer, unknownAnswer);
});

test("a deleted account does not receive a reset link", async (t) => {
  const mail = captureAuthEmails(t);
  const fixture = await createAuthUserFixture();
  await prisma.usuario.update({ where: { IdUsuario: fixture.userId }, data: { DFechaEliminacion: new Date() } });
  await requestPasswordRecovery(fixture.email);
  assert.equal(mail.passwordReset.length, 0);
  assert.equal(await prisma.tokenRecuperacionContrasena.count({ where: { IdUsuario: fixture.userId } }), 0);
});

test("a reset request emails a one-hour link whose token is stored only as a hash", async (t) => {
  const mail = captureAuthEmails(t);
  const fixture = await createAuthUserFixture({ label: "olvidadiza" });

  await requestPasswordRecovery(fixture.email, "10.1.2.3", "Safari/18");
  assert.equal(mail.passwordReset.length, 1);
  const [email] = mail.passwordReset;
  assert.equal(email.to, fixture.email);
  assert.equal(email.name, "olvidadiza");
  const link = new URL(email.resetUrl);
  assert.equal(link.pathname, "/restablecer-contrasena");
  const token = tokenFromLink(email.resetUrl);

  const record = await prisma.tokenRecuperacionContrasena.findFirstOrThrow({ where: { IdUsuario: fixture.userId } });
  assert.equal(record.STokenHash, hashToken(token));
  assert.notEqual(record.STokenHash, token);
  assert.equal(record.SDireccionIPSolicitud, "10.1.2.3");
  assert.equal(record.SAgenteUsuarioSolicitud, "Safari/18");
  assert.equal(record.BUtilizado, false);
  const ttl = record.DFechaExpiracion.getTime() - record.DFechaCreacion.getTime();
  assert.ok(Math.abs(ttl - PASSWORD_RESET_TTL_MINUTES * 60_000) < 60_000, `ttl ${ttl}ms`);

  // Requesting a reset changes nothing about the current password.
  assert.deepEqual(await login(fixture.email, fixture.password!), { ok: true });
});

test("resetting the password changes it, spends the token, clears locks and logs out every session", async (t) => {
  const mail = captureAuthEmails(t);
  const fixture = await createAuthUserFixture();
  await prisma.usuario.update({
    where: { IdUsuario: fixture.userId },
    data: { IReintentosConsecutivos: 7, DFechaBloqueoTemporal: new Date(Date.now() + 10 * 60_000) },
  });
  // Two browsers are logged in (e.g. the owner's, and an attacker's who knew the old password).
  const browsers = [new TestCookieJar(), new TestCookieJar()];
  for (const jar of browsers) {
    await withCookies(jar, () => createSecureSession({ userId: fixture.userId, organizationId: fixture.organizationId }));
    assert.ok(await withCookies(jar, () => getCurrentSession()));
  }

  await requestPasswordRecovery(fixture.email);
  const token = tokenFromLink(mail.passwordReset[0].resetUrl);
  assert.equal(await consumePasswordRecoveryToken(token, NEW_PASSWORD), true);

  const user = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: fixture.userId } });
  assert.equal(await verifyPassword(NEW_PASSWORD, user.SContrasenaHash!), true);
  assert.equal(await verifyPassword(fixture.password!, user.SContrasenaHash!), false);
  assert.ok(user.DFechaCambioContrasena);
  assert.equal(user.IReintentosConsecutivos, 0);
  assert.equal(user.DFechaBloqueoTemporal, null);

  const record = await prisma.tokenRecuperacionContrasena.findUniqueOrThrow({ where: { STokenHash: hashToken(token) } });
  assert.equal(record.BUtilizado, true);
  assert.ok(record.DFechaUtilizacion);

  for (const jar of browsers) {
    assert.equal(await withCookies(jar, () => getCurrentSession()), null);
  }
  assert.equal(await prisma.sesion.count({ where: { IdUsuario: fixture.userId, BRevocada: false } }), 0);

  const audit = await prisma.auditoria.findFirst({ where: { IdUsuario: fixture.userId, SAccion: "PASSWORD_RESET" } });
  assert.equal(audit?.SResultado, "EXITOSO");

  assert.deepEqual(await login(fixture.email, fixture.password!), { ok: false, reason: "INVALID_CREDENTIALS" });
  const jar = new TestCookieJar();
  assert.deepEqual(await withCookies(jar, () => authenticateWithPassword({ email: fixture.email, password: NEW_PASSWORD, ip: testIp() })), {
    ok: true,
  });
  assert.ok(jar.get(AUTH_SESSION_COOKIE));
});

test("a reset link works only once", async (t) => {
  const mail = captureAuthEmails(t);
  const fixture = await createAuthUserFixture();
  await requestPasswordRecovery(fixture.email);
  const token = tokenFromLink(mail.passwordReset[0].resetUrl);

  assert.equal(await consumePasswordRecoveryToken(token, NEW_PASSWORD), true);
  assert.equal(await consumePasswordRecoveryToken(token, "Otra-Clave-2026!"), false);
  const user = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: fixture.userId } });
  assert.equal(await verifyPassword(NEW_PASSWORD, user.SContrasenaHash!), true);
});

test("two simultaneous submissions of the same reset link change the password only once", async (t) => {
  const mail = captureAuthEmails(t);
  const fixture = await createAuthUserFixture();
  await requestPasswordRecovery(fixture.email);
  const token = tokenFromLink(mail.passwordReset[0].resetUrl);

  const results = await Promise.all([
    consumePasswordRecoveryToken(token, "Primera-Clave-2026!"),
    consumePasswordRecoveryToken(token, "Segunda-Clave-2026!"),
  ]);
  assert.deepEqual(results.filter(Boolean).length, 1);
});

test("unknown and tampered reset tokens change nothing", async (t) => {
  const mail = captureAuthEmails(t);
  const fixture = await createAuthUserFixture();
  await requestPasswordRecovery(fixture.email);
  const token = tokenFromLink(mail.passwordReset[0].resetUrl);

  for (const bad of ["", "token-inventado", `${token}x`, token.slice(1), hashToken(token)]) {
    assert.equal(await consumePasswordRecoveryToken(bad, NEW_PASSWORD), false, bad);
  }
  assert.deepEqual(await login(fixture.email, fixture.password!), { ok: true });
});

test("an expired reset link is rejected", async (t) => {
  const mail = captureAuthEmails(t);
  const fixture = await createAuthUserFixture();
  await requestPasswordRecovery(fixture.email);
  const token = tokenFromLink(mail.passwordReset[0].resetUrl);
  await prisma.tokenRecuperacionContrasena.update({
    where: { STokenHash: hashToken(token) },
    data: { DFechaCreacion: new Date(Date.now() - 2 * 60 * 60_000), DFechaExpiracion: new Date(Date.now() - 1000) },
  });

  assert.equal(await consumePasswordRecoveryToken(token, NEW_PASSWORD), false);
  assert.deepEqual(await login(fixture.email, fixture.password!), { ok: true });
});

test("a newer reset request invalidates the earlier link", async (t) => {
  const mail = captureAuthEmails(t);
  const fixture = await createAuthUserFixture();
  await requestPasswordRecovery(fixture.email);
  await requestPasswordRecovery(fixture.email);
  const [older, newer] = mail.passwordReset.map((email) => tokenFromLink(email.resetUrl));
  assert.notEqual(older, newer);

  assert.equal(await consumePasswordRecoveryToken(older, NEW_PASSWORD), false);
  assert.equal(await consumePasswordRecoveryToken(newer, NEW_PASSWORD), true);
});

test("a reset token belongs to its user only", async (t) => {
  const mail = captureAuthEmails(t);
  const alice = await createAuthUserFixture({ label: "alicia" });
  const bob = await createAuthUserFixture({ label: "beto" });
  await requestPasswordRecovery(alice.email);
  await requestPasswordRecovery(bob.email);
  const aliceToken = tokenFromLink(mail.passwordReset.find((email) => email.to === alice.email)!.resetUrl);

  assert.equal(await consumePasswordRecoveryToken(aliceToken, NEW_PASSWORD), true);
  assert.deepEqual(await login(alice.email, NEW_PASSWORD), { ok: true });
  // Bob's password and link are untouched.
  assert.deepEqual(await login(bob.email, bob.password!), { ok: true });
  const bobToken = await prisma.tokenRecuperacionContrasena.findFirstOrThrow({ where: { IdUsuario: bob.userId } });
  assert.equal(bobToken.BUtilizado, false);
  assert.equal(bobToken.DFechaRevocacion, null);
});
