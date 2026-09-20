import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/database/prisma-client";
import { getCurrentUser } from "@/features/auth/session";
import { getValuationSection } from "@/features/valuations/services/valuation-section.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sectionKey: string; blockId: string }> },
) {
  try {
    const { id, sectionKey, blockId } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const result = await getValuationSection({ valuationId: id, sectionKey, organizationId: user.organizationId });
    const block = result?.section.blocks.find((item) => item.id === blockId);

    if (!block) {
      return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data: block });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al obtener bloque", details: String(error) },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; sectionKey: string; blockId: string }> },
) {
  try {
    const { id, sectionKey, blockId } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const result = await getValuationSection({ valuationId: id, sectionKey, organizationId: user.organizationId });
    const exists = result?.section.blocks.some((item) => item.id === blockId);
    if (!exists) {
      return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const updated = await prisma.nodoDocumento.update({
      where: { IdNodoDocumento: Number(blockId) },
      data: {
        STitulo: body.title,
        BVisible: body.enabled,
        IOrden: body.sortOrder,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al actualizar bloque", details: String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; sectionKey: string; blockId: string }> },
) {
  try {
    const { id, sectionKey, blockId } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const result = await getValuationSection({ valuationId: id, sectionKey, organizationId: user.organizationId });
    const exists = result?.section.blocks.some((item) => item.id === blockId);
    if (!exists) {
      return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
    }

    await prisma.nodoDocumento.update({
      where: { IdNodoDocumento: Number(blockId) },
      data: { BVisible: false, DFechaEliminacion: new Date() },
    });

    return NextResponse.json({ data: { id: blockId }, message: "Bloque eliminado correctamente" });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al eliminar bloque", details: String(error) },
      { status: 500 },
    );
  }
}

export const PATCH = PUT;
