import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { exportValuationComparables } from "@/features/valuations/comparable-base/comparable-export.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** The comparables of a valuation (one market with `tipo`, else all) as the master workbook, to edit and import back. */
export async function GET(request: Request, { params }: RouteContext<"/api/avaluos/[id]/mercado/comparables/exportar">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const typeText = new URL(request.url).searchParams.get("tipo");
    const type = typeText ? comparableTypeSchema.safeParse(typeText) : null;
    if (type && !type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
    const { id } = await params;
    const { buffer, folio } = await exportValuationComparables(auth.user, id, type?.data ?? null);
    const safeFolio = folio.replace(/[^\w.-]+/g, "_");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Comparables-${safeFolio}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return valuationErrorResponse("COMPARABLES_EXPORT", error, "No se pudieron exportar los comparables.");
  }
}
