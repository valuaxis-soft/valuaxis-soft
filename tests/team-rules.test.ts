import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTeamInvitationEmailHtml, buildTeamInvitationEmailText } from "../src/features/notifications/templates/team-invitation";
import { acceptInvitationSchema, inviteMemberSchema } from "../src/features/team/team-schemas";
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
