import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { getComparableCard } from "@/features/valuations/calculation/comparable-card.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { requireApiUser } from "@/security/guards/api-guard";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Ficha del comparable": a comparable of the firm's base, its evidence and the valuations it was used in. */
export async function GET(_request: Request, { params }: RouteContext<"/api/comparables/[comparableId]">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const { comparableId } = await params;
    if (!UUID.test(comparableId)) return NextResponse.json({ error: "Comparable no encontrado" }, { status: 404 });
    return NextResponse.json({ data: await getComparableCard(comparableId, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_CARD", error, "No se pudo cargar la ficha del comparable.");
  }
}
