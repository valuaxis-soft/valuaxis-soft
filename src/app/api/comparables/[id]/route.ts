import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import {
  listComparables,
  setComparableIncluded,
} from "@/features/comparables/repositories/comparable.repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const comparable = (await listComparables({ organizationId: user.organizationId })).find(
      (item) => item.id === id,
    );

    if (!comparable) {
      return NextResponse.json({ error: "Comparable no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data: comparable });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al obtener comparable", details: String(error) },
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
    const comparable = await setComparableIncluded(id, user.organizationId, body.selected ?? true);
    if (!comparable) {
      return NextResponse.json({ error: "Comparable no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data: comparable });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al actualizar comparable", details: String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const comparable = await setComparableIncluded(id, user.organizationId, false);
    if (!comparable) {
      return NextResponse.json({ error: "Comparable no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      data: { id },
      message: "Comparable excluido correctamente",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al excluir comparable", details: String(error) },
      { status: 500 },
    );
  }
}
