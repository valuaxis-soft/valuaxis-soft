import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { getComparableCard } from "@/features/valuations/calculation/comparable-card.service";
import { ComparableCardView } from "@/features/valuations/components/calculation/comparable-card-view";
import { ValuationWorkflowError } from "@/features/valuations/services/valuation-workflow/errors";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Ficha del comparable" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Ficha del comparable" on its own page, to open beside the listing while reviewing. */
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
  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader user={user} active="comparables" />
      <main className="mx-auto grid w-full max-w-4xl gap-4 p-4 sm:p-6">
        <Link href="/comparables" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Comparables
        </Link>
        <h1 className="text-lg font-semibold">Ficha del comparable</h1>
        <ComparableCardView card={card} />
      </main>
    </div>
  );
}
