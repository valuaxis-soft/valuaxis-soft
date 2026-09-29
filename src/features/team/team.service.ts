/**
 * Teams: an organization of type TEAM whose members share its valuations.
 * Administrators invite by email with a role; the invited person accepts with
 * an account of that same email, from the email link or from their dashboard.
 * Only the token's hash is stored.
 */
import { Prisma } from "@prisma/client";

import type { AuthUser } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { updateSessionOrganization } from "@/features/auth/repositories/session.repository";
import { resolveDefaultOrganization } from "@/features/auth/services/organization-access.service";
import { prisma } from "@/infrastructure/database/prisma-client";
import { getEmailService } from "@/infrastructure/email/email.service";
import { buildPublicAppUrl } from "@/lib/public-url";
import { createSecureToken, hashToken } from "@/security/tokens/token-hashing";
import {
  TEAM_ROLE_DESCRIPTIONS,
  TEAM_ROLE_LABELS,
  TEAM_ROLES,
  invitationExpiration,
  invitationState,
  isTeamRole,
  memberChangeBlock,
  normalizeEmail,
  type TeamRole,
} from "./team-rules";

export class TeamError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type TeamMemberDto = {
  id: number;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  joinedAt: string;
  isOwner: boolean;
  isYou: boolean;
};

export type TeamInvitationDto = {
  id: string;
  email: string;
  role: string;
  roleLabel: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
};

export type TeamDto = {
  organization: { name: string; isTeam: boolean };
  members: TeamMemberDto[];
  invitations: TeamInvitationDto[];
  roles: Array<{ key: TeamRole; label: string; description: string }>;
};

/** Returned to the administrator after inviting, so the link can also be shared by hand. */
export type SentInvitationDto = TeamInvitationDto & { inviteUrl: string; emailSent: boolean };

export type MyInvitationDto = {
  id: string;
  organizationName: string;
  roleLabel: string;
  invitedBy: string;
  expiresAt: string;
};

const roleLabel = (key: string) => (isTeamRole(key) ? TEAM_ROLE_LABELS[key] : key);
const fullName = (user: { SNombre: string; SApellidoPaterno: string | null }) =>
  `${user.SNombre} ${user.SApellidoPaterno ?? ""}`.trim();
const inviteUrl = (token: string) => buildPublicAppUrl(`/organizacion/invitaciones/${encodeURIComponent(token)}`).toString();

const invitationInclude = {
  rol: { select: { SClave: true } },
  usuarioInvitador: { select: { SNombre: true, SApellidoPaterno: true } },
} satisfies Prisma.InvitacionOrganizacionInclude;

type InvitationRow = Prisma.InvitacionOrganizacionGetPayload<{ include: typeof invitationInclude }>;

function toInvitationDto(row: InvitationRow, now = new Date()): TeamInvitationDto {
  return {
    id: row.UIdentificadorPublico,
    email: row.SCorreo,
    role: row.rol.SClave,
    roleLabel: roleLabel(row.rol.SClave),
    invitedBy: fullName(row.usuarioInvitador),
    createdAt: row.DFechaCreacion.toISOString(),
    expiresAt: row.DFechaExpiracion.toISOString(),
    expired: invitationState(row, now) === "vencida",
  };
}

async function activeOrganization(organizationId: number) {
  const organization = await prisma.organizacion.findFirst({
    where: { IdOrganizacion: organizationId, BActivo: true, DFechaEliminacion: null },
  });
  if (!organization) throw new TeamError("Organización no encontrada.", 404);
  return organization;
}

async function roleId(key: TeamRole) {
  const rol = await prisma.rol.findFirst({ where: { SClave: key, BActivo: true } });
  if (!rol) throw new TeamError("El rol no está disponible.", 409);
  return rol.IdRol;
}

export async function getTeam(user: AuthUser): Promise<TeamDto> {
  const organization = await activeOrganization(user.organizationId);
  const [members, invitations] = await Promise.all([
    prisma.miembroOrganizacion.findMany({
      where: { IdOrganizacion: organization.IdOrganizacion, BActivo: true, usuario: { BActivo: true, DFechaEliminacion: null } },
      include: {
        rol: { select: { SClave: true } },
        usuario: { select: { IdUsuario: true, SNombre: true, SApellidoPaterno: true, SCorreo: true } },
      },
      orderBy: { DFechaIngreso: "asc" },
    }),
    prisma.invitacionOrganizacion.findMany({
      where: { IdOrganizacion: organization.IdOrganizacion, DFechaAceptacion: null, DFechaRevocacion: null },
      include: invitationInclude,
      orderBy: { DFechaCreacion: "desc" },
    }),
  ]);

  return {
    organization: { name: organization.SNombre, isTeam: organization.STipoAmbito === "TEAM" },
    members: members.map((member) => ({
      id: member.IdMiembroOrganizacion,
      name: fullName(member.usuario),
      email: member.usuario.SCorreo,
      role: member.rol.SClave,
      roleLabel: roleLabel(member.rol.SClave),
      joinedAt: member.DFechaIngreso.toISOString(),
      isOwner: member.usuario.IdUsuario === organization.IdUsuarioPropietario,
      isYou: member.usuario.IdUsuario === user.id,
    })),
    invitations: invitations.map((row) => toInvitationDto(row)),
    roles: TEAM_ROLES.map((key) => ({ key, label: TEAM_ROLE_LABELS[key], description: TEAM_ROLE_DESCRIPTIONS[key] })),
  };
}

/** Names the organization and makes it a team; a personal space keeps its valuations. */
export async function saveTeamSettings(user: AuthUser, input: { name: string }) {
  const organization = await activeOrganization(user.organizationId);
  await prisma.organizacion.update({
    where: { IdOrganizacion: organization.IdOrganizacion },
    data: { SNombre: input.name, STipoAmbito: "TEAM" },
  });
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId: organization.IdOrganizacion,
    userId: user.id,
    entity: "Organizacion",
    entityId: String(organization.IdOrganizacion),
    action: organization.STipoAmbito === "TEAM" ? "TEAM_RENAME" : "TEAM_CREATE_FROM_PERSONAL",
    result: "EXITOSO",
    metadata: { from: organization.SNombre, to: input.name },
  });
}

async function createInvitation(
  user: AuthUser,
  organization: { IdOrganizacion: number; SNombre: string },
  input: { email: string; role: TeamRole },
): Promise<SentInvitationDto> {
  const email = normalizeEmail(input.email);
  const token = createSecureToken();
  const now = new Date();
  const IdRol = await roleId(input.role);

  const row = await prisma.$transaction(async (tx) => {
    // One pending invitation per email: a new one replaces the previous.
    // Two at the very same time still collide on the unique index (handled below).
    await tx.invitacionOrganizacion.updateMany({
      where: { IdOrganizacion: organization.IdOrganizacion, SCorreo: email, DFechaAceptacion: null, DFechaRevocacion: null },
      data: { DFechaRevocacion: now },
    });
    return tx.invitacionOrganizacion.create({
      data: {
        IdOrganizacion: organization.IdOrganizacion,
        IdRol,
        IdUsuarioInvitador: user.id,
        SCorreo: email,
        STokenHash: hashToken(token),
        DFechaCreacion: now,
        DFechaExpiracion: invitationExpiration(now),
      },
      include: invitationInclude,
    });
  }).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new TeamError("Ya hay una invitación pendiente para ese correo. Intenta de nuevo en un momento.", 409);
    }
    throw error;
  });

  const url = inviteUrl(token);
  let emailSent = true;
  try {
    await getEmailService().sendTeamInvitationEmail({
      to: email,
      organizationName: organization.SNombre,
      inviterName: user.name,
      roleLabel: TEAM_ROLE_LABELS[input.role],
      inviteUrl: url,
      expiresAt: row.DFechaExpiracion,
    });
  } catch (error) {
    // The invitation stands: the administrator can share the link or resend it.
    console.error("[TEAM_INVITE_EMAIL]", error);
    emailSent = false;
  }

  await recordAuditEvent({
    typeKey: "CREACION",
    organizationId: organization.IdOrganizacion,
    userId: user.id,
    entity: "InvitacionOrganizacion",
    entityId: row.UIdentificadorPublico,
    action: "TEAM_INVITE",
    result: "EXITOSO",
    metadata: { email, role: input.role, emailSent },
  });

  return { ...toInvitationDto(row, now), inviteUrl: url, emailSent };
}

export async function inviteMember(user: AuthUser, input: { email: string; role: TeamRole }) {
  const organization = await activeOrganization(user.organizationId);
  if (organization.STipoAmbito !== "TEAM") {
    throw new TeamError("Primero convierte tu espacio en un equipo.", 409);
  }
  const email = normalizeEmail(input.email);
  const existing = await prisma.miembroOrganizacion.findFirst({
    where: { IdOrganizacion: organization.IdOrganizacion, BActivo: true, usuario: { SCorreo: { equals: email, mode: "insensitive" } } },
  });
  if (existing) throw new TeamError("Esa persona ya es parte del equipo.", 409);
  return createInvitation(user, organization, { email, role: input.role });
}

async function pendingInvitation(user: AuthUser, publicId: string) {
  const row = await prisma.invitacionOrganizacion.findFirst({
    where: { UIdentificadorPublico: publicId, IdOrganizacion: user.organizationId, DFechaAceptacion: null, DFechaRevocacion: null },
    include: { ...invitationInclude, organizacion: { select: { IdOrganizacion: true, SNombre: true } } },
  });
  if (!row) throw new TeamError("La invitación ya no está pendiente.", 404);
  return row;
}

/** A new link and a new expiration; the previous link stops working. */
export async function resendInvitation(user: AuthUser, publicId: string) {
  const row = await pendingInvitation(user, publicId);
  const role = row.rol.SClave;
  if (!isTeamRole(role)) throw new TeamError("El rol de la invitación ya no está disponible.", 409);
  return createInvitation(user, row.organizacion, { email: row.SCorreo, role });
}

export async function revokeInvitation(user: AuthUser, publicId: string) {
  const row = await pendingInvitation(user, publicId);
  await prisma.invitacionOrganizacion.update({
    where: { IdInvitacionOrganizacion: row.IdInvitacionOrganizacion },
    data: { DFechaRevocacion: new Date() },
  });
  await recordAuditEvent({
    typeKey: "ELIMINACION_LOGICA",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "InvitacionOrganizacion",
    entityId: publicId,
    action: "TEAM_INVITE_REVOKE",
    result: "EXITOSO",
    metadata: { email: row.SCorreo },
  });
}

async function memberForChange(user: AuthUser, memberId: number, nextRole: TeamRole | null) {
  const organization = await activeOrganization(user.organizationId);
  const member = await prisma.miembroOrganizacion.findFirst({
    where: { IdMiembroOrganizacion: memberId, IdOrganizacion: organization.IdOrganizacion, BActivo: true },
    include: { rol: { select: { SClave: true } } },
  });
  if (!member) throw new TeamError("Miembro no encontrado.", 404);
  const activeAdministrators = await prisma.miembroOrganizacion.count({
    where: { IdOrganizacion: organization.IdOrganizacion, BActivo: true, rol: { SClave: "ADMINISTRADOR" }, usuario: { BActivo: true } },
  });
  const block = memberChangeBlock({
    actorUserId: user.id,
    targetUserId: member.IdUsuario,
    ownerUserId: organization.IdUsuarioPropietario,
    targetRole: member.rol.SClave,
    nextRole,
    activeAdministrators,
  });
  if (block) throw new TeamError(block, 409);
  return member;
}

export async function changeMemberRole(user: AuthUser, memberId: number, role: TeamRole) {
  const member = await memberForChange(user, memberId, role);
  await prisma.miembroOrganizacion.update({
    where: { IdMiembroOrganizacion: member.IdMiembroOrganizacion },
    data: { IdRol: await roleId(role) },
  });
  if (member.rol.SClave === "ADMINISTRADOR" && role !== "ADMINISTRADOR") {
    await revokeInvitationsFrom(member.IdOrganizacion, member.IdUsuario);
  }
  await recordAuditEvent({
    typeKey: "MODIFICACION",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "MiembroOrganizacion",
    entityId: String(member.IdMiembroOrganizacion),
    action: "TEAM_MEMBER_ROLE",
    result: "EXITOSO",
    metadata: { from: member.rol.SClave, to: role },
  });
}

/** The person keeps their account and other spaces; they lose access to this team at once. */
export async function removeMember(user: AuthUser, memberId: number) {
  const member = await memberForChange(user, memberId, null);
  await prisma.miembroOrganizacion.update({
    where: { IdMiembroOrganizacion: member.IdMiembroOrganizacion },
    data: { BActivo: false },
  });
  await revokeInvitationsFrom(member.IdOrganizacion, member.IdUsuario);
  // Their open sessions move to another space of theirs instead of logging them out.
  const fallback = await resolveDefaultOrganization(member.IdUsuario);
  const openSessions = { IdUsuario: member.IdUsuario, IdOrganizacion: member.IdOrganizacion, BRevocada: false };
  if (fallback) {
    await prisma.sesion.updateMany({ where: openSessions, data: { IdOrganizacion: fallback.organizationId } });
  } else {
    await prisma.sesion.updateMany({ where: openSessions, data: { BRevocada: true, DFechaRevocacion: new Date() } });
  }
  await recordAuditEvent({
    typeKey: "ELIMINACION_LOGICA",
    organizationId: user.organizationId,
    userId: user.id,
    entity: "MiembroOrganizacion",
    entityId: String(member.IdMiembroOrganizacion),
    action: "TEAM_MEMBER_REMOVE",
    result: "EXITOSO",
  });
}

/** An administrator's pending invitations lapse when they are removed or stop being one. */
async function revokeInvitationsFrom(organizationId: number, userId: number) {
  await prisma.invitacionOrganizacion.updateMany({
    where: { IdOrganizacion: organizationId, IdUsuarioInvitador: userId, DFechaAceptacion: null, DFechaRevocacion: null },
    data: { DFechaRevocacion: new Date() },
  });
}

/** Pending invitations addressed to the signed-in user's email. */
export async function listMyInvitations(user: Pick<AuthUser, "email">): Promise<MyInvitationDto[]> {
  const rows = await prisma.invitacionOrganizacion.findMany({
    where: {
      SCorreo: normalizeEmail(user.email),
      DFechaAceptacion: null,
      DFechaRevocacion: null,
      DFechaExpiracion: { gt: new Date() },
      organizacion: { BActivo: true, DFechaEliminacion: null },
    },
    include: { ...invitationInclude, organizacion: { select: { SNombre: true } } },
    orderBy: { DFechaCreacion: "desc" },
  });
  return rows.map((row) => ({
    id: row.UIdentificadorPublico,
    organizationName: row.organizacion.SNombre,
    roleLabel: roleLabel(row.rol.SClave),
    invitedBy: fullName(row.usuarioInvitador),
    expiresAt: row.DFechaExpiracion.toISOString(),
  }));
}

/** What the invitation page shows before accepting. */
export async function describeInvitation(token: string, user: Pick<AuthUser, "email">) {
  const row = await prisma.invitacionOrganizacion.findUnique({
    where: { STokenHash: hashToken(token) },
    include: { ...invitationInclude, organizacion: { select: { SNombre: true, BActivo: true, DFechaEliminacion: true } } },
  });
  if (!row || !row.organizacion.BActivo || row.organizacion.DFechaEliminacion) return { state: "invalida" as const };
  const state = invitationState(row);
  return {
    state,
    organizationName: row.organizacion.SNombre,
    roleLabel: roleLabel(row.rol.SClave),
    invitedBy: fullName(row.usuarioInvitador),
    email: row.SCorreo,
    matchesUser: row.SCorreo === normalizeEmail(user.email),
  };
}

/**
 * Joins the signed-in user to the invitation's organization and makes it the
 * session's active one. The account's email must be the invited email.
 */
export async function acceptInvitation(
  user: Pick<AuthUser, "id" | "email">,
  sessionId: number,
  selector: { token: string } | { id: string },
) {
  const row = await prisma.invitacionOrganizacion.findFirst({
    where: "token" in selector ? { STokenHash: hashToken(selector.token) } : { UIdentificadorPublico: selector.id },
    include: { organizacion: { select: { IdOrganizacion: true, UIdentificadorPublico: true, SNombre: true, BActivo: true, DFechaEliminacion: true } } },
  });
  if (!row || !row.organizacion.BActivo || row.organizacion.DFechaEliminacion) {
    throw new TeamError("La invitación no existe.", 404);
  }
  if (row.SCorreo !== normalizeEmail(user.email)) {
    throw new TeamError(`Esta invitación es para ${row.SCorreo}. Entra con una cuenta de ese correo.`, 403);
  }
  const state = invitationState(row);
  if (state === "vencida") throw new TeamError("La invitación venció. Pide que te la reenvíen.", 410);
  if (state === "cancelada") throw new TeamError("La invitación fue cancelada.", 410);

  if (state === "pendiente") {
    // An invitation carries the inviter's authority: it lapses if they no longer administer the team.
    const inviterStillAdmin = await prisma.miembroOrganizacion.findFirst({
      where: {
        IdOrganizacion: row.IdOrganizacion,
        IdUsuario: row.IdUsuarioInvitador,
        BActivo: true,
        usuario: { BActivo: true },
        rol: { permisos: { some: { permiso: { SClave: "USUARIO_ADMINISTRAR", BActivo: true } } } },
      },
    });
    if (!inviterStillAdmin) {
      throw new TeamError("Quien te invitó ya no administra el equipo. Pide una invitación nueva.", 410);
    }
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.invitacionOrganizacion.updateMany({
        where: { IdInvitacionOrganizacion: row.IdInvitacionOrganizacion, DFechaAceptacion: null, DFechaRevocacion: null },
        data: { DFechaAceptacion: new Date(), IdUsuarioAceptante: user.id },
      });
      if (claimed.count !== 1) throw new TeamError("La invitación ya no está pendiente.", 409);
      await tx.miembroOrganizacion.upsert({
        where: { IdOrganizacion_IdUsuario: { IdOrganizacion: row.IdOrganizacion, IdUsuario: user.id } },
        create: { IdOrganizacion: row.IdOrganizacion, IdUsuario: user.id, IdRol: row.IdRol },
        update: { IdRol: row.IdRol, BActivo: true, DFechaIngreso: new Date() },
      });
    });
    await recordAuditEvent({
      typeKey: "MODIFICACION",
      organizationId: row.IdOrganizacion,
      userId: user.id,
      entity: "InvitacionOrganizacion",
      entityId: row.UIdentificadorPublico,
      action: "TEAM_INVITE_ACCEPT",
      result: "EXITOSO",
    });
  } else if (row.IdUsuarioAceptante !== user.id) {
    throw new TeamError("La invitación ya fue usada.", 409);
  }

  // Accepted now or before by this same user (a second click): open the team,
  // unless an administrator removed them since.
  const membership = await prisma.miembroOrganizacion.findFirst({
    where: { IdOrganizacion: row.IdOrganizacion, IdUsuario: user.id, BActivo: true },
  });
  if (!membership) throw new TeamError("Ya no formas parte de este equipo.", 410);
  await updateSessionOrganization(sessionId, user.id, row.IdOrganizacion);
  return { organizationName: row.organizacion.SNombre };
}
