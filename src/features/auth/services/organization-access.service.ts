import {
  findActiveMembership,
  listActiveMemberships,
  resolveSingleActiveMembership,
} from "../repositories/organization-member.repository";
import { updateSessionOrganization } from "../repositories/session.repository";

function mapOrganizationAccess(membership: Awaited<ReturnType<typeof findActiveMembership>>) {
  if (!membership) return null;

  return {
    organizationId: membership.IdOrganizacion,
    organizationName: membership.organizacion.SNombre,
    role: membership.rol.SClave,
    permissions: membership.rol.permisos
      .filter((permissionRole) => permissionRole.permiso.BActivo)
      .map((permissionRole) => permissionRole.permiso.SClave),
  };
}

export async function resolveDefaultOrganization(userId: number) {
  return mapOrganizationAccess(await resolveSingleActiveMembership(userId));
}

export async function resolveActiveOrganization(userId: number, organizationId: number) {
  return mapOrganizationAccess(await findActiveMembership(userId, { organizationId }));
}

export async function listAvailableOrganizations(userId: number, activeOrganizationId: number) {
  const memberships = await listActiveMemberships(userId);

  return memberships.map((membership) => ({
    IdOrganizacion: membership.organizacion.IdOrganizacion,
    UIdentificadorPublico: membership.organizacion.UIdentificadorPublico,
    SNombre: membership.organizacion.SNombre,
    SSlug: membership.organizacion.SSlug,
    STipoAmbito: membership.organizacion.STipoAmbito,
    rol: membership.rol.SClave,
    BEsAmbitoActivo: membership.organizacion.IdOrganizacion === activeOrganizationId,
  }));
}

export async function changeActiveOrganization(input: {
  sessionId: number;
  userId: number;
  organizationId?: number;
  organizationPublicId?: string;
}) {
  const selector = input.organizationId
    ? { organizationId: input.organizationId }
    : input.organizationPublicId
      ? { organizationPublicId: input.organizationPublicId }
      : null;
  if (!selector) return { ok: false as const, reason: "INVALID_ORGANIZATION" as const };

  const membership = await findActiveMembership(input.userId, selector);
  if (!membership) return { ok: false as const, reason: "ORGANIZATION_ACCESS_DENIED" as const };

  const updated = await updateSessionOrganization(
    input.sessionId,
    input.userId,
    membership.IdOrganizacion,
  );
  if (updated.count !== 1) return { ok: false as const, reason: "SESSION_INVALID" as const };

  return {
    ok: true as const,
    organization: {
      IdOrganizacion: membership.organizacion.IdOrganizacion,
      UIdentificadorPublico: membership.organizacion.UIdentificadorPublico,
      SNombre: membership.organizacion.SNombre,
      SSlug: membership.organizacion.SSlug,
      STipoAmbito: membership.organizacion.STipoAmbito,
      rol: membership.rol.SClave,
      BEsAmbitoActivo: true,
    },
  };
}
