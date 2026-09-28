import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { TeamManager } from "@/features/team/components/team-manager";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Equipo" };

export default async function TeamPage() {
  const user = await requireSession("/organizacion/equipo");
  if (!hasPermission(user, AUTH_PERMISSIONS.manageUsers)) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader user={user} active="equipo" />
      <main className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Equipo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Invita a tu equipo y elige qué puede hacer cada quien. Todos ven los avalúos de {user.organizationName}.
          </p>
        </div>
        <TeamManager />
      </main>
    </div>
  );
}
