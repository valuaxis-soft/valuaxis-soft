import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { findDuplicates } from "@/features/valuations/calculation/comparable-card.service";
import { duplicateProbeSchema } from "@/features/valuations/calculation/market-schemas";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/**
 * Comparables of the firm's base that are the same property as the one sent
 * (same listing URL, same address, or same phone and price ±1 %). Only reads.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado/comparables/duplicados">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, duplicateProbeSchema);
    if (!body.ok) return body.response;
    const { id } = await params;
    return NextResponse.json({ data: await findDuplicates(id, auth.user.organizationId, body.data) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_DUPLICATES", error, "No se pudieron buscar duplicados.");
  }
}
