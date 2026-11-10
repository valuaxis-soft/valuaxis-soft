import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { PageContainer, PageHeader } from "@/features/dashboard/components/page-header";
import { getLetterhead } from "@/features/firm/firm.service";
import { TemplateManager } from "@/features/valuations/components/template-manager";
import { listValuationTemplates } from "@/features/valuations/services/valuation-template.service";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Plantillas" };

/** The firm's templates. Like their routes, only for those who edit valuations. */
export default async function TemplatesPage() {
  const user = await requireSession("/organizacion/plantillas");
  if (!hasPermission(user, AUTH_PERMISSIONS.editValuations)) redirect("/dashboard");

  const [templates, letterhead] = await Promise.all([listValuationTemplates(user.organizationId), getLetterhead(user.organizationId)]);

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} active="plantillas" />
      <PageContainer width="narrow">
        <PageHeader title="Plantillas" description={`Las plantillas de ${user.organizationName}: la estructura de un avalúo guardada con un nombre para empezar otros o importar sus bloques. Se guardan, o se reemplazan por una versión nueva, desde el editor con «Guardar como plantilla».`} />
        <TemplateManager initialTemplates={templates} canCreate={hasPermission(user, AUTH_PERMISSIONS.createValuations)} letterhead={letterhead} />
      </PageContainer>
    </div>
  );
}
