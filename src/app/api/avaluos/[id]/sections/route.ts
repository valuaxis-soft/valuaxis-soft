import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/database/prisma-client";
import { getCurrentUser } from "@/features/auth/session";
import { getValuationByPublicId } from "@/features/valuations/repositories/valuation.repository";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";

type SectionUpdateInput = {
  id: string;
  label?: string;
  title?: string;
  enabled?: boolean;
  sortOrder?: number;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const valuation = await getValuationByPublicId(id, user.organizationId);
    if (!valuation) {
      return NextResponse.json({ error: "Avaluo no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data: valuation.sections });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al obtener secciones", details: String(error) },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const sections: unknown = body.sections;
    if (!Array.isArray(sections)) {
      return NextResponse.json({ error: "Se requiere un array de secciones" }, { status: 400 });
    }

    const valuation = await getValuationByPublicId(id, user.organizationId);
    if (!valuation) {
      return NextResponse.json({ error: "Avaluo no encontrado" }, { status: 404 });
    }

    const dbValuation = await prisma.avaluo.findFirst({
      where: {
        UIdentificadorPublico: id,
        IdOrganizacion: user.organizationId,
        BActivo: true,
        DFechaEliminacion: null,
      },
      select: { IdVersionTrabajo: true },
    });
    if (!dbValuation?.IdVersionTrabajo) {
      return NextResponse.json({ error: "Version de trabajo no encontrada" }, { status: 404 });
    }

    const existingSections = await prisma.seccionDocumento.findMany({
      where: { IdVersionAvaluo: dbValuation.IdVersionTrabajo },
      select: { IdSeccionDocumento: true, SClave: true },
    });

    const updated = await prisma.$transaction(
      (sections as SectionUpdateInput[]).flatMap((section) => {
        const canonical = getCanonicalSectionKey(section.id ?? section.label ?? "");
        const target = existingSections.find((item) => getCanonicalSectionKey(item.SClave) === canonical);
        if (!target) return [];
        return prisma.seccionDocumento.update({
          where: { IdSeccionDocumento: target.IdSeccionDocumento },
          data: {
            SNombre: section.title,
            BVisible: true,
            IOrden: section.sortOrder,
          },
        });
      }),
    );

    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al actualizar secciones", details: String(error) },
      { status: 500 },
    );
  }
}
