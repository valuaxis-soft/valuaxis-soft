import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { OrganizationTabs } from "@/features/dashboard/components/organization-tabs";
import { PageContainer, PageHeader } from "@/features/dashboard/components/page-header";
import { TeamManager } from "@/features/team/components/team-manager";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Equipo" };

export default async function TeamPage() {
  const user = await requireSession("/organizacion/equipo");
  if (!hasPermission(user, AUTH_PERMISSIONS.manageUsers)) redirect("/dashboard");

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} active="equipo" />
      <PageContainer width="narrow">
        <OrganizationTabs user={user} active="equipo" />
        <PageHeader eyebrow="Despacho" title="Equipo" description={`Invita a tu equipo y elige qué puede hacer cada quien. Todos ven los avalúos de ${user.organizationName}.`} />
        <TeamManager />
      </PageContainer>
    </div>
  );
}
