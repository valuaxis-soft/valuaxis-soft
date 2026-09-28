/**
 * Rules for teams: who can be invited with which role, when an invitation is
 * still usable, and which member changes an administrator may make.
 */

export const INVITATION_TTL_DAYS = 7;

export const TEAM_ROLES = ["ADMINISTRADOR", "VALUADOR", "REVISOR", "CONSULTA"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  ADMINISTRADOR: "Administrador",
  VALUADOR: "Valuador",
  REVISOR: "Revisor",
  CONSULTA: "Consulta",
};

export const TEAM_ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  ADMINISTRADOR: "Todo, incluido invitar y administrar al equipo.",
  VALUADOR: "Crea, edita, concluye y exporta avalúos.",
  REVISOR: "Revisa, concluye y exporta avalúos.",
  CONSULTA: "Solo consulta y exporta avalúos.",
};

export const isTeamRole = (value: string): value is TeamRole => (TEAM_ROLES as readonly string[]).includes(value);

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const invitationExpiration = (now = new Date()) =>
  new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

export type InvitationState = "pendiente" | "vencida" | "aceptada" | "cancelada";

export function invitationState(
  invitation: { DFechaAceptacion: Date | null; DFechaRevocacion: Date | null; DFechaExpiracion: Date },
  now = new Date(),
): InvitationState {
  if (invitation.DFechaAceptacion) return "aceptada";
  if (invitation.DFechaRevocacion) return "cancelada";
  return invitation.DFechaExpiracion <= now ? "vencida" : "pendiente";
}

/**
 * Why an administrator may not change a member's role or remove them, or null
 * when the change is allowed. `nextRole` null means removing the member.
 */
export function memberChangeBlock(input: {
  actorUserId: number;
  targetUserId: number;
  ownerUserId: number | null;
  targetRole: string;
  nextRole: string | null;
  activeAdministrators: number;
}): string | null {
  if (input.targetUserId === input.actorUserId) return "No puedes cambiar tu propio acceso.";
  if (input.targetUserId === input.ownerUserId) return "El propietario del equipo no se puede cambiar ni dar de baja.";
  const losesAdmin = input.targetRole === "ADMINISTRADOR" && input.nextRole !== "ADMINISTRADOR";
  if (losesAdmin && input.activeAdministrators <= 1) return "El equipo necesita al menos un administrador.";
  return null;
}
