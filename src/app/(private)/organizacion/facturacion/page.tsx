import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { getBillingGateway } from "@/features/billing/billing-gateway-provider";
import { BILLING_PAGE_PATH, getBillingOverview } from "@/features/billing/billing.service";
import { BillingPanel, type BillingNotice } from "@/features/billing/components/billing-panel";
import { reconcileCheckoutSession, refreshOrganizationSubscription } from "@/features/billing/subscription-sync.service";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Plan y facturación" };

type SearchParams = Promise<{ checkout?: string | string[]; session_id?: string | string[] }>;

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireSession(BILLING_PAGE_PATH);
  const canManage = hasPermission(user, AUTH_PERMISSIONS.manageSubscription);
  if (!canManage && !hasPermission(user, AUTH_PERMISSIONS.viewBilling)) redirect("/dashboard");

  const { checkout, session_id: sessionId } = await searchParams;
  const gateway = await getBillingGateway();
  let stripeUnreachable = false;
  if (gateway) {
    // The page does not wait for the webhook: it asks Stripe and writes what it answers.
    try {
      if (checkout === "exito" && typeof sessionId === "string") await reconcileCheckoutSession(gateway, user.organizationId, sessionId);
      else await refreshOrganizationSubscription(gateway, user.organizationId);
    } catch (error) {
      console.error("[BILLING_PAGE] Could not reconcile with Stripe", error);
      stripeUnreachable = true;
    }
  }

  const overview = await getBillingOverview(user.organizationId, gateway);
  let notice: BillingNotice = null;
  if (stripeUnreachable) notice = "unreachable";
  else if (checkout === "exito") notice = overview.current?.paid ? "paid" : "confirming";
  else if (checkout === "cancelado") notice = "cancelled";

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader user={user} active="facturacion" />
      <main className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Plan y facturación</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            El plan de {user.organizationName}, su próximo cobro y la forma de pago.
          </p>
        </div>
        <BillingPanel overview={overview} canManage={canManage} notice={notice} />
      </main>
    </div>
  );
}
