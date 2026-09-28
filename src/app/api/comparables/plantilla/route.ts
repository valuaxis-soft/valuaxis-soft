import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { buildComparableTemplate } from "@/features/valuations/calculation/comparable-workbook";
import { comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { internalError } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

const FILE_NAMES = {
  TERRENO_VENTA: "Comparables-terrenos-Valuaxis.xlsx",
  INMUEBLE_VENTA: "Comparables-inmuebles-venta-Valuaxis.xlsx",
  INMUEBLE_RENTA: "Comparables-rentas-Valuaxis.xlsx",
} as const;

/** The Excel template to import comparables of one type. */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const type = comparableTypeSchema.safeParse(new URL(request.url).searchParams.get("tipo"));
    if (!type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
    const buffer = await buildComparableTemplate(type.data);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${FILE_NAMES[type.data]}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return internalError("COMPARABLE_TEMPLATE", error, "No se pudo generar la plantilla.");
  }
}
