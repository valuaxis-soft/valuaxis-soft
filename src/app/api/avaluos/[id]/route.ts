import { NextResponse } from "next/server";
import { requireApiUser } from "@/security/guards/api-guard";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import {
  getValuationByPublicId,
  softDeleteValuation,
} from "@/features/valuations/repositories/valuation.repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const valuation = await getValuationByPublicId(id, user.organizationId);

    if (!valuation) {
      return NextResponse.json({ error: "Avaluo no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data: valuation });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al obtener avaluo", details: String(error) },
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
    const body = await request.json();
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;

    const { saveValuation } = await import("@/features/valuations/actions/save-valuation.action");

    const result = await saveValuation({
      id,
      client: body.client,
      location: body.location,
      postalCode: body.postalCode,
      valuationKind: body.valuationKind,
      propertyKind: body.propertyKind,
      status: body.status,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ data: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al actualizar avaluo", details: String(error) },
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
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const deleted = await softDeleteValuation(id, user.organizationId);
    if (!deleted) {
      return NextResponse.json({ error: "Avaluo no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data: { id }, message: "Avaluo eliminado correctamente" });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al eliminar avaluo", details: String(error) },
      { status: 500 },
    );
  }
}
