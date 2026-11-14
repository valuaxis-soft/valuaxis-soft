import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { parseColumnsParam } from "@/features/dashboard/valuation-columns";
import { parseValuationListParams } from "@/features/dashboard/valuation-list-params";
import { MAX_VALUATION_EXPORT_ROWS, buildValuationListWorkbook } from "@/features/dashboard/valuation-list-workbook";
import { todayInMexico } from "@/features/valuations/calculation/comparable-card";
import { listValuationStatuses } from "@/features/valuations/repositories/valuation.repository";
import { listValuationsForExport } from "@/features/valuations/repositories/valuation-list.repository";
import { internalError } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { createRateLimiter } from "@/security/rate-limit/rate-limiter";

/** An export reads up to 5,000 rows: 10 a minute per person is more than anyone clicks. */
const exportLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 1000 });

/**
 * «Exportar a Excel» of /avaluos: the same query string as the list (filters
 * and order, every page) plus `columnas=folio,titulo,…`, the visible columns
 * in their order. `AVALUO_VER`, like the list.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const limit = exportLimiter.consume(`valuation-export:${auth.user.id}`);
    if (!limit.allowed) return NextResponse.json({ error: "Demasiadas exportaciones seguidas. Espera un minuto." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

    const search = new URL(request.url).searchParams;
    const raw: Record<string, string> = {};
    for (const key of new Set(search.keys())) raw[key] = search.get(key) ?? "";
    const statuses = await listValuationStatuses();
    const params = parseValuationListParams(raw, statuses.map((status) => status.key));
    const columns = parseColumnsParam(search.get("columnas"));

    const { items, total } = await listValuationsForExport({ organizationId: auth.user.organizationId, ...params }, MAX_VALUATION_EXPORT_ROWS);
    const buffer = await buildValuationListWorkbook({
      items,
      columns,
      sheetName: params.trash ? "Papelera" : params.archived ? "Avalúos archivados" : "Avalúos",
      truncatedFrom: total,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Avaluos-Valuaxis-${todayInMexico()}.xlsx"`,
        "Cache-Control": "no-store",
        "X-Avaluos-Exportados": String(items.length),
        "X-Avaluos-Total": String(total),
      },
    });
  } catch (error) {
    return internalError("VALUATIONS_EXPORT", error, "No se pudo exportar la lista de avalúos.");
  }
}
