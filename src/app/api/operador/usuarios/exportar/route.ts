import { NextResponse } from "next/server";
import { auditUserDirectory } from "@/features/operator/user-directory-audit";
import { MAX_USER_DIRECTORY_EXPORT_ROWS, parseUserDirectoryParams } from "@/features/operator/user-directory-params";
import { listUserDirectoryForExport } from "@/features/operator/user-directory.repository";
import { buildUserDirectoryWorkbook } from "@/features/operator/user-directory-workbook";
import { todayInMexico } from "@/features/valuations/calculation/comparable-card";
import { internalError } from "@/lib/api-response";
import { requireOperatorApi } from "@/security/guards/operator-guard";
import { clientIp, createRateLimiter } from "@/security/rate-limit/rate-limiter";

/** The whole platform in one file: 5 a minute per operator is plenty. */
const exportLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 1000 });

/**
 * «Exportar a Excel» of /operador/usuarios: the same query string as the page
 * (search, filter and order; every page). Operator only (OPERATOR_EMAILS);
 * anyone else gets 404. Every export is audited.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireOperatorApi("/api/operador/usuarios/exportar");
    if (!auth.ok) return auth.response;
    const limit = exportLimiter.consume(`operator-user-export:${auth.user.id}`);
    if (!limit.allowed) return NextResponse.json({ error: "Demasiadas exportaciones seguidas. Espera un minuto." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

    const search = new URL(request.url).searchParams;
    const raw: Record<string, string> = {};
    for (const key of new Set(search.keys())) raw[key] = search.get(key) ?? "";
    const params = { ...parseUserDirectoryParams(raw), page: 1 };

    const { items, total } = await listUserDirectoryForExport(params, MAX_USER_DIRECTORY_EXPORT_ROWS);
    const buffer = await buildUserDirectoryWorkbook({ items, truncatedFrom: total });
    await auditUserDirectory({
      kind: "export",
      user: auth.user,
      params,
      rows: items.length,
      total,
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Usuarios-Valuaxis-${todayInMexico()}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return internalError("OPERATOR_USER_EXPORT", error, "No se pudo exportar la lista de usuarios.");
  }
}
