import { AUTH_PERMISSIONS, type AuthUser } from "@/features/auth/model";
import { buildAuthorizationContext } from "@/features/auth/services/authorization-context.service";
import { getCreditBalance } from "@/features/billing/credits.service";
import type { AttentionItem } from "@/features/dashboard/attention";
import { listAttentionValuations, listRecentActivity, type ActivityItem } from "@/features/dashboard/services/dashboard-activity.service";
import { prisma } from "@/infrastructure/database/prisma-client";
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
      title: string;
      client: string;
      location: string;
      valuationKind: string;
      propertyKind: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
    active: number;
    /** Count per lowercase status key: every active catalog status in catalog order, then any other key found. */
    byStatus: Record<string, number>;
  };
  actions: {
    canCreateValuation: boolean;
    canExport: boolean;
  };
  /** Open valuations waiting for something; empty without AVALUO_VER. */
  attention: AttentionItem[];
  /** The last status changes; empty without AVALUO_VER. */
  activity: ActivityItem[];
  /** The credit balance, only for who sees the billing and only while the firm pays per valuation. */
  credits: { balance: number } | null;
  /** When the summary was read: the dashboard words its dates against it. */
  generatedAt: Date;
};

/** The balance when the per-valuation charge is on (BCobroPorAvaluo); null when it is off. */
async function enforcedCreditBalance(organizationId: number) {
  const organization = await prisma.organizacion.findUnique({ where: { IdOrganizacion: organizationId }, select: { BCobroPorAvaluo: true } });
  if (!organization?.BCobroPorAvaluo) return null;
  return { balance: await getCreditBalance(organizationId) };
}

export async function getDashboardSummary(user: AuthUser): Promise<DashboardSummary> {
  const now = new Date();
  const [authorizationContext, recentPage, counts, statuses] = await Promise.all([
    buildAuthorizationContext(user.id, user.organizationId),
    listValuationsPage({ organizationId: user.organizationId, page: 1, pageSize: RECENT_VALUATIONS }),
    countValuationsByStatus(user.organizationId),
    listValuationStatuses(),
  ]);
  const permissions = authorizationContext?.permissions ?? new Set<string>();
  // Permissions come from the membership, never from the session object.
  const canView = permissions.has(AUTH_PERMISSIONS.viewValuations);
  const seesBilling = permissions.has(AUTH_PERMISSIONS.viewBilling) || permissions.has(AUTH_PERMISSIONS.manageSubscription);
  const [attention, activity, credits] = await Promise.all([
    canView ? listAttentionValuations(user.organizationId, now) : Promise.resolve([]),
    canView ? listRecentActivity(user.organizationId) : Promise.resolve([]),
    seesBilling ? enforcedCreditBalance(user.organizationId) : Promise.resolve(null),
  ]);

  const byStatus: Record<string, number> = {};
  for (const status of statuses) byStatus[status.key] = counts[status.key] ?? 0;
  for (const [key, count] of Object.entries(counts)) {
    if (!(key in byStatus)) byStatus[key] = count;
  }

  const total = recentPage.total;
  // Final statuses: finished or cancelled.
  const active = total - (counts.terminado ?? 0) - (counts.cancelado ?? 0);

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
        title: valuation.title,
        client: valuation.client,
        location: valuation.location,
        valuationKind: valuation.valuationKind,
        propertyKind: valuation.propertyKind,
        status: valuation.status,
        createdAt: valuation.createdAt,
        updatedAt: valuation.updatedAt,
      })),
      active,
      byStatus,
    },
    actions: {
      canCreateValuation: permissions.has(AUTH_PERMISSIONS.createValuations),
      canExport: permissions.has(AUTH_PERMISSIONS.exportValuations),
    },
    attention,
    activity,
    credits,
    generatedAt: now,
  };
}
