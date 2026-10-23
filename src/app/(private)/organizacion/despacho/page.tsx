import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { FirmSettingsForm } from "@/features/firm/components/firm-settings-form";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Datos del despacho" };

export default async function FirmPage() {
  const user = await requireSession("/organizacion/despacho");
  if (!hasPermission(user, AUTH_PERMISSIONS.manageUsers)) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader user={user} active="despacho" />
      <main className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Datos del despacho</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            El membrete de los dictámenes de {user.organizationName} y los datos con que nace cada avalúo.
          </p>
        </div>
        <FirmSettingsForm />
      </main>
    </div>
  );
}
