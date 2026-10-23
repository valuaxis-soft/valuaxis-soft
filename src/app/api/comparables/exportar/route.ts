import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { todayInMexico } from "@/features/valuations/calculation/comparable-card";
import { exportFirmBase } from "@/features/valuations/comparable-base/comparable-export.service";
import { parseComparableListParams } from "@/features/valuations/comparable-base/comparable-list-params";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** The firm's base with the filters of /comparables (same query string), as the master workbook. */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const search = new URL(request.url).searchParams;
    const raw: Record<string, string | string[]> = {};
    for (const key of new Set(search.keys())) {
      const values = search.getAll(key);
      raw[key] = values.length > 1 ? values : values[0];
    }
    const { buffer, count, total } = await exportFirmBase(auth.user, parseComparableListParams(raw));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Comparables-Valuaxis-${todayInMexico()}.xlsx"`,
        "Cache-Control": "no-store",
        // How many went out of how many match: the export stops at MAX_EXPORT_ROWS.
        "X-Comparables-Exportados": String(count),
        "X-Comparables-Total": String(total),
      },
    });
  } catch (error) {
    return valuationErrorResponse("COMPARABLES_EXPORT", error, "No se pudieron exportar los comparables.");
  }
}
