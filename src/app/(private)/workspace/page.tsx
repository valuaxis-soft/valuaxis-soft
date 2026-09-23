import { redirect } from "next/navigation";
import { CreateValuationForm } from "@/features/valuations/components/create-valuation-form";
import { ValuationWorkspace } from "@/features/valuations/components/workspace/valuation-workspace";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { requireSession } from "@/security/guards/require-session";
import { getValuationByPublicId } from "@/features/valuations/repositories/valuation.repository";
import { getValuationCreationCatalogs } from "@/features/valuations/services/valuation-catalogs.service";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; action?: string }>;
}) {
  const params = await searchParams;
  const user = await requireSession("/workspace");
  const valuationId = params.id || null;
  const action = params.action || null;

  if (action === "new") {
    if (!hasPermission(user, AUTH_PERMISSIONS.createValuations)) redirect("/dashboard");
    const catalogs = await getValuationCreationCatalogs(user.organizationId);
    return <CreateValuationForm catalogs={catalogs} />;
  }

  if (!valuationId || !hasPermission(user, AUTH_PERMISSIONS.viewValuations)) redirect("/dashboard");

  const initialValuation = await getValuationByPublicId(valuationId, user.organizationId);
  if (!initialValuation) redirect("/dashboard");

  return (
    <ValuationWorkspace
      currentUser={user}
      valuationId={valuationId}
      initialValuation={initialValuation}
    />
  );
}
