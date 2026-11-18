import { NextResponse } from "next/server";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { comparableSuggestions } from "@/features/valuations/comparable-base/comparable-base.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { rateLimits } from "@/security/rate-limit/rate-limiter";

/**
 * `?tipo=`: what the comparable form offers while typing, from the firm's own
 * comparables (municipality, colonia, fraccionamiento, other types of road and
 * the characteristics of that type). Only reads, only the user's firm.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const limit = rateLimits.comparableSuggestions.consume(`comparable-suggestions:${auth.user.id}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const type = comparableTypeSchema.safeParse(new URL(request.url).searchParams.get("tipo"));
    if (!type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
    return NextResponse.json({ data: await comparableSuggestions(auth.user.organizationId, type.data) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_SUGGESTIONS", error, "No se pudieron leer las sugerencias.");
  }
}
