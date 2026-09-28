import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { sendDictamenByEmail } from "@/features/valuations/services/dictamen-email.service";
import { auditValuation } from "@/features/valuations/services/valuation-audit";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { dictamenEmailSchema } from "@/features/valuations/validations/dictamen-email.schema";
import { PdfRenderError } from "@/infrastructure/pdf/chromium-pdf";
import { getSessionCookie } from "@/lib/auth/cookies";
import { readJsonBody, tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { createRateLimiter } from "@/security/rate-limit/rate-limiter";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Emails leave in the firm's name: at most 20 per organization per hour. */
const emailLimiter = createRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });

/** Generates the dictamen PDF and emails it to the client. */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/dictamen/correo">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.exportValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, dictamenEmailSchema);
    if (!body.ok) return body.response;
    const limit = emailLimiter.consume(`dictamen-email:${auth.user.organizationId}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const token = await getSessionCookie();
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const sent = await sendDictamenByEmail(auth.user, id, token, body.data);
    await auditValuation({
      action: "EXPORT",
      user: auth.user,
      valuationPublicId: id,
      request,
      metadata: { format: "pdf", channel: "email", recipients: body.data.to.join(", "), bytes: sent.bytes },
    });
    return NextResponse.json({ data: { to: body.data.to } });
  } catch (error) {
    if (error instanceof PdfRenderError) {
      console.error("[DICTAMEN_EMAIL_PDF]", error, error.cause);
      return NextResponse.json({ error: "No se pudo generar el PDF para enviarlo. Intenta de nuevo." }, { status: 503 });
    }
    return valuationErrorResponse("DICTAMEN_EMAIL", error, "No se pudo enviar el dictamen.");
  }
}
