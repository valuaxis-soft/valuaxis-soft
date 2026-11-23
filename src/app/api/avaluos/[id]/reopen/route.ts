import { after, NextResponse } from "next/server";
import { notifyValuationEvent } from "@/features/notifications/notification-events";
import { auditValuation } from "@/features/valuations/services/valuation-audit";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { reopenValuation } from "@/features/valuations/services/valuation-workflow.service";
import { reopenValuationSchema } from "@/features/valuations/validations/valuation-api.schemas";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { CONCLUDED_VALUATIONS_CAN_BE_REOPENED, REOPEN_NOT_AVAILABLE } from "@/features/valuations/lifecycle-rules";

export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/reopen">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.reopenValuations);
    if (!auth.ok) return auth.response;
    // The client's rule: nobody reopens a concluded valuation, whatever their role.
    if (!CONCLUDED_VALUATIONS_CAN_BE_REOPENED) return NextResponse.json({ error: REOPEN_NOT_AVAILABLE }, { status: 409 });

    const body = await readJsonBody(request, reopenValuationSchema);
    if (!body.ok) return body.response;

    const { id } = await params;
    const result = await reopenValuation({
      publicId: id,
      organizationId: auth.user.organizationId,
      user: auth.user,
      reason: body.data.reason,
      acceptedText: body.data.acceptedText,
    });
    await auditValuation({
      action: "REOPEN",
      user: auth.user,
      valuationPublicId: id,
      request,
      metadata: { reason: body.data.reason },
    });
    // The responsible and the creator see in the app that it was reopened, and why.
    if (!("alreadyOpen" in result)) after(() => notifyValuationEvent("reabierto", id, auth.user, { reason: body.data.reason }));
    return NextResponse.json({ data: result });
  } catch (error) {
    return valuationErrorResponse("VALUATION_REOPEN", error, "No se pudo reabrir el avalúo.");
  }
}
