import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { recordAuditEvent } from "@/features/auth/repositories/audit.repository";
import { comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { getMarketCalculation } from "@/features/valuations/calculation/market.service";
import { addFoundComparables, searchComparables } from "@/features/valuations/comparable-search/comparable-search.service";
import { addFoundComparablesSchema, parseComparableSearchQuery } from "@/features/valuations/comparable-search/schemas";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { comparableSearchRateLimitResponse } from "@/security/rate-limit/search-limit";

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * Searches comparables for the valuation in every available source:
 * ?tipo=TERRENO_VENTA&q=arandas&supMin=&supMax=&precioMin=&precioMax=&limite=.
 * Reading is enough to search; adding the chosen results (POST) needs editing.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado/comparables/buscar">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const limited = comparableSearchRateLimitResponse(auth.user.id);
    if (limited) return limited;
    const parsed = parseComparableSearchQuery(new URL(request.url).searchParams);
    if (!parsed.ok) return badRequest(parsed.error);
    const { id } = await params;
    return NextResponse.json({ data: await searchComparables(id, auth.user, parsed.query) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLES_SEARCH", error, "No se pudieron buscar comparables.");
  }
}

/** Adds the results the appraiser chose as comparables of the valuation (?tipo=). */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado/comparables/buscar">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const type = comparableTypeSchema.safeParse(new URL(request.url).searchParams.get("tipo"));
    if (!type.success) return badRequest("Tipo de comparable inválido");
    const body = await readJsonBody(request, addFoundComparablesSchema);
    if (!body.ok) return body.response;
    const { id } = await params;
    const { added, skipped } = await addFoundComparables(id, auth.user, type.data, body.data);
    if (added) {
      await recordAuditEvent({
        typeKey: "CREACION",
        organizationId: auth.user.organizationId,
        userId: auth.user.id,
        entity: "Avaluo",
        entityId: id,
        action: "COMPARABLES_SEARCH_ADD",
        result: "EXITOSO",
        metadata: { type: type.data, added, skipped, sources: [...new Set(body.data.results.map((result) => result.sourceId))] },
      });
    }
    return NextResponse.json({
      data: { added, skipped, calculation: await getMarketCalculation(id, auth.user.organizationId, type.data) },
    }, { status: 201 });
  } catch (error) {
    return valuationErrorResponse("COMPARABLES_SEARCH_ADD", error, "No se pudieron agregar los comparables.");
  }
}
