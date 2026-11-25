import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { getBillingGateway } from "@/features/billing/billing-gateway-provider";
import { BILLING_PAGE_PATH } from "@/features/billing/billing-rules";
import { getBillingOverview } from "@/features/billing/billing.service";
import { BillingPanel, type BillingNotice } from "@/features/billing/components/billing-panel";
import { reconcilePackageCheckout } from "@/features/billing/credit-packages.service";
import { getInvoicingGateway } from "@/features/billing/invoicing-gateway";
import { invoicePurchaseInBackground } from "@/features/billing/invoicing.service";
import { reconcileCheckoutSession, refreshOrganizationSubscription } from "@/features/billing/subscription-sync.service";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { OrganizationTabs } from "@/features/dashboard/components/organization-tabs";
import { PageContainer, PageHeader } from "@/features/dashboard/components/page-header";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Plan y facturación" };

type SearchParams = Promise<{ checkout?: string | string[]; compra?: string | string[]; session_id?: string | string[] }>;

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireSession(BILLING_PAGE_PATH);
  const canManage = hasPermission(user, AUTH_PERMISSIONS.manageSubscription);
  const canManageInvoicing = hasPermission(user, AUTH_PERMISSIONS.manageBilling);
  if (!canManage && !canManageInvoicing && !hasPermission(user, AUTH_PERMISSIONS.viewBilling)) redirect("/dashboard");

  const { checkout, compra, session_id: sessionId } = await searchParams;
  const gateway = await getBillingGateway();
  let stripeUnreachable = false;
  let purchaseApplied = false;
  if (gateway) {
    // The page does not wait for the webhook: it asks Stripe and writes what it answers.
    try {
      if (checkout === "exito" && typeof sessionId === "string") await reconcileCheckoutSession(gateway, user.organizationId, sessionId);
      else if (compra === "exito" && typeof sessionId === "string") {
        purchaseApplied = (await reconcilePackageCheckout(gateway, sessionId, { organizationId: user.organizationId })).applied;
        // Its CFDI, once the page is sent (the webhook asks too; the payment is invoiced once).
        if (purchaseApplied) after(async () => invoicePurchaseInBackground(await getInvoicingGateway(), sessionId));
      } else await refreshOrganizationSubscription(gateway, user.organizationId);
    } catch (error) {
      console.error("[BILLING_PAGE] Could not reconcile with Stripe", error);
      stripeUnreachable = true;
    }
  }

  const overview = await getBillingOverview(user.organizationId, gateway);
  let notice: BillingNotice = null;
  if (stripeUnreachable) notice = "unreachable";
  else if (checkout === "exito") notice = overview.current?.paid ? "paid" : "confirming";
  else if (checkout === "cancelado" || compra === "cancelado") notice = "cancelled";
  else if (compra === "exito") notice = purchaseApplied ? "purchased" : "purchase-confirming";

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} active="facturacion" />
      <PageContainer width="narrow">
        <OrganizationTabs user={user} active="facturacion" />
        <PageHeader eyebrow="Despacho" title="Plan y facturación" description={`Los avalúos disponibles de ${user.organizationName}, cómo comprar más y tus movimientos.`} />
        <BillingPanel overview={overview} canManage={canManage} canManageInvoicing={canManageInvoicing} notice={notice} />
      </PageContainer>
    </div>
  );
}
