import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { DashboardHeader } from "@/features/dashboard/components/header";
import { PageContainer, PageHeader } from "@/features/dashboard/components/page-header";
import { getLetterhead } from "@/features/firm/firm.service";
import { TemplateManager } from "@/features/valuations/components/template-manager";
import { getValuationCreationCatalogs } from "@/features/valuations/services/valuation-catalogs.service";
import { listValuationTemplates } from "@/features/valuations/services/valuation-template.service";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Plantillas" };

/** The firm's templates. Like their routes, only for those who edit valuations. */
export default async function TemplatesPage() {
  const user = await requireSession("/organizacion/plantillas");
  if (!hasPermission(user, AUTH_PERMISSIONS.editValuations)) redirect("/dashboard");

  const [templates, letterhead, catalogs] = await Promise.all([
    listValuationTemplates(user.organizationId),
    getLetterhead(user.organizationId),
    getValuationCreationCatalogs(user.organizationId),
  ]);

  return (
    <div className="min-h-dvh bg-background">
      <DashboardHeader user={user} active="plantillas" />
      <PageContainer width="narrow">
        <PageHeader title="Plantillas" description={`Las plantillas de ${user.organizationName}: la estructura de un avalúo guardada con un nombre para empezar otros o importar sus bloques. Se arman desde cero con «Nueva plantilla» y se cambian con «Editar», en el mismo editor del avalúo; también se guardan desde un avalúo con «Guardar como plantilla».`} />
        <TemplateManager
          initialTemplates={templates}
          canCreate={hasPermission(user, AUTH_PERMISSIONS.createValuations)}
          letterhead={letterhead}
          appraisalTypes={catalogs.appraisalTypes}
          propertyTypes={catalogs.propertyTypes}
        />
      </PageContainer>
    </div>
  );
}
