import { NextResponse } from "next/server";
import { z } from "zod";
import { aiErrorResponse } from "@/features/ai/ai-http";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { webSearchStatus } from "@/features/valuations/comparable-search/web-search.service";
import { requireApiUser } from "@/security/guards/api-guard";

const jobIdSchema = z.uuid();

/**
 * How a search started with POST ../buscar-ia is going: `running` with the
 * searches made so far, `done` with the listings found, or `failed` with the
 * reason. Only the person who started it, in their organization, can read it.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado/comparables/buscar-ia/[jobId]">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const { id, jobId } = await params;
    if (!jobIdSchema.safeParse(jobId).success) return NextResponse.json({ error: "Búsqueda inválida." }, { status: 400 });
    return NextResponse.json({ data: webSearchStatus(id, auth.user, jobId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return aiErrorResponse("AI_COMPARABLE_SEARCH_STATUS", error, "No se pudo consultar la búsqueda con IA.");
  }
}
