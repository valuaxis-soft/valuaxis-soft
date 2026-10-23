import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTeamInvitationEmailHtml, buildTeamInvitationEmailText } from "../src/features/notifications/templates/team-invitation";
import { Prisma } from "@prisma/client";
import { acceptInvitationSchema, inviteMemberSchema, teamSettingsSchema } from "../src/features/team/team-schemas";
import { TeamError, teamSettingsError } from "../src/features/team/team.service";
import { INVITATION_TTL_DAYS, invitationExpiration, invitationState, memberChangeBlock, normalizeEmail } from "../src/features/team/team-rules";

const now = new Date("2026-09-28T12:00:00Z");
const pending = { DFechaAceptacion: null, DFechaRevocacion: null, DFechaExpiracion: new Date("2026-10-01T00:00:00Z") };

test("an invitation is pending until it is accepted, cancelled or expires", () => {
  assert.equal(invitationState(pending, now), "pendiente");
  assert.equal(invitationState({ ...pending, DFechaExpiracion: now }, now), "vencida");
  assert.equal(invitationState({ ...pending, DFechaRevocacion: now }, now), "cancelada");
  assert.equal(invitationState({ ...pending, DFechaAceptacion: now, DFechaExpiracion: new Date(0) }, now), "aceptada");
});

test("invitations last seven days", () => {
  assert.equal(invitationExpiration(now).getTime() - now.getTime(), INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
});

test("emails are compared trimmed and lowercased", () => {
  assert.equal(normalizeEmail("  Perito@Despacho.MX "), "perito@despacho.mx");
  const parsed = inviteMemberSchema.parse({ email: " Perito@Despacho.MX ", role: "VALUADOR" });
  assert.equal(parsed.email, "perito@despacho.mx");
  assert.equal(inviteMemberSchema.safeParse({ email: "no-es-correo", role: "VALUADOR" }).success, false);
  assert.equal(inviteMemberSchema.safeParse({ email: "a@b.mx", role: "SUPERADMIN" }).success, false);
});

test("an invitation is accepted by its link token or, from the dashboard, by its id", () => {
  assert.equal(acceptInvitationSchema.safeParse({ token: "x".repeat(43) }).success, true);
  assert.equal(acceptInvitationSchema.safeParse({ id: "7c9e6679-7425-40de-944b-e07fc1f90ae7" }).success, true);
  assert.equal(acceptInvitationSchema.safeParse({ token: "corto" }).success, false);
  assert.equal(acceptInvitationSchema.safeParse({}).success, false);
});

test("an administrator cannot change themselves, the owner, or the last administrator", () => {
  const base = { actorUserId: 1, targetUserId: 2, ownerUserId: 3, targetRole: "VALUADOR", nextRole: "REVISOR", activeAdministrators: 1 };
  assert.equal(memberChangeBlock(base), null);
  assert.match(memberChangeBlock({ ...base, targetUserId: 1 }) ?? "", /propio acceso/);
  assert.match(memberChangeBlock({ ...base, targetUserId: 3 }) ?? "", /propietario/);
  assert.match(memberChangeBlock({ ...base, targetRole: "ADMINISTRADOR", nextRole: null }) ?? "", /al menos un administrador/);
  assert.equal(memberChangeBlock({ ...base, targetRole: "ADMINISTRADOR", nextRole: null, activeAdministrators: 2 }), null);
  assert.equal(memberChangeBlock({ ...base, targetRole: "ADMINISTRADOR", nextRole: "ADMINISTRADOR" }), null);
});

test("the invitation email names the team, the role and the link, with the names escaped", () => {
  const content = {
    organizationName: "Valuadores <de los Altos>",
    inviterName: "Álvaro",
    roleLabel: "Valuador",
    inviteUrl: "https://valuaxissoft.com/organizacion/invitaciones/abc",
    expiresAt: new Date("2026-10-05T18:00:00Z"),
  };
  const html = buildTeamInvitationEmailHtml(content);
  assert.match(html, /Valuadores &lt;de los Altos&gt;/);
  assert.match(html, /href="https:\/\/valuaxissoft\.com\/organizacion\/invitaciones\/abc"/);
  const text = buildTeamInvitationEmailText(content);
  assert.match(text, /Álvaro te invitó a trabajar en Valuadores <de los Altos> en Valuaxis con el rol de Valuador/);
  assert.match(text, /5 de octubre de 2026/);
});

test("the team's name is one line of 2 to 180 characters, with a message in Spanish when it is not", () => {
  assert.equal(teamSettingsSchema.parse({ name: "  Espacio personal de Alvaro " }).name, "Espacio personal de Alvaro");
  assert.equal(teamSettingsSchema.parse({ name: "Valuadores\n de los\tAltos" }).name, "Valuadores de los Altos");
  const messageOf = (name: unknown) => {
    const parsed = teamSettingsSchema.safeParse({ name });
    return parsed.success ? null : parsed.error.issues[0]?.message;
  };
  assert.match(messageOf(" a ") ?? "", /al menos 2 letras/);
  assert.match(messageOf("x".repeat(181)) ?? "", /hasta 180 caracteres/);
  assert.match(messageOf("Despacho\u0007") ?? "", /caracteres que no se pueden guardar/);
  assert.match(messageOf(null) ?? "", /Escribe el nombre/);
});

test("a database refusal of the team's name becomes a message the administrator can act on", () => {
  const known = (code: string) => new Prisma.PrismaClientKnownRequestError("refused", { code, clientVersion: "6" });
  const tooLong = teamSettingsError(known("P2000"));
  assert.ok(tooLong instanceof TeamError);
  assert.equal(tooLong.status, 400);
  const taken = teamSettingsError(known("P2002"));
  assert.ok(taken instanceof TeamError && /otro despacho/.test(taken.message));

  const check = new Prisma.PrismaClientUnknownRequestError(
    'new row for relation "devpware_organizaciones" violates check constraint "devpware_organizaciones_tipo_ambito_check"',
    { clientVersion: "6" },
  );
  const refused = teamSettingsError(check);
  assert.ok(refused instanceof TeamError);
  assert.equal(refused.status, 409);
  assert.match(refused.message, /devpware_organizaciones_tipo_ambito_check/);

  // Anything else stays an internal error for the route to log.
  const other = new Error("connection reset");
  assert.equal(teamSettingsError(other), other);
});
