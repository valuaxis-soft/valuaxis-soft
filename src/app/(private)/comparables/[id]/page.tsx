import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Suspense } from "react";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { PageContainer } from "@/features/dashboard/components/page-header";
import { getComparableCard } from "@/features/valuations/calculation/comparable-card.service";
import { comparableAttributeNames, firmValidityMonths } from "@/features/valuations/comparable-base/comparable-base.service";
import { ComparableCardPanel } from "@/features/valuations/comparable-base/components/comparable-card-panel";
import { ValuationWorkflowError } from "@/features/valuations/services/valuation-workflow/errors";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Ficha del comparable" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Ficha del comparable" on its own page, to open beside the listing while reviewing; it is edited and located from here. */
export default async function ComparableCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSession(`/comparables/${id}`);
  if (!hasPermission(user, AUTH_PERMISSIONS.viewValuations)) redirect("/avaluos");
  if (!UUID.test(id)) notFound();
  const card = await getComparableCard(id, user.organizationId).catch((error: unknown) => {
    if (error instanceof ValuationWorkflowError && error.status === 404) return null;
    throw error;
  });
  if (!card) notFound();
  const [months, attributeNames] = await Promise.all([firmValidityMonths(user.organizationId), comparableAttributeNames(user.organizationId)]);
  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} active="comparables" />
      <PageContainer width="narrow" className="grid gap-4">
        <nav aria-label="Ruta">
          <Link
            href="/comparables"
            className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-8"
          >
            <ChevronLeft className="size-4" aria-hidden="true" /> Comparables
          </Link>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">Ficha del comparable</h1>
        <Suspense>
          <ComparableCardPanel
            card={card}
            canEdit={hasPermission(user, AUTH_PERMISSIONS.editValuations)}
            validityMonths={months}
            attributeNames={attributeNames}
          />
        </Suspense>
      </PageContainer>
    </div>
  );
}
