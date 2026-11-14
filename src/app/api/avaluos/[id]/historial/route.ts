import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { getValuationHistory } from "@/features/valuations/services/valuation-history.service";
import { internalError } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** «Historial»: who did what and when, and the versions V1, V2… with their stored PDFs. */
export async function GET(_request: Request, { params }: RouteContext<"/api/avaluos/[id]/historial">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const history = await getValuationHistory(id, auth.user.organizationId);
    if (!history) return NextResponse.json({ error: "Avaluo no encontrado" }, { status: 404 });
    return NextResponse.json({ data: history }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return internalError("VALUATION_HISTORY", error, "No se pudo consultar el historial del avalúo.");
  }
}
