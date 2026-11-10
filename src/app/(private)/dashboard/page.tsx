import Link from "next/link";
import { MapPinned, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireSession } from "@/security/guards/require-session";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { greetingFor } from "@/features/dashboard/attention";
import { ActivityFeed } from "@/features/dashboard/components/activity-feed";
import { AttentionPanel } from "@/features/dashboard/components/attention-panel";
import { CreditsCard } from "@/features/dashboard/components/credits-card";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { PageContainer } from "@/features/dashboard/components/page-header";
import { QuickActions } from "@/features/dashboard/components/quick-actions";
import { RecentValuations } from "@/features/dashboard/components/recent-valuations";
import { StatsCards } from "@/features/dashboard/components/stats-cards";
import { NEW_VALUATION_HREF } from "@/features/dashboard/navigation";
import { getDashboardSummary } from "@/features/dashboard/services/dashboard-summary.service";
import { PendingInvitations } from "@/features/team/components/pending-invitations";
import { listMyInvitations } from "@/features/team/team.service";
import { cn } from "@/lib/utils";

const longDate = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Mexico_City" });

/** One sentence with where the work stands, in the person's words. */
function summarySentence(active: number, toConclude: number, total: number) {
  if (total === 0) return "Aquí verás tus avalúos, lo que espera tu atención y el movimiento del despacho.";
  const inProgress = active === 0 ? "No tienes avalúos en curso" : `Tienes ${active} ${active === 1 ? "avalúo en curso" : "avalúos en curso"}`;
  if (toConclude === 0) return `${inProgress}.`;
  return `${inProgress}; ${toConclude} ${toConclude === 1 ? "está en revisión, listo para concluir" : "están en revisión, listos para concluir"}.`;
}

export default async function DashboardPage() {
  const user = await requireSession("/dashboard");
  const [summary, invitations] = await Promise.all([getDashboardSummary(user), listMyInvitations(user)]);
  const canCreate = hasPermission(user, AUTH_PERMISSIONS.createValuations);
  const canView = hasPermission(user, AUTH_PERMISSIONS.viewValuations);
  const firstName = user.name.split(" ")[0];
  const now = summary.generatedAt;

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} active="dashboard" />

      <PageContainer>
        <section className="relative mb-6 overflow-hidden rounded-2xl border border-border bg-card px-5 py-6 sm:px-8 sm:py-8">
          <HeroPattern />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground first-letter:uppercase">
                {longDate.format(now)} · {user.organizationName}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                {greetingFor(now)}, {firstName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-pretty text-muted-foreground sm:text-base">
                {summarySentence(summary.valuations.active, summary.valuations.byStatus.en_revision ?? 0, summary.valuations.total)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canCreate ? (
                <Link href={NEW_VALUATION_HREF} className={cn(buttonVariants(), "h-11 gap-2 px-4 sm:h-10")}>
                  <Plus className="size-4" aria-hidden="true" />
                  Nuevo avalúo
                </Link>
              ) : null}
              {canView ? (
                <Link href="/comparables" className={cn(buttonVariants({ variant: "outline" }), "h-11 gap-2 px-4 sm:h-10")}>
                  <MapPinned className="size-4" aria-hidden="true" />
                  Buscar comparables
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <PendingInvitations invitations={invitations} />

        <div className="mb-6">
          <StatsCards stats={{ total: summary.valuations.total, byStatus: summary.valuations.byStatus }} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
            {canView ? <AttentionPanel items={summary.attention} /> : null}
            <RecentValuations valuations={summary.valuations.recent} now={now} canCreate={canCreate} />
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
            {summary.credits ? <CreditsCard balance={summary.credits.balance} /> : null}
            <QuickActions
              canCreateValuation={canCreate}
              canViewValuations={canView}
              canEditValuations={hasPermission(user, AUTH_PERMISSIONS.editValuations)}
            />
            {canView ? <ActivityFeed items={summary.activity} now={now} /> : null}
          </div>
        </div>
      </PageContainer>
    </div>
  );
}

/** A quiet drawing of roofs behind the greeting: decoration only. */
function HeroPattern() {
  return (
    <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute -top-6 right-0 h-[140%] w-auto opacity-50 max-md:hidden" viewBox="0 0 360 200">
      <defs>
        <linearGradient id="hero-fade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="1" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
      </defs>
      <g className="text-primary/10" fill="none" stroke="url(#hero-fade)" strokeWidth="2" strokeLinejoin="round">
        <path d="M40 150l50-40 50 40v50H40z" />
        <path d="M130 130l70-56 70 56v70H130z" />
        <path d="M250 120l55-44 55 44v80H250z" />
        <path d="M184 200v-38h32v38M280 150h20v20h-20z" />
      </g>
      <g className="text-chart-2/25" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M168 128l32 42 32-42" />
      </g>
    </svg>
  );
}
