import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { duplicateBaseComparable } from "@/features/valuations/comparable-base/comparable-base-write.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { requireApiUser } from "@/security/guards/api-guard";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Duplicar": a copy of the comparable in the firm's base, with its own number. */
export async function POST(_request: Request, { params }: RouteContext<"/api/comparables/[comparableId]/duplicar">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const { comparableId } = await params;
    if (!UUID.test(comparableId)) return NextResponse.json({ error: "Comparable no encontrado" }, { status: 404 });
    return NextResponse.json({ data: await duplicateBaseComparable(auth.user, comparableId) }, { status: 201 });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_BASE_DUPLICATE", error, "No se pudo duplicar el comparable.");
  }
}
