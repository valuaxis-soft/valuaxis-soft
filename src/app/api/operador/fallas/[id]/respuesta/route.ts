import { NextResponse } from "next/server";
import { z } from "zod";
import { failureResponseSchema } from "@/features/support/failure-report";
import { FailureReportError, respondToFailureReport } from "@/features/support/failure-report.service";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireOperatorApi } from "@/security/guards/operator-guard";
import { clientIp } from "@/security/rate-limit/rate-limiter";

/**
 * The operator's response to a failure report (matrix 1.9 and 3.4): a status
 * and a text, recorded as a new row. Operator only (OPERATOR_EMAILS); anyone
 * else gets 404.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/operador/fallas/[id]/respuesta">) {
  try {
    const auth = await requireOperatorApi("/api/operador/fallas/respuesta");
    if (!auth.ok) return auth.response;
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const body = await readJsonBody(request, failureResponseSchema, { maxBytes: 20_000 });
    if (!body.ok) return body.response;
    await respondToFailureReport(auth.user, id, body.data, { ip: clientIp(request.headers), userAgent: request.headers.get("user-agent") });
    return NextResponse.json({ data: { id } });
  } catch (error) {
    if (error instanceof FailureReportError) return NextResponse.json({ error: error.message }, { status: error.status });
    return internalError("SUPPORT_RESPONSE", error, "No se pudo registrar la respuesta. Intenta de nuevo.");
  }
}
