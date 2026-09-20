import { prisma } from "@/infrastructure/database/prisma-client";
import type { AuthorizationContext, EffectiveFeature } from "../types/authorization.types";
import { resolveActiveOrganization } from "./organization-access.service";

export async function buildAuthorizationContext(
  userId: number,
  organizationId: number,
): Promise<AuthorizationContext | null> {
  const activeOrganization = await resolveActiveOrganization(userId, organizationId);
  if (!activeOrganization) return null;

  const subscription = await prisma.suscripcion.findFirst({
    where: {
      IdOrganizacion: activeOrganization.organizationId,
      DFechaFinalizacion: null,
    },
    include: {
      plan: {
        include: {
          funcionalidades: {
            include: { funcionalidad: true },
          },
        },
      },
      estadoSuscripcion: true,
    },
    orderBy: { DFechaInicio: "desc" },
  });

  const features = new Map<string, EffectiveFeature>();
  for (const feature of subscription?.plan.funcionalidades ?? []) {
    features.set(feature.funcionalidad.SClave, {
      key: feature.funcionalidad.SClave,
      included: feature.BIncluida,
      unlimited: feature.BSinLimite,
      limit: feature.ILimiteIncluido,
      period: feature.SPeriodoLimite,
    });
  }

  return {
    userId,
    organizationId: activeOrganization.organizationId,
    role: activeOrganization.role,
    permissions: new Set(activeOrganization.permissions),
    subscription: {
      status: subscription?.estadoSuscripcion.SClave ?? null,
      plan: subscription?.plan.SClave ?? null,
    },
    features,
  };
}
