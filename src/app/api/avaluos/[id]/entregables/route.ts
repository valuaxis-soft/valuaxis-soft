import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { generateCalculationMemoryPdf } from "@/features/valuations/memory/calculation-memory-pdf.service";
import { dictamenPdfFilename, generateDictamenPdf } from "@/features/valuations/services/dictamen-pdf.service";
import { storedZip } from "@/features/valuations/services/stored-zip";
import { auditValuation } from "@/features/valuations/services/valuation-audit";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { PdfRenderError } from "@/infrastructure/pdf/chromium-pdf";
import { getSessionCookie } from "@/lib/auth/cookies";
import { tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { createRateLimiter } from "@/security/rate-limit/rate-limiter";

export const runtime = "nodejs";
export const maxDuration = 240;

/** Each request prints two PDFs: at most 5 per user every 10 minutes. */
const deliverablesLimiter = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });

/**
 * The two deliverables of a valuation in one .zip: the dictamen PDF (kept
 * with the valuation, as its own download) and the calculation memory PDF.
 * Same permission as each PDF; a concluded valuation prints its final version.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/entregables">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.exportValuations);
    if (!auth.ok) return auth.response;
    const limit = deliverablesLimiter.consume(`entregables:${auth.user.id}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const token = await getSessionCookie();
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    // One after the other: each starts a browser.
    const dictamen = await generateDictamenPdf(auth.user, id, token);
    const memory = await generateCalculationMemoryPdf(auth.user, id, token);
    const archive = storedZip([
      { name: dictamen.filename, data: dictamen.buffer },
      { name: memory.filename, data: memory.buffer },
    ]);
    const filename = dictamenPdfFilename(dictamen.folio).replace(/^Dictamen-/, "Entregables-").replace(/\.pdf$/, ".zip");
    await auditValuation({
      action: "EXPORT",
      user: auth.user,
      valuationPublicId: id,
      request,
      metadata: { format: "entregables-zip", final: dictamen.final, bytes: archive.length },
    });
    return new NextResponse(new Uint8Array(archive), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PdfRenderError) {
      console.error("[ENTREGABLES]", error, error.cause);
      return NextResponse.json({ error: "No se pudieron generar los PDF. Intenta de nuevo o descárgalos por separado." }, { status: 503 });
    }
    return valuationErrorResponse("ENTREGABLES", error, "No se pudieron generar los entregables.");
  }
}
