import { AUTH_PERMISSIONS, type AuthUser } from "@/features/auth/model";
import { buildAuthorizationContext } from "@/features/auth/services/authorization-context.service";
import { listValuations } from "@/features/valuations/repositories/valuation.repository";

export type DashboardSummary = {
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
  organization: {
    id: number;
    name: string;
  };
  subscription: {
    plan: string | null;
    status: string | null;
    enabledFeatures: string[];
  };
  limits: {
    activeValuations: number;
  };
  valuations: {
    total: number;
    recent: Array<{
      id: string;
      folio: string;
      client: string;
      location: string;
      valuationKind: string;
      propertyKind: string;
      status: string;
      createdAt: Date;
    }>;
    active: number;
    byStatus: Record<string, number>;
  };
  actions: {
    canCreateValuation: boolean;
    canExport: boolean;
  };
};

export async function getDashboardSummary(user: AuthUser): Promise<DashboardSummary> {
  const [authorizationContext, valuations] = await Promise.all([
    buildAuthorizationContext(user.id, user.organizationId),
    listValuations(user.organizationId),
  ]);
  const permissions = authorizationContext?.permissions ?? new Set<string>();

  const byStatus = valuations.reduce<Record<string, number>>((accumulator, valuation) => {
    accumulator[valuation.status] = (accumulator[valuation.status] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    organization: {
      id: user.organizationId,
      name: user.organizationName,
    },
    subscription: {
      plan: authorizationContext?.subscription.plan ?? null,
      status: authorizationContext?.subscription.status ?? null,
      enabledFeatures: Array.from(authorizationContext?.features.values() ?? [])
        .filter((feature) => feature.included)
        .map((feature) => feature.key),
    },
    limits: {
      activeValuations: valuations.filter((valuation) => valuation.status !== "terminado").length,
    },
    valuations: {
      total: valuations.length,
      recent: valuations.slice(0, 5),
      active: valuations.filter((valuation) => valuation.status !== "terminado").length,
      byStatus,
    },
    actions: {
      canCreateValuation: permissions.has(AUTH_PERMISSIONS.createValuations),
      canExport: permissions.has(AUTH_PERMISSIONS.exportValuations),
    },
  };
}
