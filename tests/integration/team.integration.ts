import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import type { AuthUser } from "../../src/features/auth/model";
import { resolveActiveOrganization, resolveDefaultOrganization } from "../../src/features/auth/services/organization-access.service";
import { findValuation } from "../../src/features/valuations/calculation/access";
import {
  TeamError,
  acceptInvitation,
  changeMemberRole,
  getTeam,
  inviteMember,
  listMyInvitations,
  removeMember,
  resendInvitation,
  saveTeamSettings,
} from "../../src/features/team/team.service";
import { createSecureToken, hashToken } from "../../src/security/tokens/token-hashing";
import { assertLocalDatabase, createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Person = { user: AuthUser; sessionId: number };

let admin: AuthUser;
let valuationId: string;
let teamId: number;

/** A verified user with a personal space and a session in it. */
async function createPerson(label: string): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const [userState, orgState, adminRole] = await Promise.all([
    prisma.estadoUsuario.findUniqueOrThrow({ where: { SClave: "ACTIVO" } }),
    prisma.estadoOrganizacion.findUniqueOrThrow({ where: { SClave: "ACTIVA" } }),
    prisma.rol.findUniqueOrThrow({ where: { SClave: "ADMINISTRADOR" } }),
  ]);
  const usuario = await prisma.usuario.create({
    data: {
      IdEstadoUsuario: userState.IdEstadoUsuario,
      SNombre: label,
      SCorreo: `${label.toLowerCase()}-${suffix}@example.test`,
      BCorreoVerificado: true,
      DFechaVerificacionCorreo: new Date(),
      DFechaModificacion: new Date(),
    },
  });
  const organization = await prisma.organizacion.create({
    data: {
      IdEstadoOrganizacion: orgState.IdEstadoOrganizacion,
      IdUsuarioPropietario: usuario.IdUsuario,
      SNombre: `Espacio de ${label} ${suffix}`,
      SSlug: `espacio-${suffix}`,
      STipoAmbito: "PERSONAL",
      DFechaModificacion: new Date(),
    },
  });
  await prisma.miembroOrganizacion.create({
    data: { IdOrganizacion: organization.IdOrganizacion, IdUsuario: usuario.IdUsuario, IdRol: adminRole.IdRol, DFechaModificacion: new Date() },
  });
  const session = await prisma.sesion.create({
    data: {
      IdUsuario: usuario.IdUsuario,
      IdOrganizacion: organization.IdOrganizacion,
      STokenHash: hashToken(createSecureToken()),
      DFechaExpiracion: new Date(Date.now() + 60 * 60 * 1000),
      DFechaUltimaActividad: new Date(),
    },
  });
  return {
    sessionId: session.IdSesion,
    user: {
      id: usuario.IdUsuario,
      name: label,
      email: usuario.SCorreo,
      role: "ADMINISTRADOR",
      permissions: [],
      active: true,
      organizationId: organization.IdOrganizacion,
      organizationName: organization.SNombre,
    },
  };
}

const tokenOf = (inviteUrl: string) => decodeURIComponent(inviteUrl.split("/organizacion/invitaciones/")[1]);
const sessionOrganization = async (sessionId: number) =>
  (await prisma.sesion.findUniqueOrThrow({ where: { IdSesion: sessionId } })).IdOrganizacion;

async function rejects(promise: Promise<unknown>, status: number, message?: RegExp) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof TeamError, `expected TeamError, got ${String(error)}`);
    assert.equal(error.status, status);
    if (message) assert.match(error.message, message);
    return true;
  });
}

before(async () => {
  assertLocalDatabase();
  // The firm's owner: a personal space with a valuation, like Álvaro's today.
  const fixture = await createValuationFixture();
  const adminRole = await prisma.rol.findUniqueOrThrow({ where: { SClave: "ADMINISTRADOR" } });
  await prisma.organizacion.update({ where: { IdOrganizacion: fixture.organizationId }, data: { IdUsuarioPropietario: fixture.user.id } });
  await prisma.miembroOrganizacion.create({
    data: { IdOrganizacion: fixture.organizationId, IdUsuario: fixture.user.id, IdRol: adminRole.IdRol, DFechaModificacion: new Date() },
  });
  admin = fixture.user;
  valuationId = fixture.publicId;
  teamId = fixture.organizationId;
});

test("a personal space must become a team before inviting, and keeps its valuations", async () => {
  await rejects(inviteMember(admin, { email: "alguien@example.test", role: "VALUADOR" }), 409, /convierte tu espacio/);
  await saveTeamSettings(admin, { name: "Valuadores de Prueba" });
  const team = await getTeam(admin);
  assert.equal(team.organization.isTeam, true);
  assert.equal(team.organization.name, "Valuadores de Prueba");
  assert.equal(team.members.length, 1);
  assert.equal(team.members[0].isOwner, true);
  assert.equal(team.members[0].isYou, true);
  assert.ok(await findValuation(prisma, valuationId, teamId));
});

test("an invited person joins with the role, sees the team's valuations and lands in the team", async () => {
  const perito = await createPerson("Perito");
  const other = await createPerson("Otro");
  const sent = await inviteMember(admin, { email: perito.user.email.toUpperCase(), role: "VALUADOR" });
  assert.equal(sent.email, perito.user.email);
  assert.equal(sent.emailSent, true);

  assert.deepEqual((await listMyInvitations(perito.user)).map((row) => row.organizationName), ["Valuadores de Prueba"]);
  assert.equal((await getTeam(admin)).invitations.length, 1);

  const token = tokenOf(sent.inviteUrl);
  await rejects(acceptInvitation(other.user, other.sessionId, { token }), 403, new RegExp(perito.user.email));

  const accepted = await acceptInvitation(perito.user, perito.sessionId, { token });
  assert.equal(accepted.organizationName, "Valuadores de Prueba");
  assert.equal(await sessionOrganization(perito.sessionId), teamId);

  const access = await resolveActiveOrganization(perito.user.id, teamId);
  assert.equal(access?.role, "VALUADOR");
  assert.ok(access?.permissions.includes("AVALUO_EDITAR"));
  assert.ok(await findValuation(prisma, valuationId, teamId));
  // The next login opens the team, not the empty personal space.
  assert.equal((await resolveDefaultOrganization(perito.user.id))?.organizationId, teamId);

  // Clicking the link again just opens the team.
  await acceptInvitation(perito.user, perito.sessionId, { token });
  assert.equal((await getTeam(admin)).invitations.length, 0);
  assert.equal((await listMyInvitations(perito.user)).length, 0);
  await rejects(inviteMember(admin, { email: perito.user.email, role: "REVISOR" }), 409, /ya es parte/);

  const member = (await getTeam(admin)).members.find((row) => row.email === perito.user.email);
  assert.ok(member);
  await changeMemberRole(admin, member.id, "CONSULTA");
  assert.equal((await resolveActiveOrganization(perito.user.id, teamId))?.role, "CONSULTA");

  await removeMember(admin, member.id);
  assert.equal(await resolveActiveOrganization(perito.user.id, teamId), null);
  await rejects(acceptInvitation(perito.user, perito.sessionId, { token }), 410, /Ya no formas parte/);
});

test("resending replaces the link and an accepted invitation from the dashboard works by id", async () => {
  const revisor = await createPerson("Revisor");
  const first = await inviteMember(admin, { email: revisor.user.email, role: "REVISOR" });
  const second = await resendInvitation(admin, first.id);
  assert.notEqual(second.inviteUrl, first.inviteUrl);
  await rejects(acceptInvitation(revisor.user, revisor.sessionId, { token: tokenOf(first.inviteUrl) }), 410, /cancelada/);

  const [pending] = await listMyInvitations(revisor.user);
  assert.equal(pending.id, second.id);
  await acceptInvitation(revisor.user, revisor.sessionId, { id: pending.id });
  assert.equal((await resolveActiveOrganization(revisor.user.id, teamId))?.role, "REVISOR");
});

test("an administrator cannot remove themselves, the owner or the last administrator", async () => {
  const team = await getTeam(admin);
  const self = team.members.find((row) => row.isYou);
  assert.ok(self);
  await rejects(removeMember(admin, self.id), 409, /propio acceso/);

  const helper = await createPerson("Socio");
  const sent = await inviteMember(admin, { email: helper.user.email, role: "ADMINISTRADOR" });
  await acceptInvitation(helper.user, helper.sessionId, { token: tokenOf(sent.inviteUrl) });
  const helperAdmin: AuthUser = { ...helper.user, organizationId: teamId };
  await rejects(removeMember(helperAdmin, self.id), 409, /propietario/);
});

test("expired invitations cannot be accepted", async () => {
  const late = await createPerson("Tarde");
  const sent = await inviteMember(admin, { email: late.user.email, role: "VALUADOR" });
  await prisma.invitacionOrganizacion.update({
    where: { UIdentificadorPublico: sent.id },
    data: { DFechaCreacion: new Date(Date.now() - 9 * 86_400_000), DFechaExpiracion: new Date(Date.now() - 86_400_000) },
  });
  await rejects(acceptInvitation(late.user, late.sessionId, { token: tokenOf(sent.inviteUrl) }), 410, /venció/);
  assert.equal((await listMyInvitations(late.user)).length, 0);
  assert.equal((await getTeam(admin)).invitations.find((row) => row.id === sent.id)?.expired, true);
});

test("an invitation lapses when its inviter stops administering the team", async () => {
  const helper = await createPerson("Coadmin");
  const invited = await createPerson("Invitado");
  const sent = await inviteMember(admin, { email: helper.user.email, role: "ADMINISTRADOR" });
  await acceptInvitation(helper.user, helper.sessionId, { token: tokenOf(sent.inviteUrl) });
  const helperAdmin: AuthUser = { ...helper.user, organizationId: teamId };

  const pending = await inviteMember(helperAdmin, { email: invited.user.email, role: "ADMINISTRADOR" });
  const member = (await getTeam(admin)).members.find((row) => row.email === helper.user.email)!;
  await removeMember(admin, member.id);

  // Their pending invitation was cancelled, and their session moved to their own space.
  await rejects(acceptInvitation(invited.user, invited.sessionId, { token: tokenOf(pending.inviteUrl) }), 410);
  assert.notEqual(await sessionOrganization(helper.sessionId), teamId);
  assert.equal((await prisma.sesion.findUniqueOrThrow({ where: { IdSesion: helper.sessionId } })).BRevocada, false);
});

test("two invitations to the same email at once never fail with a server error", async () => {
  const twin = await createPerson("Gemelo");
  const results = await Promise.allSettled([
    inviteMember(admin, { email: twin.user.email, role: "VALUADOR" }),
    inviteMember(admin, { email: twin.user.email, role: "VALUADOR" }),
  ]);
  for (const result of results) {
    if (result.status === "rejected") {
      assert.ok(result.reason instanceof TeamError && result.reason.status === 409, String(result.reason));
    }
  }
  assert.equal((await getTeam(admin)).invitations.filter((row) => row.email === twin.user.email).length, 1);
});
