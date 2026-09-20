import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/database/prisma-client";
import { getCurrentUser } from "@/features/auth/session";
import { getValuationSection } from "@/features/valuations/services/valuation-section.service";

type BlockUpdateInput = {
  id: string;
  title?: string;
  enabled?: boolean;
  sortOrder?: number;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sectionKey: string }> },
) {
  try {
    const { id, sectionKey } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const result = await getValuationSection({ valuationId: id, sectionKey, organizationId: user.organizationId });
    if (!result) {
      return NextResponse.json({ error: "Seccion no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ data: result.section.blocks });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al obtener bloques", details: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sectionKey: string }> },
) {
  try {
    const { id, sectionKey } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const result = await getValuationSection({ valuationId: id, sectionKey, organizationId: user.organizationId });
    if (!result) {
      return NextResponse.json({ error: "Seccion no encontrada" }, { status: 404 });
    }

    const [body, maxOrder, nodeType] = await Promise.all([
      request.json(),
      prisma.nodoDocumento.aggregate({
        where: { IdSeccionDocumento: Number(result.section.id), IdNodoPadre: null },
        _max: { IOrden: true },
      }),
      prisma.tipoNodoDocumento.findFirst({ where: { BActivo: true }, orderBy: { IOrden: "asc" } }),
    ]);

    if (!nodeType) {
      return NextResponse.json({ error: "No hay tipo de nodo activo configurado" }, { status: 400 });
    }

    const block = await prisma.nodoDocumento.create({
      data: {
        IdSeccionDocumento: Number(result.section.id),
        IdTipoNodoDocumento: nodeType.IdTipoNodoDocumento,
        SClave: body.label || body.title || "bloque",
        STitulo: body.title || "NUEVO BLOQUE",
        BVisible: body.enabled ?? true,
        IOrden: (maxOrder._max.IOrden ?? -1) + 1,
      },
    });

    return NextResponse.json({ data: block }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al crear bloque", details: String(error) },
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

    const result = await getValuationSection({ valuationId: id, sectionKey, organizationId: user.organizationId });
    if (!result) {
      return NextResponse.json({ error: "Seccion no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const blocks: unknown = body.blocks;
    if (!Array.isArray(blocks)) {
      return NextResponse.json({ error: "Se requiere un array de bloques" }, { status: 400 });
    }

    const updated = await prisma.$transaction(
      (blocks as BlockUpdateInput[]).map((block) =>
        prisma.nodoDocumento.update({
          where: { IdNodoDocumento: Number(block.id) },
          data: {
            STitulo: block.title,
            BVisible: block.enabled,
            IOrden: block.sortOrder,
          },
        }),
      ),
    );

    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al reordenar bloques", details: String(error) },
      { status: 500 },
    );
  }
}

export const PATCH = PUT;
