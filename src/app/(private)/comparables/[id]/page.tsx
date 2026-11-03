import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Suspense } from "react";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { DashboardHeader } from "@/features/dashboard/components/header";
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
    <div className="min-h-screen bg-background">
      <DashboardHeader user={user} active="comparables" />
      <main className="mx-auto grid w-full max-w-4xl gap-4 p-4 sm:p-6">
        <Link href="/comparables" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Comparables
        </Link>
        <h1 className="text-lg font-semibold">Ficha del comparable</h1>
        <Suspense>
          <ComparableCardPanel
            card={card}
            canEdit={hasPermission(user, AUTH_PERMISSIONS.editValuations)}
            validityMonths={months}
            attributeNames={attributeNames}
          />
        </Suspense>
      </main>
    </div>
  );
}
