import { requireSession } from "@/security/guards/require-session";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { QuickActions } from "@/features/dashboard/components/quick-actions";
import { RecentValuations } from "@/features/dashboard/components/recent-valuations";
import { StatsCards } from "@/features/dashboard/components/stats-cards";
import { getDashboardSummary } from "@/features/dashboard/services/dashboard-summary.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const user = await requireSession("/dashboard");
  const summary = await getDashboardSummary(user);
  const stats = {
    total: summary.valuations.total,
    borrador: summary.valuations.byStatus.borrador ?? 0,
    revision: summary.valuations.byStatus.revision ?? 0,
    terminado: summary.valuations.byStatus.terminado ?? 0,
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader user={user} />

      <main className="mx-auto max-w-[1760px] px-4 py-8 lg:px-6">
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight">
            Bienvenido, {user.name.split(" ")[0]}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.organizationName}
          </p>
        </div>

        <div className="mb-6">
          <StatsCards stats={stats} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <RecentValuations valuations={summary.valuations.recent} />
          <QuickActions />
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Contexto de acceso</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Plan: {summary.subscription.plan ?? "sin suscripcion activa"} · Estado:{" "}
              {summary.subscription.status ?? "no disponible"} · Funcionalidades:{" "}
              {summary.subscription.enabledFeatures.length}
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
