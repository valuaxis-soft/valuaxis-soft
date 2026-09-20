import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/database/prisma-client";
import { getCurrentUser } from "@/features/auth/session";
import { getValuationSection } from "@/features/valuations/services/valuation-section.service";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sectionKey: string }> },
) {
  try {
    const { id, sectionKey } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const result = await getValuationSection({
      valuationId: id,
      sectionKey,
      organizationId: user.organizationId,
    });

    if (!result) {
      return NextResponse.json({ error: "Seccion no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ data: result.section, meta: result.definition });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al obtener seccion", details: String(error) },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; sectionKey: string }> },
) {
  try {
    const { id, sectionKey } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const result = await getValuationSection({
      valuationId: id,
      sectionKey,
      organizationId: user.organizationId,
    });
    if (!result) {
      return NextResponse.json({ error: "Seccion no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const valuation = await prisma.avaluo.findFirst({
      where: {
        UIdentificadorPublico: id,
        IdOrganizacion: user.organizationId,
        BActivo: true,
        DFechaEliminacion: null,
      },
      select: { IdVersionTrabajo: true },
    });
    if (!valuation?.IdVersionTrabajo) {
      return NextResponse.json({ error: "Version de trabajo no encontrada" }, { status: 404 });
    }

    const sections = await prisma.seccionDocumento.findMany({
      where: { IdVersionAvaluo: valuation.IdVersionTrabajo },
      select: { IdSeccionDocumento: true, SClave: true },
    });
    const canonical = getCanonicalSectionKey(result.section.id);
    const target = sections.find((section) => getCanonicalSectionKey(section.SClave) === canonical);
    if (!target) {
      return NextResponse.json({ error: "Seccion no encontrada" }, { status: 404 });
    }

    const updated = await prisma.seccionDocumento.update({
      where: { IdSeccionDocumento: target.IdSeccionDocumento },
      data: {
        SNombre: body.title,
        BVisible: true,
        BEliminable: false,
        IOrden: body.sortOrder,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al actualizar seccion", details: String(error) },
      { status: 500 },
    );
  }
}

export const PATCH = PUT;
