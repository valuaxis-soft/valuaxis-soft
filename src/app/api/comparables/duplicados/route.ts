import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { findDuplicates } from "@/features/valuations/calculation/comparable-card.service";
import { duplicateProbeSchema } from "@/features/valuations/calculation/market-schemas";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** Comparables of the firm's base that are the same property as the one being captured in Comparables. Only reads. */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, duplicateProbeSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: await findDuplicates(null, auth.user.organizationId, body.data) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_BASE_DUPLICATES", error, "No se pudieron buscar duplicados.");
  }
}
