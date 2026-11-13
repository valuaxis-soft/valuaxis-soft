import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { googleMapsBrowserKey } from "@/features/maps/server/google-maps-keys";
import { NONCE_HEADER } from "@/security/headers/security-headers";
import { valuationIssuerNotice } from "@/features/accreditation/accreditation.service";
import { CreateValuationForm } from "@/features/valuations/components/create-valuation-form";
import { ValuationWorkspace } from "@/features/valuations/components/workspace/valuation-workspace";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { hasPermission } from "@/features/auth/permissions";
import { requireSession } from "@/security/guards/require-session";
import { getValuationByPublicId } from "@/features/valuations/repositories/valuation.repository";
import { getCustomUnits, getLetterhead } from "@/features/firm/firm.service";
import { isAiEnabled } from "@/features/ai/ai-gateway-provider";
import { getValuationCreationCatalogs } from "@/features/valuations/services/valuation-catalogs.service";
import { getUserPreferences } from "@/features/account/user-preferences.service";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; action?: string; plantilla?: string }>;
}) {
  const params = await searchParams;
  const user = await requireSession("/workspace");
  const valuationId = params.id || null;
  const action = params.action || null;

  if (action === "new") {
    if (!hasPermission(user, AUTH_PERMISSIONS.createValuations)) redirect("/dashboard");
    const catalogs = await getValuationCreationCatalogs(user.organizationId);
    return <CreateValuationForm catalogs={catalogs} preselectedTemplate={params.plantilla ?? null} />;
  }

  if (!valuationId || !hasPermission(user, AUTH_PERMISSIONS.viewValuations)) redirect("/dashboard");

  const [initialValuation, letterhead, customUnits, preferences] = await Promise.all([
    getValuationByPublicId(valuationId, user.organizationId),
    getLetterhead(user.organizationId),
    getCustomUnits(user.organizationId),
    getUserPreferences(user.id),
  ]);
  if (!initialValuation) redirect("/dashboard");
  const issuerNotice = await valuationIssuerNotice(valuationId, user.organizationId);
  // Runtime variable: the Docker build has no production.env, the container loads it. The croquis panel loads Google Maps with it.
  const googleMapsKey = googleMapsBrowserKey();
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  return (
    <>
      {/* Google Maps copies the nonce of the first <style nonce> it finds onto the styles it injects; without one, the CSP blocks them. */}
      {googleMapsKey && <style nonce={nonce}>{".maps-style-nonce{}"}</style>}
      <ValuationWorkspace
        currentUser={user}
        letterhead={letterhead}
        customUnits={customUnits}
        autosaveSeconds={preferences.autosaveSeconds}
        valuationId={valuationId}
        initialValuation={initialValuation}
        aiEnabled={isAiEnabled()}
        googleMaps={{ apiKey: googleMapsKey, nonce }}
        unaccreditedNotice={issuerNotice.show ? { issuerIsCurrentUser: issuerNotice.issuerUserId === user.id } : null}
      />
    </>
  );
}
