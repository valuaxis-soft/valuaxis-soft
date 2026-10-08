import { NextResponse } from "next/server";
import { draftDescriptiveText } from "@/features/ai/ai-assist.service";
import { AI_BODY_MAX_BYTES, aiErrorResponse, draftRequestSchema } from "@/features/ai/ai-http";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { clientIp } from "@/security/rate-limit/rate-limiter";

/**
 * "Redactar borrador": a paragraph for a descriptive field, written only
 * from the data the request carries. Nothing is saved: the appraiser inserts
 * or discards the draft and saves the valuation as usual.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/ia/redaccion">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, draftRequestSchema, { maxBytes: AI_BODY_MAX_BYTES });
    if (!body.ok) return body.response;
    const { id } = await params;
    const draft = await draftDescriptiveText(id, auth.user, body.data, {
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ data: draft });
  } catch (error) {
    return aiErrorResponse("AI_DRAFT_WRITE", error, "No se pudo redactar el borrador.");
  }
}
