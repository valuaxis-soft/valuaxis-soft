import { after, NextResponse } from "next/server";
import { notifyLowCredits, notifyValuationEvent } from "@/features/notifications/notification-events";
import { notifyResponsible } from "@/features/notifications/valuation-notices";
import { auditValuation } from "@/features/valuations/services/valuation-audit";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { concludeValuation } from "@/features/valuations/services/valuation-workflow.service";
import { requireApiUser } from "@/security/guards/api-guard";

export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/conclude">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.concludeValuations);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const result = await concludeValuation({ publicId: id, organizationId: auth.user.organizationId, user: auth.user });
    await auditValuation({ action: "CONCLUDE", user: auth.user, valuationPublicId: id, request });
    // Tell the responsible appraiser when someone else concluded their valuation.
    after(() => notifyResponsible("concluido", id, auth.user));
    // In the app: the responsible and the creator, and whoever sees the billing when few credits are left.
    if (!("alreadyConcluded" in result)) {
      after(async () => {
        await notifyValuationEvent("concluido", id, auth.user);
        await notifyLowCredits(auth.user.organizationId);
      });
    }
    return NextResponse.json({ data: result });
  } catch (error) {
    return valuationErrorResponse("VALUATION_CONCLUDE", error, "No se pudo concluir el avalúo.");
  }
}
