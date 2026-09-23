import { requireSession } from "@/security/guards/require-session";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { QuickActions } from "@/features/dashboard/components/quick-actions";
import { RecentValuations } from "@/features/dashboard/components/recent-valuations";
import { StatsCards } from "@/features/dashboard/components/stats-cards";
import { getDashboardSummary } from "@/features/dashboard/services/dashboard-summary.service";

export default async function DashboardPage() {
  const user = await requireSession("/dashboard");
  const summary = await getDashboardSummary(user);

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader user={user} active="dashboard" />

      <main className="mx-auto max-w-[1760px] px-4 py-8 lg:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            Bienvenido, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.organizationName}
          </p>
        </div>

        <div className="mb-6">
          <StatsCards
            stats={{ total: summary.valuations.total, byStatus: summary.valuations.byStatus }}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <RecentValuations valuations={summary.valuations.recent} />
          <QuickActions
            canCreateValuation={hasPermission(user, AUTH_PERMISSIONS.createValuations)}
          />
        </div>
      </main>
    </div>
  );
}
