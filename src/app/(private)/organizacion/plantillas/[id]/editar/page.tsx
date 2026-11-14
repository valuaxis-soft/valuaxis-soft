import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserPreferences } from "@/features/account/user-preferences.service";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { getCustomUnits, getLetterhead } from "@/features/firm/firm.service";
import { TemplateEditor } from "@/features/valuations/components/template-editor";
import { getValuationCreationCatalogs } from "@/features/valuations/services/valuation-catalogs.service";
import { getValuationTemplate } from "@/features/valuations/services/valuation-template.service";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Editar plantilla" };

/**
 * «Nueva plantilla» / «Editar plantilla»: the valuation editor on a template
 * of the firm. Like the templates' routes, only for those who edit valuations.
 */
export default async function TemplateEditorPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nueva?: string }>;
}) {
  const { id } = await params;
  // Just created with «Nueva plantilla»: its first save completes version 1.
  const justCreated = (await searchParams).nueva === "1";
  const user = await requireSession(`/organizacion/plantillas/${id}/editar`);
  if (!hasPermission(user, AUTH_PERMISSIONS.editValuations)) redirect("/dashboard");

  const [template, letterhead, customUnits, preferences, catalogs] = await Promise.all([
    getValuationTemplate(user.organizationId, id),
    getLetterhead(user.organizationId),
    getCustomUnits(user.organizationId),
    getUserPreferences(user.id),
    getValuationCreationCatalogs(user.organizationId),
  ]);
  if (!template) redirect("/organizacion/plantillas");

  return (
    // The editor needs a fixed-height shell, as in /workspace: its panels scroll on their own.
    <div className="flex h-dvh flex-col overflow-y-auto overscroll-none">
      <TemplateEditor
        currentUser={user}
        template={template}
        justCreated={justCreated && template.version === 1}
        letterhead={letterhead}
        customUnits={customUnits}
        autosaveSeconds={preferences.autosaveSeconds}
        appraisalTypes={catalogs.appraisalTypes}
        propertyTypes={catalogs.propertyTypes}
      />
    </div>
  );
}
