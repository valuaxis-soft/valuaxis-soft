import { NextResponse } from "next/server";
import { proposeComparableFromListing } from "@/features/ai/ai-assist.service";
import { AI_BODY_MAX_BYTES, aiErrorResponse, listingRequestSchema } from "@/features/ai/ai-http";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { clientIp } from "@/security/rate-limit/rate-limiter";

/**
 * "Pegar anuncio": reads the facts of a listing the appraiser pasted and
 * proposes them for the comparable form, each with the fragment it came
 * from. Nothing is saved: the appraiser reviews and saves the comparable.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/ia/anuncio">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, listingRequestSchema, { maxBytes: AI_BODY_MAX_BYTES });
    if (!body.ok) return body.response;
    const { id } = await params;
    const proposal = await proposeComparableFromListing(id, auth.user, body.data, {
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ data: proposal });
  } catch (error) {
    return aiErrorResponse("AI_LISTING_EXTRACT", error, "No se pudieron leer los datos del anuncio.");
  }
}
