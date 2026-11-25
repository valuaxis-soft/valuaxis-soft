import { NextResponse } from "next/server";
import { UploadError } from "@/features/files/services/upload";
import { FAILURE_SCREENSHOT_MAX_BYTES, failureReportSchema } from "@/features/support/failure-report";
import { createFailureReport, FailureReportError } from "@/features/support/failure-report.service";
import { internalError, issueInSpanish, tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { clientIp, createRateLimiter } from "@/security/rate-limit/rate-limiter";

export const runtime = "nodejs";

/** Each report emails the operator: 10 per user an hour. */
const reportLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

/**
 * «Reportar una falla» (matrix 1.9): the valuation (optional), the date, the
 * description and an optional screenshot. Any signed-in user, whatever the
 * role: it is about the person's use of the platform.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const limit = reportLimiter.consume(`support-report:${auth.user.id}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > FAILURE_SCREENSHOT_MAX_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "La captura pesa más de 10 MB." }, { status: 413 });
    }

    const form = await request.formData();
    const parsed = failureReportSchema.safeParse({
      valuationId: field(form, "valuationId") || null,
      happenedOn: field(form, "happenedOn"),
      description: field(form, "description"),
    });
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      return NextResponse.json({ error: issue ? issueInSpanish(issue) : "Los datos enviados no son válidos." }, { status: 400 });
    }
    const candidate = form.get("screenshot");
    const screenshot = candidate instanceof File && candidate.size > 0 ? candidate : null;
    if (screenshot && screenshot.size > FAILURE_SCREENSHOT_MAX_BYTES) {
      return NextResponse.json({ error: "La captura pesa más de 10 MB." }, { status: 413 });
    }

    const report = await createFailureReport(auth.user, parsed.data, screenshot, {
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ data: report }, { status: 201 });
  } catch (error) {
    if (error instanceof FailureReportError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: 400 });
    return internalError("SUPPORT_REPORT", error, "No se pudo enviar el reporte. Intenta de nuevo.");
  }
}
