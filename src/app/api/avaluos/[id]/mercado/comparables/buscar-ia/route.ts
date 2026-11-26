import { NextResponse } from "next/server";
import { AI_BODY_MAX_BYTES, aiErrorResponse } from "@/features/ai/ai-http";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { webSearchRequestSchema } from "@/features/valuations/comparable-search/web-listings";
import { startWebSearch, webSearchSetup } from "@/features/valuations/comparable-search/web-search.service";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { clientIp } from "@/security/rate-limit/rate-limiter";

const badType = () => NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });

/** ?destino=maquinaria: the search of the machinery panel; anything else, a market of the valuation. */
const targetOf = (request: Request) => (new URL(request.url).searchParams.get("destino") === "maquinaria" ? "machinery" as const : "market" as const);

/**
 * «Buscar con IA» (?tipo=, ?destino=maquinaria): whether it can run in this
 * installation, the request its box starts with, written from the subject of
 * the valuation, and the searches already made with their listings (V8.8).
 */
export async function GET(request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado/comparables/buscar-ia">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const type = comparableTypeSchema.safeParse(new URL(request.url).searchParams.get("tipo"));
    if (!type.success) return badType();
    const { id } = await params;
    return NextResponse.json({ data: await webSearchSetup(id, auth.user, type.data, targetOf(request)) });
  } catch (error) {
    return aiErrorResponse("AI_COMPARABLE_SEARCH", error, "No se pudo preparar la búsqueda con IA.");
  }
}

/**
 * Starts a search of listings on the web and answers at once with its id
 * (202): the search outlasts the 60 s of the reverse proxy, so its progress
 * and its results are asked for apart (./[jobId]). Reading is enough to
 * search, as with the firm's base; creating comparables needs editing.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado/comparables/buscar-ia">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const type = comparableTypeSchema.safeParse(new URL(request.url).searchParams.get("tipo"));
    if (!type.success) return badType();
    const body = await readJsonBody(request, webSearchRequestSchema, { maxBytes: AI_BODY_MAX_BYTES * 2 });
    if (!body.ok) return body.response;
    const { id } = await params;
    const started = await startWebSearch(id, auth.user, { type: type.data, ...body.data }, {
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ data: started }, { status: 202 });
  } catch (error) {
    return aiErrorResponse("AI_COMPARABLE_SEARCH", error, "No se pudo iniciar la búsqueda con IA.");
  }
}
