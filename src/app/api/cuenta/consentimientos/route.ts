import { NextResponse } from "next/server";
import { optionalConsentsPatchSchema } from "@/features/legal/consent-rules";
import { changeOptionalConsents, getPrivacyOverview } from "@/features/legal/consent.service";
import { sessionConsentContext } from "@/features/legal/session-consent-context";
import { internalError, readJsonBody, tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { createRateLimiter } from "@/security/rate-limit/rate-limiter";

/** A box at a time: 30 changes per person a minute is more than anyone clicks. */
const consentLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });

/** The person's own casillas 2 to 4 and every acceptance recorded. Any user: they are about the person. */
export async function GET() {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: await getPrivacyOverview(auth.user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return internalError("CONSENTS_GET", error, "No se pudieron consultar tus autorizaciones.");
  }
}

/**
 * Ticks or unticks casillas 2 to 4 (`{ comercial?, boletin?, estadistica? }`):
 * effective at once, and logged with every box (matrix 1.10 and 3.2).
 */
export async function PATCH(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const limit = consentLimiter.consume(`consents:${auth.user.id}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = await readJsonBody(request, optionalConsentsPatchSchema, { maxBytes: 2_000 });
    if (!body.ok) return body.response;
    const data = await changeOptionalConsents({ id: auth.user.id, email: auth.user.email }, body.data, sessionConsentContext(request));
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return internalError("CONSENTS_UPDATE", error, "No se pudo guardar tu autorización.");
  }
}
