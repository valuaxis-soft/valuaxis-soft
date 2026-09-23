import { NextResponse } from "next/server";
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
    return NextResponse.json({ data: result });
  } catch (error) {
    return valuationErrorResponse("VALUATION_CONCLUDE", error, "No se pudo concluir el avalúo.");
  }
}
