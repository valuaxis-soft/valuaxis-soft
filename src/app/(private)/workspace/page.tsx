import { redirect } from "next/navigation";
import { CreateValuationForm } from "@/features/valuations/components/create-valuation-form";
import { ValuationWorkspace } from "@/features/valuations/components/workspace/valuation-workspace";
import { getCurrentUser } from "@/features/auth/session";
import { getValuationByPublicId } from "@/features/valuations/repositories/valuation.repository";
import { getValuationCreationCatalogs } from "@/features/valuations/services/valuation-catalogs.service";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; action?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?reason=required");

  const params = await searchParams;
  const valuationId = params.id || null;
  const action = params.action || null;

  if (action === "new") {
    const catalogs = await getValuationCreationCatalogs(user.organizationId);
    return <CreateValuationForm catalogs={catalogs} />;
  }

  if (!valuationId) redirect("/dashboard");

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
