import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { IMPORT_DESTINATIONS } from "@/features/valuations/calculation/comparable-master";
import { buildMasterWorkbook } from "@/features/valuations/calculation/comparable-master-workbook";
import { buildComparableTemplate } from "@/features/valuations/calculation/comparable-workbook";
import { comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { prisma } from "@/infrastructure/database/prisma-client";
import { internalError } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

const FILE_NAMES = {
  TERRENO_VENTA: "Comparables-terrenos-Valuaxis.xlsx",
  INMUEBLE_VENTA: "Comparables-inmuebles-venta-Valuaxis.xlsx",
  INMUEBLE_RENTA: "Comparables-rentas-Valuaxis.xlsx",
  TERRENO_RENTA: "Comparables-terrenos-renta-Valuaxis.xlsx",
} as const;
const MASTER_FILE_NAME = "Plantilla-maestra-comparables-Valuaxis.xlsx";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const xlsx = (buffer: Buffer, filename: string) => new NextResponse(new Uint8Array(buffer), {
  headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  },
});

/**
 * The Excel to import comparables: with `tipo`, the template of that market;
 * without it, the master workbook (any type, to a valuation, to the base or
 * both), with `destino` and the folio of the valuation `avaluo` already in its INICIO sheet.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const search = new URL(request.url).searchParams;
    const typeText = search.get("tipo");
    if (typeText) {
      const type = comparableTypeSchema.safeParse(typeText);
      if (!type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
      return xlsx(await buildComparableTemplate(type.data), FILE_NAMES[type.data]);
    }
    const destination = IMPORT_DESTINATIONS.find((item) => item === search.get("destino")) ?? "AMBOS";
    // From a valuation's market: its folio goes in INICIO, read within the user's organization.
    const valuationId = search.get("avaluo");
    const valuation = valuationId && UUID.test(valuationId)
      ? await prisma.avaluo.findFirst({
        where: { UIdentificadorPublico: valuationId, IdOrganizacion: auth.user.organizationId, BActivo: true, DFechaEliminacion: null },
        select: { SFolio: true },
      })
      : null;
    const folio = valuation?.SFolio ?? null;
    return xlsx(await buildMasterWorkbook({ destination, valuationFolio: folio }), MASTER_FILE_NAME);
  } catch (error) {
    return internalError("COMPARABLE_TEMPLATE", error, "No se pudo generar la plantilla.");
  }
}
