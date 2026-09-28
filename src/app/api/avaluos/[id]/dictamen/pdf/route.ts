import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { generateDictamenPdf } from "@/features/valuations/services/dictamen-pdf.service";
import { auditValuation } from "@/features/valuations/services/valuation-audit";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { PdfRenderError } from "@/infrastructure/pdf/chromium-pdf";
import { getSessionCookie } from "@/lib/auth/cookies";
import { tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { createRateLimiter } from "@/security/rate-limit/rate-limiter";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Each PDF starts a browser: at most 10 per user every 10 minutes. */
const pdfLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });

/** Generates the dictamen PDF on the server, keeps it with the valuation and returns it. */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/dictamen/pdf">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.exportValuations);
    if (!auth.ok) return auth.response;
    const limit = pdfLimiter.consume(`dictamen-pdf:${auth.user.id}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const token = await getSessionCookie();
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const pdf = await generateDictamenPdf(auth.user, id, token);
    await auditValuation({
      action: "EXPORT",
      user: auth.user,
      valuationPublicId: id,
      request,
      metadata: { format: "pdf", final: pdf.final, bytes: pdf.buffer.length },
    });
    return new NextResponse(new Uint8Array(pdf.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PdfRenderError) {
      console.error("[DICTAMEN_PDF]", error, error.cause);
      return NextResponse.json({ error: "No se pudo generar el PDF. Intenta de nuevo o imprime desde el navegador." }, { status: 503 });
    }
    return valuationErrorResponse("DICTAMEN_PDF", error, "No se pudo generar el PDF.");
  }
}
