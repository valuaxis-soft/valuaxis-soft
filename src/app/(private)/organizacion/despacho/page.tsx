import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { OrganizationTabs } from "@/features/dashboard/components/organization-tabs";
import { PageContainer, PageHeader } from "@/features/dashboard/components/page-header";
import { FirmSettingsForm } from "@/features/firm/components/firm-settings-form";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Datos del despacho" };

export default async function FirmPage() {
  const user = await requireSession("/organizacion/despacho");
  if (!hasPermission(user, AUTH_PERMISSIONS.manageUsers)) redirect("/dashboard");

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} active="despacho" />
      <PageContainer width="narrow">
        <OrganizationTabs user={user} active="despacho" />
        <PageHeader eyebrow="Despacho" title="Datos del despacho" description={`El membrete de los dictámenes de ${user.organizationName} y los datos con que nace cada avalúo.`} />
        <FirmSettingsForm />
      </PageContainer>
    </div>
  );
}
