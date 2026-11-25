import { NextResponse } from "next/server";
import { acceptanceSchema } from "@/features/legal/consent-rules";
import { acceptCurrentDocuments } from "@/features/legal/consent.service";
import { sessionConsentContext } from "@/features/legal/session-consent-context";
import { internalError, readJsonBody, tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { createRateLimiter } from "@/security/rate-limit/rate-limiter";

const acceptLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 1000 });

/**
 * /aceptar-documentos: the signed-in person accepts the versions in force with
 * casillas 1 and T (`{ privacidad: true, terminos: true, mayorDeEdad?, versionIds }`).
 * 409 when the versions changed since the page was shown; 400 without the age declared.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const limit = acceptLimiter.consume(`accept:${auth.user.id}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = await readJsonBody(request, acceptanceSchema, { maxBytes: 2_000 });
    if (!body.ok) return body.response;
    const result = await acceptCurrentDocuments(
      { id: auth.user.id, email: auth.user.email },
      { versionIds: body.data.versionIds, adult: body.data.mayorDeEdad },
      sessionConsentContext(request),
    );
    if (!result.ok) {
      return result.reason === "DOCUMENTS_CHANGED"
        ? NextResponse.json({ error: "Los documentos se actualizaron. Recarga la página para ver la versión nueva." }, { status: 409 })
        : NextResponse.json({ error: "Declara que eres mayor de edad para continuar." }, { status: 400 });
    }
    return NextResponse.json({ data: { accepted: true } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return internalError("CONSENTS_ACCEPT", error, "No se pudo registrar tu aceptación.");
  }
}
