import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { addWebListingsSchema } from "@/features/valuations/comparable-search/web-listings";
import { addWebListings } from "@/features/valuations/comparable-search/web-search.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/**
 * «Crear fichas» (?tipo=): the listings chosen in «Buscar con IA» become
 * comparables of that market, «Sin revisar». It calls no AI: it works with
 * the search turned off too, on listings found before.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado/comparables/buscar-ia/fichas">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const type = comparableTypeSchema.safeParse(new URL(request.url).searchParams.get("tipo"));
    if (!type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
    const body = await readJsonBody(request, addWebListingsSchema);
    if (!body.ok) return body.response;
    const { id } = await params;
    const result = await addWebListings(id, auth.user, type.data, body.data.candidates);
    if (result.created || result.reused) {
      await recordAuditEvent({
        typeKey: "CREACION",
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
        entity: "Avaluo",
        entityId: id,
        action: "COMPARABLES_AI_SEARCH_ADD",
        result: "EXITOSO",
        metadata: { type: type.data, created: result.created, reused: result.reused, skipped: result.skipped },
      });
    }
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return valuationErrorResponse("COMPARABLES_AI_SEARCH_ADD", error, "No se pudieron crear las fichas.");
  }
}
