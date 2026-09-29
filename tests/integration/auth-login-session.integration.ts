import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import {
  AUTH_SESSION_COOKIE,
  LOGIN_LOCK_MINUTES,
  MAX_LOGIN_FAILURES_PER_IP,
  MAX_LOGIN_RETRIES,
  SESSION_MAX_LIFETIME_SECONDS,
  SESSION_TTL_SECONDS,
} from "../../src/features/auth/constants/auth.constants";
import { authenticateWithPassword } from "../../src/features/auth/services/authentication.service";
import {
  createSecureSession,
  getCurrentSession,
  renewCurrentSession,
  revokeCurrentSession,
  revokeUserSessions,
} from "../../src/features/auth/services/session.service";
import { parseLoginInput } from "../../src/features/auth/validations/login.schema";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import {
  TestCookieJar,
  assertLocalDatabase,
  createAuthUserFixture,
  prisma,
  testIp,
  withCookies,
} from "./support";

after(() => prisma.$disconnect());
before(() => assertLocalDatabase());

const HOUR = 60 * 60 * 1000;

function login(jar: TestCookieJar, input: { email: string; password: string; ip?: string; userAgent?: string }) {
  return withCookies(jar, () =>
    authenticateWithPassword({ ip: input.ip ?? testIp(), userAgent: input.userAgent ?? "node-test", ...input }),
  );
}

const sessionCookie = (jar: TestCookieJar) => jar.get(AUTH_SESSION_COOKIE)?.value;

/** A session row for the user plus a browser holding its cookie. */
async function openSession(userId: number, organizationId: number, overrides: { createdAt?: Date; expiresAt?: Date } = {}) {
  const token = createSecureToken();
  const session = await prisma.sesion.create({
    data: {
      IdUsuario: userId,
      IdOrganizacion: organizationId,
      STokenHash: hashToken(token),
      DFechaCreacion: overrides.createdAt ?? new Date(),
      DFechaExpiracion: overrides.expiresAt ?? new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    },
  });
  const jar = new TestCookieJar();
  jar.set(AUTH_SESSION_COOKIE, token);
  return { jar, token, sessionId: session.IdSesion };
}

// ---------------------------------------------------------------- login

test("a verified user logs in: one session, an opaque cookie and a clean failure counter", async () => {
  const fixture = await createAuthUserFixture();
  await prisma.usuario.update({ where: { IdUsuario: fixture.userId }, data: { IReintentosConsecutivos: 3 } });
  const ip = testIp();
  const jar = new TestCookieJar();

  const result = await login(jar, { email: fixture.email, password: fixture.password!, ip, userAgent: "Firefox/130" });
  assert.deepEqual(result, { ok: true });

  const token = sessionCookie(jar);
  assert.ok(token, "session cookie was set");
  const cookie = jar.values.get(AUTH_SESSION_COOKIE)!;
  assert.equal(cookie.options.httpOnly, true);
  assert.equal(cookie.options.maxAge, SESSION_TTL_SECONDS);

  const sessions = await prisma.sesion.findMany({ where: { IdUsuario: fixture.userId } });
  assert.equal(sessions.length, 1);
  const [session] = sessions;
  // Only the hash of the cookie is stored.
  assert.equal(session.STokenHash, hashToken(token));
  assert.notEqual(session.STokenHash, token);
  assert.equal(session.IdOrganizacion, fixture.organizationId);
  assert.equal(session.SDireccionIP, ip);
  assert.equal(session.SAgenteUsuario, "Firefox/130");
  assert.equal(session.BRevocada, false);
  const localIdentity = await prisma.identidadUsuario.findFirstOrThrow({ where: { IdUsuario: fixture.userId } });
  assert.equal(session.IdIdentidadUsuario, localIdentity.IdIdentidadUsuario);
  const ttl = session.DFechaExpiracion.getTime() - Date.now();
  assert.ok(ttl > SESSION_TTL_SECONDS * 1000 - 60_000 && ttl <= SESSION_TTL_SECONDS * 1000, `ttl ${ttl}`);

  const user = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: fixture.userId } });
  assert.equal(user.IReintentosConsecutivos, 0);
  assert.equal(user.DFechaBloqueoTemporal, null);
  assert.ok(user.DFechaUltimoAcceso);

  const attempt = await prisma.intentoAcceso.findFirstOrThrow({ where: { IdUsuario: fixture.userId }, orderBy: { IdIntentoAcceso: "desc" } });
  assert.equal(attempt.BExitoso, true);
  const audit = await prisma.auditoria.findFirst({ where: { IdUsuario: fixture.userId, SAccion: "LOGIN_PASSWORD" } });
  assert.equal(audit?.SResultado, "EXITOSO");
  assert.equal(audit?.IdOrganizacion, fixture.organizationId);

  // The cookie now opens the app.
  const current = await withCookies(jar, () => getCurrentSession());
  assert.equal(current?.user.id, fixture.userId);
});

test("the login form normalizes the email, so casing and spaces do not matter", async () => {
  const fixture = await createAuthUserFixture();
  const form = new FormData();
  form.set("email", `  ${fixture.email.toUpperCase()}  `);
  form.set("password", fixture.password!);
  const parsed = parseLoginInput(form);
  assert.equal(parsed.ok, true);
  const result = await login(new TestCookieJar(), { email: parsed.data.email, password: parsed.data.password });
  assert.deepEqual(result, { ok: true });
});

test("a wrong password and an unknown email get the same answer, so accounts cannot be enumerated", async () => {
  const fixture = await createAuthUserFixture();
  const jar = new TestCookieJar();

  const wrongPassword = await login(jar, { email: fixture.email, password: `${fixture.password}x` });
  const unknownEmail = await login(jar, { email: `nadie-${randomUUID()}@example.test`, password: fixture.password! });
  assert.deepEqual(wrongPassword, { ok: false, reason: "INVALID_CREDENTIALS" });
  assert.deepEqual(unknownEmail, wrongPassword);

  assert.equal(sessionCookie(jar), undefined);
  assert.equal(await prisma.sesion.count({ where: { IdUsuario: fixture.userId } }), 0);
  const user = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: fixture.userId } });
  assert.equal(user.IReintentosConsecutivos, 1);
  const attempt = await prisma.intentoAcceso.findFirstOrThrow({ where: { IdUsuario: fixture.userId } });
  assert.equal(attempt.BExitoso, false);
  assert.equal(attempt.SMotivoFallo, "INVALID_PASSWORD");
});

test("an unverified user with the right password is asked to verify; with a wrong one, nothing is revealed", async () => {
  const fixture = await createAuthUserFixture({ verified: false });
  const jar = new TestCookieJar();
  assert.deepEqual(await login(jar, { email: fixture.email, password: `${fixture.password}x` }), {
    ok: false,
    reason: "INVALID_CREDENTIALS",
  });
  assert.deepEqual(await login(jar, { email: fixture.email, password: fixture.password! }), {
    ok: false,
    reason: "EMAIL_NOT_VERIFIED",
  });
  assert.equal(sessionCookie(jar), undefined);
  assert.equal(await prisma.sesion.count({ where: { IdUsuario: fixture.userId } }), 0);
});

test("deactivated and suspended accounts cannot log in, even with the right password", async () => {
  const inactive = await createAuthUserFixture();
  await prisma.usuario.update({ where: { IdUsuario: inactive.userId }, data: { BActivo: false } });
  const suspended = await createAuthUserFixture();
  const suspendedState = await prisma.estadoUsuario.findUniqueOrThrow({ where: { SClave: "SUSPENDIDO" } });
  await prisma.usuario.update({ where: { IdUsuario: suspended.userId }, data: { IdEstadoUsuario: suspendedState.IdEstadoUsuario } });

  for (const fixture of [inactive, suspended]) {
    const jar = new TestCookieJar();
    assert.deepEqual(await login(jar, { email: fixture.email, password: fixture.password! }), {
      ok: false,
      reason: "ACCOUNT_INACTIVE",
    });
    assert.equal(sessionCookie(jar), undefined);
    assert.equal(await prisma.sesion.count({ where: { IdUsuario: fixture.userId } }), 0);
  }
});

test("a deleted account behaves like an unknown email", async () => {
  const fixture = await createAuthUserFixture();
  await prisma.usuario.update({ where: { IdUsuario: fixture.userId }, data: { DFechaEliminacion: new Date() } });
  assert.deepEqual(await login(new TestCookieJar(), { email: fixture.email, password: fixture.password! }), {
    ok: false,
    reason: "INVALID_CREDENTIALS",
  });
});

test("an account without a password points Google users to Google and tells others nothing", async () => {
  const googleUser = await createAuthUserFixture({ password: null });
  const google = await prisma.proveedorIdentidad.findUniqueOrThrow({ where: { SClave: "GOOGLE" } });
  await prisma.identidadUsuario.create({
    data: {
      IdUsuario: googleUser.userId,
      IdProveedorIdentidad: google.IdProveedorIdentidad,
      SIdentificadorProveedor: `google-sub-${randomUUID()}`,
      SCorreoProveedor: googleUser.email,
    },
  });
  const noPassword = await createAuthUserFixture({ password: null });

  assert.deepEqual(await login(new TestCookieJar(), { email: googleUser.email, password: "Cualquier-Clave-1" }), {
    ok: false,
    reason: "ACCOUNT_USES_GOOGLE",
  });
  assert.deepEqual(await login(new TestCookieJar(), { email: noPassword.email, password: "Cualquier-Clave-1" }), {
    ok: false,
    reason: "INVALID_CREDENTIALS",
  });
});

test("the failure that reaches the global retry limit locks the account for the lock window", async () => {
  const fixture = await createAuthUserFixture();
  await prisma.usuario.update({ where: { IdUsuario: fixture.userId }, data: { IReintentosConsecutivos: MAX_LOGIN_RETRIES - 1 } });

  const before = Date.now();
  assert.deepEqual(await login(new TestCookieJar(), { email: fixture.email, password: "Clave-Incorrecta-1" }), {
    ok: false,
    reason: "INVALID_CREDENTIALS",
  });
  const user = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: fixture.userId } });
  assert.equal(user.IReintentosConsecutivos, MAX_LOGIN_RETRIES);
  assert.ok(user.DFechaBloqueoTemporal);
  const lockMs = user.DFechaBloqueoTemporal.getTime() - before;
  assert.ok(Math.abs(lockMs - LOGIN_LOCK_MINUTES * 60_000) < 60_000, `lock ${lockMs}ms`);

  // While locked, even the right password from a fresh IP is refused.
  const jar = new TestCookieJar();
  assert.deepEqual(await login(jar, { email: fixture.email, password: fixture.password! }), { ok: false, reason: "ACCOUNT_BLOCKED" });
  assert.equal(sessionCookie(jar), undefined);
});

test("an expired lock no longer blocks, and a successful login clears it", async () => {
  const fixture = await createAuthUserFixture();
  await prisma.usuario.update({
    where: { IdUsuario: fixture.userId },
    data: { IReintentosConsecutivos: MAX_LOGIN_RETRIES, DFechaBloqueoTemporal: new Date(Date.now() - 1000) },
  });
  assert.deepEqual(await login(new TestCookieJar(), { email: fixture.email, password: fixture.password! }), { ok: true });
  const user = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: fixture.userId } });
  assert.equal(user.IReintentosConsecutivos, 0);
  assert.equal(user.DFechaBloqueoTemporal, null);
});

test("repeated failures lock only the attacking IP out of the account", async () => {
  const fixture = await createAuthUserFixture();
  const attackerIp = testIp();
  for (let attempt = 0; attempt < MAX_LOGIN_FAILURES_PER_IP; attempt += 1) {
    assert.deepEqual(await login(new TestCookieJar(), { email: fixture.email, password: `mala-${attempt}`, ip: attackerIp }), {
      ok: false,
      reason: "INVALID_CREDENTIALS",
    });
  }

  // The attacker now gets blocked even when guessing right…
  const attackerJar = new TestCookieJar();
  assert.deepEqual(await login(attackerJar, { email: fixture.email, password: fixture.password!, ip: attackerIp }), {
    ok: false,
    reason: "ACCOUNT_BLOCKED",
  });
  assert.equal(sessionCookie(attackerJar), undefined);
  // …even with different casing of the email…
  assert.deepEqual(await login(new TestCookieJar(), { email: fixture.email.toUpperCase(), password: fixture.password!, ip: attackerIp }), {
    ok: false,
    reason: "ACCOUNT_BLOCKED",
  });
  // …while the owner, from their own IP, still gets in.
  assert.deepEqual(await login(new TestCookieJar(), { email: fixture.email, password: fixture.password!, ip: testIp() }), { ok: true });
  // The account itself was not locked globally.
  const user = await prisma.usuario.findUniqueOrThrow({ where: { IdUsuario: fixture.userId } });
  assert.equal(user.DFechaBloqueoTemporal, null);
});

test("the per-IP lock also applies to unknown emails, so it does not reveal which accounts exist", async () => {
  const ip = testIp();
  const email = `nadie-${randomUUID()}@example.test`;
  for (let attempt = 0; attempt < MAX_LOGIN_FAILURES_PER_IP; attempt += 1) {
    assert.deepEqual(await login(new TestCookieJar(), { email, password: "x", ip }), { ok: false, reason: "INVALID_CREDENTIALS" });
  }
  assert.deepEqual(await login(new TestCookieJar(), { email, password: "x", ip }), { ok: false, reason: "ACCOUNT_BLOCKED" });
});

test("a user without any active organization cannot open a session", async () => {
  const fixture = await createAuthUserFixture();
  await prisma.miembroOrganizacion.updateMany({ where: { IdUsuario: fixture.userId }, data: { BActivo: false } });
  const jar = new TestCookieJar();
  assert.deepEqual(await login(jar, { email: fixture.email, password: fixture.password! }), {
    ok: false,
    reason: "ORGANIZATION_INACTIVE",
  });
  assert.equal(sessionCookie(jar), undefined);

  await prisma.miembroOrganizacion.updateMany({ where: { IdUsuario: fixture.userId }, data: { BActivo: true } });
  await prisma.organizacion.update({ where: { IdOrganizacion: fixture.organizationId }, data: { BActivo: false } });
  assert.deepEqual(await login(new TestCookieJar(), { email: fixture.email, password: fixture.password! }), {
    ok: false,
    reason: "ORGANIZATION_INACTIVE",
  });
});

test("login opens the user's team rather than their personal space", async () => {
  const fixture = await createAuthUserFixture();
  const [orgState, role] = await Promise.all([
    prisma.estadoOrganizacion.findUniqueOrThrow({ where: { SClave: "ACTIVA" } }),
    prisma.rol.findUniqueOrThrow({ where: { SClave: "VALUADOR" } }),
  ]);
  const suffix = randomUUID().slice(0, 8);
  const team = await prisma.organizacion.create({
    data: { IdEstadoOrganizacion: orgState.IdEstadoOrganizacion, SNombre: `Equipo ${suffix}`, SSlug: `equipo-${suffix}`, STipoAmbito: "TEAM" },
  });
  await prisma.miembroOrganizacion.create({ data: { IdOrganizacion: team.IdOrganizacion, IdUsuario: fixture.userId, IdRol: role.IdRol } });

  const jar = new TestCookieJar();
  assert.deepEqual(await login(jar, { email: fixture.email, password: fixture.password! }), { ok: true });
  const current = await withCookies(jar, () => getCurrentSession());
  assert.equal(current?.organizationId, team.IdOrganizacion);
  assert.equal(current?.user.role, "VALUADOR");
});

// ---------------------------------------------------------------- sessions

test("without a cookie, or with an unknown one, there is no session", async () => {
  assert.equal(await withCookies(new TestCookieJar(), () => getCurrentSession()), null);
  const jar = new TestCookieJar().set(AUTH_SESSION_COOKIE, createSecureToken());
  assert.equal(await withCookies(jar, () => getCurrentSession()), null);
});

test("the current session carries the user, organization, role and permissions, and records activity", async () => {
  const fixture = await createAuthUserFixture({ label: "perita" });
  const { jar, sessionId } = await openSession(fixture.userId, fixture.organizationId);
  await prisma.sesion.update({ where: { IdSesion: sessionId }, data: { DFechaUltimaActividad: new Date(Date.now() - HOUR) } });

  const current = await withCookies(jar, () => getCurrentSession());
  assert.ok(current);
  assert.equal(current.sessionId, sessionId);
  assert.equal(current.organizationId, fixture.organizationId);
  assert.equal(current.user.id, fixture.userId);
  assert.equal(current.user.email, fixture.email);
  assert.equal(current.user.name, "perita Prueba");
  assert.equal(current.user.role, "ADMINISTRADOR");
  assert.equal(current.user.emailVerified, true);
  assert.equal(current.user.organizationId, fixture.organizationId);
  assert.ok(current.user.permissions.includes("AVALUO_EDITAR"));
  assert.ok(current.user.permissions.includes("USUARIO_ADMINISTRAR"));

  const touched = await prisma.sesion.findUniqueOrThrow({ where: { IdSesion: sessionId } });
  assert.ok(touched.DFechaUltimaActividad && Date.now() - touched.DFechaUltimaActividad.getTime() < 60_000);
});

test("expired and revoked sessions are rejected", async () => {
  const fixture = await createAuthUserFixture();
  const expired = await openSession(fixture.userId, fixture.organizationId, {
    createdAt: new Date(Date.now() - 10 * HOUR),
    expiresAt: new Date(Date.now() - 1000),
  });
  assert.equal(await withCookies(expired.jar, () => getCurrentSession()), null);

  const revoked = await openSession(fixture.userId, fixture.organizationId);
  await prisma.sesion.update({ where: { IdSesion: revoked.sessionId }, data: { BRevocada: true, DFechaRevocacion: new Date() } });
  assert.equal(await withCookies(revoked.jar, () => getCurrentSession()), null);
});

test("a session stops working once the user, their organization or their membership is disabled", async () => {
  const cases: Array<[string, (fixture: Awaited<ReturnType<typeof createAuthUserFixture>>) => Promise<unknown>]> = [
    ["user deactivated", (f) => prisma.usuario.update({ where: { IdUsuario: f.userId }, data: { BActivo: false } })],
    ["user deleted", (f) => prisma.usuario.update({ where: { IdUsuario: f.userId }, data: { DFechaEliminacion: new Date() } })],
    [
      "user suspended",
      async (f) => {
        const state = await prisma.estadoUsuario.findUniqueOrThrow({ where: { SClave: "SUSPENDIDO" } });
        await prisma.usuario.update({ where: { IdUsuario: f.userId }, data: { IdEstadoUsuario: state.IdEstadoUsuario } });
      },
    ],
    ["organization deactivated", (f) => prisma.organizacion.update({ where: { IdOrganizacion: f.organizationId }, data: { BActivo: false } })],
    ["organization deleted", (f) => prisma.organizacion.update({ where: { IdOrganizacion: f.organizationId }, data: { DFechaEliminacion: new Date() } })],
    ["membership deactivated", (f) => prisma.miembroOrganizacion.updateMany({ where: { IdUsuario: f.userId }, data: { BActivo: false } })],
  ];

  for (const [label, disable] of cases) {
    const fixture = await createAuthUserFixture();
    const { jar } = await openSession(fixture.userId, fixture.organizationId);
    assert.ok(await withCookies(jar, () => getCurrentSession()), `${label}: session works before`);
    await disable(fixture);
    assert.equal(await withCookies(jar, () => getCurrentSession()), null, label);
  }
});

test("createSecureSession stores a fresh session and hands the browser its token", async () => {
  const fixture = await createAuthUserFixture();
  const jar = new TestCookieJar();
  const session = await withCookies(jar, () =>
    createSecureSession({ userId: fixture.userId, organizationId: fixture.organizationId, ip: "10.0.0.1", userAgent: "UA" }),
  );
  const token = sessionCookie(jar)!;
  assert.equal(session.STokenHash, hashToken(token));
  assert.equal(session.IdIdentidadUsuario, null);

  // A second login gets a different token; both sessions are valid on their own.
  const otherJar = new TestCookieJar();
  await withCookies(otherJar, () => createSecureSession({ userId: fixture.userId, organizationId: fixture.organizationId }));
  assert.notEqual(sessionCookie(otherJar), token);
  assert.ok(await withCookies(jar, () => getCurrentSession()));
  assert.ok(await withCookies(otherJar, () => getCurrentSession()));
});

test("a fresh session is not renewed", async () => {
  const fixture = await createAuthUserFixture();
  const { jar, sessionId } = await openSession(fixture.userId, fixture.organizationId);
  const current = (await withCookies(jar, () => getCurrentSession()))!;
  const cookieBefore = jar.values.get(AUTH_SESSION_COOKIE);

  const effective = await withCookies(jar, () => renewCurrentSession(current));
  assert.equal(effective.getTime(), current.expiresAt.getTime());
  const row = await prisma.sesion.findUniqueOrThrow({ where: { IdSesion: sessionId } });
  assert.equal(row.DFechaExpiracion.getTime(), current.expiresAt.getTime());
  assert.equal(row.DFechaRotacion, null);
  assert.equal(jar.values.get(AUTH_SESSION_COOKIE), cookieBefore);
});

test("a session close to expiring is extended in the database and in the cookie", async () => {
  const fixture = await createAuthUserFixture();
  const { jar, token, sessionId } = await openSession(fixture.userId, fixture.organizationId, {
    createdAt: new Date(Date.now() - 7 * HOUR),
    expiresAt: new Date(Date.now() + HOUR),
  });
  const current = (await withCookies(jar, () => getCurrentSession()))!;

  const before = Date.now();
  const renewed = await withCookies(jar, () => renewCurrentSession(current));
  const expected = before + SESSION_TTL_SECONDS * 1000;
  assert.ok(Math.abs(renewed.getTime() - expected) < 5_000, `renewed to ${renewed.toISOString()}`);

  const row = await prisma.sesion.findUniqueOrThrow({ where: { IdSesion: sessionId } });
  assert.equal(row.DFechaExpiracion.getTime(), renewed.getTime());
  assert.ok(row.DFechaRotacion);
  // Same token (no rotation of the secret), longer cookie.
  const cookie = jar.values.get(AUTH_SESSION_COOKIE)!;
  assert.equal(cookie.value, token);
  assert.ok(cookie.options.maxAge! > SESSION_TTL_SECONDS - 10 && cookie.options.maxAge! <= SESSION_TTL_SECONDS);
});

test("renewal stops at the absolute lifetime counted from login", async () => {
  const fixture = await createAuthUserFixture();
  const createdAt = new Date(Date.now() - SESSION_MAX_LIFETIME_SECONDS * 1000 + 2 * HOUR);
  const { jar, sessionId } = await openSession(fixture.userId, fixture.organizationId, {
    createdAt,
    expiresAt: new Date(Date.now() + HOUR),
  });
  const current = (await withCookies(jar, () => getCurrentSession()))!;
  const renewed = await withCookies(jar, () => renewCurrentSession(current));
  const hardLimit = createdAt.getTime() + SESSION_MAX_LIFETIME_SECONDS * 1000;
  assert.equal(renewed.getTime(), hardLimit);
  const row = await prisma.sesion.findUniqueOrThrow({ where: { IdSesion: sessionId } });
  assert.equal(row.DFechaExpiracion.getTime(), hardLimit);
});

test("a revoked session is not brought back by renewal", async () => {
  const fixture = await createAuthUserFixture();
  const { jar, sessionId } = await openSession(fixture.userId, fixture.organizationId, {
    createdAt: new Date(Date.now() - 7 * HOUR),
    expiresAt: new Date(Date.now() + HOUR),
  });
  const current = (await withCookies(jar, () => getCurrentSession()))!;
  await prisma.sesion.update({ where: { IdSesion: sessionId }, data: { BRevocada: true, DFechaRevocacion: new Date() } });
  await withCookies(jar, () => renewCurrentSession(current));
  const row = await prisma.sesion.findUniqueOrThrow({ where: { IdSesion: sessionId } });
  assert.equal(row.DFechaExpiracion.getTime(), current.expiresAt.getTime());
  assert.equal(await withCookies(jar, () => getCurrentSession()), null);
});

test("logout revokes only this browser's session and clears its cookie", async () => {
  const fixture = await createAuthUserFixture();
  const laptop = await openSession(fixture.userId, fixture.organizationId);
  const phone = await openSession(fixture.userId, fixture.organizationId);

  await withCookies(laptop.jar, () => revokeCurrentSession());
  assert.equal(sessionCookie(laptop.jar), undefined);
  const row = await prisma.sesion.findUniqueOrThrow({ where: { IdSesion: laptop.sessionId } });
  assert.equal(row.BRevocada, true);
  assert.ok(row.DFechaRevocacion);

  // Replaying the old cookie does not work.
  const replay = new TestCookieJar().set(AUTH_SESSION_COOKIE, laptop.token);
  assert.equal(await withCookies(replay, () => getCurrentSession()), null);
  // The phone is still logged in.
  assert.ok(await withCookies(phone.jar, () => getCurrentSession()));

  // Logging out without a cookie is harmless.
  await withCookies(new TestCookieJar(), () => revokeCurrentSession());
});

test("revoking all of a user's sessions logs them out everywhere, without touching other users", async () => {
  const fixture = await createAuthUserFixture();
  const other = await createAuthUserFixture();
  const first = await openSession(fixture.userId, fixture.organizationId);
  const second = await openSession(fixture.userId, fixture.organizationId);
  const othersSession = await openSession(other.userId, other.organizationId);

  const result = await revokeUserSessions(fixture.userId);
  assert.equal(result.count, 2);
  assert.equal(await withCookies(first.jar, () => getCurrentSession()), null);
  assert.equal(await withCookies(second.jar, () => getCurrentSession()), null);
  assert.ok(await withCookies(othersSession.jar, () => getCurrentSession()));
});
