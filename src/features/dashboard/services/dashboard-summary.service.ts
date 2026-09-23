import { AUTH_PERMISSIONS, type AuthUser } from "@/features/auth/model";
import { buildAuthorizationContext } from "@/features/auth/services/authorization-context.service";
import {
  countValuationsByStatus,
  listValuationStatuses,
  listValuationsPage,
} from "@/features/valuations/repositories/valuation.repository";

const RECENT_VALUATIONS = 5;

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
    /** Count per lowercase status key: every active catalog status in catalog order, then any other key found. */
    byStatus: Record<string, number>;
  };
  actions: {
    canCreateValuation: boolean;
    canExport: boolean;
  };
};

export async function getDashboardSummary(user: AuthUser): Promise<DashboardSummary> {
  const [authorizationContext, recentPage, counts, statuses] = await Promise.all([
    buildAuthorizationContext(user.id, user.organizationId),
    listValuationsPage({ organizationId: user.organizationId, page: 1, pageSize: RECENT_VALUATIONS }),
    countValuationsByStatus(user.organizationId),
    listValuationStatuses(),
  ]);
  const permissions = authorizationContext?.permissions ?? new Set<string>();

  const byStatus: Record<string, number> = {};
  for (const status of statuses) byStatus[status.key] = counts[status.key] ?? 0;
  for (const [key, count] of Object.entries(counts)) {
    if (!(key in byStatus)) byStatus[key] = count;
  }

  const total = recentPage.total;
  const active = total - (counts.terminado ?? 0);

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
      activeValuations: active,
    },
    valuations: {
      total,
      recent: recentPage.items.map((valuation) => ({
        id: valuation.id,
        folio: valuation.folio,
        client: valuation.client,
        location: valuation.location,
        valuationKind: valuation.valuationKind,
        propertyKind: valuation.propertyKind,
        status: valuation.status,
        createdAt: valuation.createdAt,
      })),
      active,
      byStatus,
    },
    actions: {
      canCreateValuation: permissions.has(AUTH_PERMISSIONS.createValuations),
      canExport: permissions.has(AUTH_PERMISSIONS.exportValuations),
    },
  };
}
