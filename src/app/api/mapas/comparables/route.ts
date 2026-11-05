import { NextResponse } from "next/server";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { listComparablePins } from "@/features/maps/base-map/base-map.service";
import { parseComparableListParams } from "@/features/valuations/comparable-base/comparable-list-params";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** The query string as the page receives it: a repeated key (several `tipo`) stays a list. */
export function searchParamsRecord(search: URLSearchParams) {
  const record: Record<string, string | string[]> = {};
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    record[key] = values.length === 1 ? values[0] : values;
  }
  return record;
}

/** The pins of the map of comparables, with the same filters as the list (/comparables?…). */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const params = parseComparableListParams(searchParamsRecord(new URL(request.url).searchParams));
    return NextResponse.json({ data: await listComparablePins(auth.user.organizationId, params) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_MAP", error, "No se pudo cargar el mapa de comparables.");
  }
}
