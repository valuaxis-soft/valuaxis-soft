import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { AUTH_SESSION_COOKIE } from "../../src/features/auth/constants/auth.constants";
import { buildAuthorizationContext } from "../../src/features/auth/services/authorization-context.service";
import {
  changeActiveOrganization,
  listAvailableOrganizations,
  resolveActiveOrganization,
  resolveDefaultOrganization,
} from "../../src/features/auth/services/organization-access.service";
import { getCurrentSession } from "../../src/features/auth/services/session.service";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { TestCookieJar, assertLocalDatabase, createAuthUserFixture, prisma, withCookies } from "./support";

const created = { roles: [] as number[], permissions: [] as number[] };

after(async () => {
  // Test-only catalog rows must not linger in role pickers.
  await prisma.miembroOrganizacion.deleteMany({ where: { IdRol: { in: created.roles } } });
  await prisma.permisoRol.deleteMany({ where: { IdRol: { in: created.roles } } });
  await prisma.rol.deleteMany({ where: { IdRol: { in: created.roles } } });
  await prisma.permiso.deleteMany({ where: { IdPermiso: { in: created.permissions } } });
  await prisma.$disconnect();
});
before(() => assertLocalDatabase());

async function rolePermissions(roleKey: string) {
  const role = await prisma.rol.findUniqueOrThrow({
    where: { SClave: roleKey },
    include: { permisos: { include: { permiso: true } } },
  });
  return role.permisos.filter((link) => link.permiso.BActivo).map((link) => link.permiso.SClave).sort();
}

/** A team organization where `userId` has `roleKey`. */
async function joinTeam(userId: number, roleKey: string, options: { active?: boolean } = {}) {
  const [orgState, role] = await Promise.all([
    prisma.estadoOrganizacion.findUniqueOrThrow({ where: { SClave: "ACTIVA" } }),
    prisma.rol.findUniqueOrThrow({ where: { SClave: roleKey } }),
  ]);
  const suffix = randomUUID().slice(0, 8);
  const team = await prisma.organizacion.create({
    data: { IdEstadoOrganizacion: orgState.IdEstadoOrganizacion, SNombre: `Despacho ${suffix}`, SSlug: `despacho-${suffix}`, STipoAmbito: "TEAM" },
  });
  await prisma.miembroOrganizacion.create({
    data: { IdOrganizacion: team.IdOrganizacion, IdUsuario: userId, IdRol: role.IdRol, BActivo: options.active ?? true },
  });
  return team;
}

async function openSession(userId: number, organizationId: number, expiresAt = new Date(Date.now() + 60 * 60_000)) {
  const token = createSecureToken();
  const session = await prisma.sesion.create({
    data: { IdUsuario: userId, IdOrganizacion: organizationId, STokenHash: hashToken(token), DFechaExpiracion: expiresAt },
  });
  return { sessionId: session.IdSesion, jar: new TestCookieJar().set(AUTH_SESSION_COOKIE, token) };
}

test("the authorization context holds the role and permissions of the user in that organization", async () => {
  const fixture = await createAuthUserFixture();
  const team = await joinTeam(fixture.userId, "CONSULTA");

  const personal = await buildAuthorizationContext(fixture.userId, fixture.organizationId);
  assert.ok(personal);
  assert.equal(personal.userId, fixture.userId);
  assert.equal(personal.organizationId, fixture.organizationId);
  assert.equal(personal.role, "ADMINISTRADOR");
  assert.deepEqual([...personal.permissions].sort(), await rolePermissions("ADMINISTRADOR"));

  // Same user, other organization: only what the CONSULTA role grants there.
  const inTeam = await buildAuthorizationContext(fixture.userId, team.IdOrganizacion);
  assert.ok(inTeam);
  assert.equal(inTeam.organizationId, team.IdOrganizacion);
  assert.equal(inTeam.role, "CONSULTA");
  assert.deepEqual([...inTeam.permissions].sort(), await rolePermissions("CONSULTA"));
  assert.equal(inTeam.permissions.has("AVALUO_VER"), true);
  assert.equal(inTeam.permissions.has("AVALUO_EDITAR"), false);
  assert.equal(inTeam.permissions.has("USUARIO_ADMINISTRAR"), false);
});

test("there is no authorization context in an organization the user does not belong to", async () => {
  const alice = await createAuthUserFixture({ label: "alicia" });
  const bob = await createAuthUserFixture({ label: "beto" });
  assert.equal(await buildAuthorizationContext(alice.userId, bob.organizationId), null);
  assert.equal(await buildAuthorizationContext(alice.userId, 2_000_000_000), null);
  assert.equal(await resolveActiveOrganization(alice.userId, bob.organizationId), null);
});

test("an inactive membership, or an inactive or deleted organization, loses access", async () => {
  const fixture = await createAuthUserFixture();
  const suspendedTeam = await joinTeam(fixture.userId, "VALUADOR", { active: false });
  assert.equal(await buildAuthorizationContext(fixture.userId, suspendedTeam.IdOrganizacion), null);

  const closedTeam = await joinTeam(fixture.userId, "VALUADOR");
  assert.ok(await buildAuthorizationContext(fixture.userId, closedTeam.IdOrganizacion));
  await prisma.organizacion.update({ where: { IdOrganizacion: closedTeam.IdOrganizacion }, data: { BActivo: false } });
  assert.equal(await buildAuthorizationContext(fixture.userId, closedTeam.IdOrganizacion), null);

  const deletedTeam = await joinTeam(fixture.userId, "VALUADOR");
  await prisma.organizacion.update({ where: { IdOrganizacion: deletedTeam.IdOrganizacion }, data: { DFechaEliminacion: new Date() } });
  assert.equal(await buildAuthorizationContext(fixture.userId, deletedTeam.IdOrganizacion), null);

  // The personal space is unaffected.
  assert.ok(await buildAuthorizationContext(fixture.userId, fixture.organizationId));
});

test("disabled permissions are not granted", async () => {
  const fixture = await createAuthUserFixture();
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const [enabled, disabled] = await Promise.all([
    prisma.permiso.create({ data: { SClave: `TEST_ON_${suffix}`, SNombre: "Prueba activa", BActivo: true } }),
    prisma.permiso.create({ data: { SClave: `TEST_OFF_${suffix}`, SNombre: "Prueba inactiva", BActivo: false } }),
  ]);
  created.permissions.push(enabled.IdPermiso, disabled.IdPermiso);
  const role = await prisma.rol.create({ data: { SClave: `TEST_ROL_${suffix}`, SNombre: `Rol de prueba ${suffix}` } });
  created.roles.push(role.IdRol);
  await prisma.permisoRol.createMany({
    data: [
      { IdRol: role.IdRol, IdPermiso: enabled.IdPermiso },
      { IdRol: role.IdRol, IdPermiso: disabled.IdPermiso },
    ],
  });
  await prisma.miembroOrganizacion.updateMany({ where: { IdUsuario: fixture.userId }, data: { IdRol: role.IdRol } });

  const context = await buildAuthorizationContext(fixture.userId, fixture.organizationId);
  assert.deepEqual([...context!.permissions], [enabled.SClave]);
});

test("the context reflects the organization's current subscription and its plan features", async () => {
  const fixture = await createAuthUserFixture();
  const [draftPlan, proPlan, activeState, cancelledState] = await Promise.all([
    prisma.plan.findUniqueOrThrow({ where: { SClave: "BORRADOR" }, include: { funcionalidades: { include: { funcionalidad: true } } } }),
    prisma.plan.findUniqueOrThrow({ where: { SClave: "PROFESIONAL" }, include: { funcionalidades: { include: { funcionalidad: true } } } }),
    prisma.estadoSuscripcion.findUniqueOrThrow({ where: { SClave: "ACTIVA" } }),
    prisma.estadoSuscripcion.findUniqueOrThrow({ where: { SClave: "CANCELADA" } }),
  ]);

  // Every new organization starts on the free draft plan (database trigger).
  const initial = await buildAuthorizationContext(fixture.userId, fixture.organizationId);
  assert.deepEqual(initial!.subscription, { status: "BORRADOR", plan: "BORRADOR" });
  assert.equal(initial!.features.size, draftPlan.funcionalidades.length);

  // Upgrade: the draft ends and a paid subscription starts. A later, already finished one must not win.
  await prisma.suscripcion.updateMany({
    where: { IdOrganizacion: fixture.organizationId, DFechaFinalizacion: null },
    data: { DFechaFinalizacion: new Date() },
  });
  const day = 24 * 60 * 60_000;
  await prisma.suscripcion.createMany({
    data: [
      { IdOrganizacion: fixture.organizationId, IdPlan: proPlan.IdPlan, IdEstadoSuscripcion: activeState.IdEstadoSuscripcion, DFechaInicio: new Date(Date.now() - day) },
      {
        IdOrganizacion: fixture.organizationId,
        IdPlan: draftPlan.IdPlan,
        IdEstadoSuscripcion: cancelledState.IdEstadoSuscripcion,
        DFechaInicio: new Date(),
        DFechaFinalizacion: new Date(),
      },
    ],
  });

  const context = await buildAuthorizationContext(fixture.userId, fixture.organizationId);
  assert.deepEqual(context!.subscription, { status: "ACTIVA", plan: "PROFESIONAL" });
  assert.equal(context!.features.size, proPlan.funcionalidades.length);
  for (const link of proPlan.funcionalidades) {
    assert.deepEqual(context!.features.get(link.funcionalidad.SClave), {
      key: link.funcionalidad.SClave,
      included: link.BIncluida,
      unlimited: link.BSinLimite,
      limit: link.ILimiteIncluido,
      period: link.SPeriodoLimite,
    });
  }

  // Another organization's subscription never leaks into this one.
  const other = await createAuthUserFixture();
  const otherContext = await buildAuthorizationContext(other.userId, other.organizationId);
  assert.deepEqual(otherContext!.subscription, { status: "BORRADOR", plan: "BORRADOR" });
});

test("the default organization is the first active team, else the personal space", async () => {
  const fixture = await createAuthUserFixture();
  assert.equal((await resolveDefaultOrganization(fixture.userId))?.organizationId, fixture.organizationId);

  await joinTeam(fixture.userId, "REVISOR", { active: false });
  assert.equal((await resolveDefaultOrganization(fixture.userId))?.organizationId, fixture.organizationId);

  const team = await joinTeam(fixture.userId, "REVISOR");
  await joinTeam(fixture.userId, "VALUADOR");
  const resolved = await resolveDefaultOrganization(fixture.userId);
  assert.equal(resolved?.organizationId, team.IdOrganizacion);
  assert.equal(resolved?.role, "REVISOR");
  assert.equal(resolved?.organizationName, team.SNombre);

  await prisma.miembroOrganizacion.updateMany({ where: { IdUsuario: fixture.userId }, data: { BActivo: false } });
  assert.equal(await resolveDefaultOrganization(fixture.userId), null);
});

test("the organization switcher lists only active memberships and marks the active one", async () => {
  const fixture = await createAuthUserFixture();
  const team = await joinTeam(fixture.userId, "VALUADOR");
  const inactive = await joinTeam(fixture.userId, "VALUADOR", { active: false });

  const list = await listAvailableOrganizations(fixture.userId, team.IdOrganizacion);
  assert.deepEqual(
    list.map((item) => [item.IdOrganizacion, item.rol, item.STipoAmbito, item.BEsAmbitoActivo]),
    [
      [fixture.organizationId, "ADMINISTRADOR", "PERSONAL", false],
      [team.IdOrganizacion, "VALUADOR", "TEAM", true],
    ],
  );
  assert.ok(!list.some((item) => item.IdOrganizacion === inactive.IdOrganizacion));
});

test("switching organization moves the session and its permissions to the new scope", async () => {
  const fixture = await createAuthUserFixture();
  const team = await joinTeam(fixture.userId, "CONSULTA");
  const { sessionId, jar } = await openSession(fixture.userId, fixture.organizationId);

  const result = await changeActiveOrganization({ sessionId, userId: fixture.userId, organizationId: team.IdOrganizacion });
  assert.ok(result.ok);
  assert.equal(result.organization.IdOrganizacion, team.IdOrganizacion);
  assert.equal(result.organization.rol, "CONSULTA");
  assert.equal(result.organization.BEsAmbitoActivo, true);

  const current = await withCookies(jar, () => getCurrentSession());
  assert.equal(current?.organizationId, team.IdOrganizacion);
  assert.equal(current?.user.role, "CONSULTA");
  assert.equal(current?.user.permissions.includes("AVALUO_EDITAR"), false);

  // Back to the personal space, this time by public id.
  const personal = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: fixture.organizationId } });
  const back = await changeActiveOrganization({ sessionId, userId: fixture.userId, organizationPublicId: personal.UIdentificadorPublico });
  assert.ok(back.ok);
  const again = await withCookies(jar, () => getCurrentSession());
  assert.equal(again?.organizationId, fixture.organizationId);
  assert.equal(again?.user.role, "ADMINISTRADOR");
});

test("a user cannot switch into an organization they do not belong to, or no longer belong to", async () => {
  const fixture = await createAuthUserFixture();
  const stranger = await createAuthUserFixture();
  const formerTeam = await joinTeam(fixture.userId, "VALUADOR", { active: false });
  const { sessionId } = await openSession(fixture.userId, fixture.organizationId);

  for (const organizationId of [stranger.organizationId, formerTeam.IdOrganizacion]) {
    assert.deepEqual(await changeActiveOrganization({ sessionId, userId: fixture.userId, organizationId }), {
      ok: false,
      reason: "ORGANIZATION_ACCESS_DENIED",
    });
  }
  const strangerOrg = await prisma.organizacion.findUniqueOrThrow({ where: { IdOrganizacion: stranger.organizationId } });
  assert.deepEqual(
    await changeActiveOrganization({ sessionId, userId: fixture.userId, organizationPublicId: strangerOrg.UIdentificadorPublico }),
    { ok: false, reason: "ORGANIZATION_ACCESS_DENIED" },
  );
  assert.deepEqual(await changeActiveOrganization({ sessionId, userId: fixture.userId }), { ok: false, reason: "INVALID_ORGANIZATION" });

  const session = await prisma.sesion.findUniqueOrThrow({ where: { IdSesion: sessionId } });
  assert.equal(session.IdOrganizacion, fixture.organizationId);
});

test("switching organization only works on the user's own live session", async () => {
  const fixture = await createAuthUserFixture();
  const team = await joinTeam(fixture.userId, "VALUADOR");
  const other = await createAuthUserFixture();
  const othersSession = await openSession(other.userId, other.organizationId);

  // Someone else's session id, with a membership the caller does hold.
  assert.deepEqual(
    await changeActiveOrganization({ sessionId: othersSession.sessionId, userId: fixture.userId, organizationId: team.IdOrganizacion }),
    { ok: false, reason: "SESSION_INVALID" },
  );
  const untouched = await prisma.sesion.findUniqueOrThrow({ where: { IdSesion: othersSession.sessionId } });
  assert.equal(untouched.IdOrganizacion, other.organizationId);

  const revoked = await openSession(fixture.userId, fixture.organizationId);
  await prisma.sesion.update({ where: { IdSesion: revoked.sessionId }, data: { BRevocada: true, DFechaRevocacion: new Date() } });
  assert.deepEqual(
    await changeActiveOrganization({ sessionId: revoked.sessionId, userId: fixture.userId, organizationId: team.IdOrganizacion }),
    { ok: false, reason: "SESSION_INVALID" },
  );

  const expired = await prisma.sesion.create({
    data: {
      IdUsuario: fixture.userId,
      IdOrganizacion: fixture.organizationId,
      STokenHash: hashToken(createSecureToken()),
      DFechaCreacion: new Date(Date.now() - 10 * 60 * 60_000),
      DFechaExpiracion: new Date(Date.now() - 1000),
    },
  });
  assert.deepEqual(
    await changeActiveOrganization({ sessionId: expired.IdSesion, userId: fixture.userId, organizationId: team.IdOrganizacion }),
    { ok: false, reason: "SESSION_INVALID" },
  );
});

test("losing a membership ends the session scoped to that organization", async () => {
  const fixture = await createAuthUserFixture();
  const team = await joinTeam(fixture.userId, "VALUADOR");
  const { jar } = await openSession(fixture.userId, team.IdOrganizacion);
  assert.equal((await withCookies(jar, () => getCurrentSession()))?.user.role, "VALUADOR");

  await prisma.miembroOrganizacion.updateMany({
    where: { IdUsuario: fixture.userId, IdOrganizacion: team.IdOrganizacion },
    data: { BActivo: false },
  });
  assert.equal(await withCookies(jar, () => getCurrentSession()), null);
  assert.equal(await buildAuthorizationContext(fixture.userId, team.IdOrganizacion), null);
});

test("a role change in the organization takes effect on the next request", async () => {
  const fixture = await createAuthUserFixture();
  const team = await joinTeam(fixture.userId, "ADMINISTRADOR");
  const { jar } = await openSession(fixture.userId, team.IdOrganizacion);
  assert.ok((await withCookies(jar, () => getCurrentSession()))?.user.permissions.includes("USUARIO_ADMINISTRAR"));

  const consulta = await prisma.rol.findUniqueOrThrow({ where: { SClave: "CONSULTA" } });
  await prisma.miembroOrganizacion.updateMany({
    where: { IdUsuario: fixture.userId, IdOrganizacion: team.IdOrganizacion },
    data: { IdRol: consulta.IdRol },
  });
  const current = await withCookies(jar, () => getCurrentSession());
  assert.equal(current?.user.role, "CONSULTA");
  assert.equal(current?.user.permissions.includes("USUARIO_ADMINISTRAR"), false);
});
