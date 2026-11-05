import { NextResponse } from "next/server";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { comparablesAround } from "@/features/maps/base-map/base-map.service";
import { parseRadiusQuery } from "@/features/maps/base-map/radius";
import { parseComparableListParams } from "@/features/valuations/comparable-base/comparable-list-params";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { rateLimits } from "@/security/rate-limit/rate-limiter";

import { searchParamsRecord } from "../route";

/** "Buscar alrededor de": `?lat=&lon=&radio=` plus the filters of the list; closest first. */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const limit = rateLimits.comparableRadius.consume(`comparable-radius:${auth.user.id}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const search = new URL(request.url).searchParams;
    const query = parseRadiusQuery(search);
    if ("error" in query) return NextResponse.json({ error: query.error }, { status: 400 });
    const params = parseComparableListParams(searchParamsRecord(search));
    return NextResponse.json({ data: await comparablesAround(auth.user.organizationId, query.center, query.radius, params) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_MAP_RADIUS", error, "No se pudo buscar alrededor del punto.");
  }
}
