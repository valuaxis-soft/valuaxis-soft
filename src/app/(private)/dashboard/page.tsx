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
import { ContourLines } from "@/components/brand/contour-lines";
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
        <section className="relative mb-6 grid overflow-hidden rounded-2xl border border-border bg-card shadow-soft lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 px-5 py-6 sm:px-8 sm:py-8">
            <p className="text-sm font-medium text-muted-foreground first-letter:uppercase">
              {longDate.format(now)} · {user.organizationName}
            </p>
            <h1 className="mt-1 font-display text-3xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl">
              {greetingFor(now)}, {firstName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-pretty text-muted-foreground sm:text-base">
              {summarySentence(summary.valuations.active, summary.valuations.byStatus.en_revision ?? 0, summary.valuations.total)}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
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
          <HeroArt />
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

/**
 * The greeting's own column (lg and up): the brand's contour lines and three
 * roofs, never under the text or the buttons. Decoration only.
 */
function HeroArt() {
  return (
    <div aria-hidden="true" className="relative hidden border-l border-border bg-muted/50 lg:block">
      <ContourLines className="absolute inset-0 size-full text-primary opacity-[0.08]" />
      <svg focusable="false" className="absolute inset-x-6 bottom-0 h-[78%] w-[calc(100%-3rem)]" viewBox="0 0 240 150" preserveAspectRatio="xMidYMax meet">
        <g className="text-primary/35" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M8 150v-40l36-28 36 28v40" />
          <path d="M80 150V90l46-36 46 36v60" />
          <path d="M172 150v-48l32-25 32 25v48" />
          <path d="M112 150v-30h28v30M196 118h16v14h-16z" />
        </g>
        <path d="M108 86l18 24 28-36" fill="none" className="stroke-success" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
