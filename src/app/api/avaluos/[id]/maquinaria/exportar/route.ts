import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { buildMachineryOffersWorkbook } from "@/features/valuations/calculation/machinery-export";
import { getMachineryCalculation } from "@/features/valuations/calculation/machinery.service";
import { canExportContact } from "@/features/valuations/comparable-base/comparable-export.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { prisma } from "@/infrastructure/database/prisma-client";
import { requireApiUser } from "@/security/guards/api-guard";

/** «Exportar Excel» of the machinery market (V8.13): its offers, one row each; contact only for who can edit comparables. */
export async function GET(_request: Request, { params }: RouteContext<"/api/avaluos/[id]/maquinaria/exportar">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const calculation = await getMachineryCalculation(id, auth.user.organizationId);
    const valuation = await prisma.avaluo.findFirst({
      where: { UIdentificadorPublico: id, IdOrganizacion: auth.user.organizationId, BActivo: true, DFechaEliminacion: null },
      select: { SFolio: true },
    });
    const folio = valuation?.SFolio ?? "avaluo";
    const buffer = await buildMachineryOffersWorkbook(calculation.market.offers, { includeContact: canExportContact(auth.user), folio });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Ofertas-maquinaria-${folio.replace(/[^\w.-]+/g, "_")}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return valuationErrorResponse("MACHINERY_EXPORT", error, "No se pudieron exportar las ofertas de maquinaria.");
  }
}
