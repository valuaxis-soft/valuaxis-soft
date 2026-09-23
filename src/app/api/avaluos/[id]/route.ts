import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { saveValuation } from "@/features/valuations/actions/save-valuation.action";
import {
  getValuationByPublicId,
  softDeleteValuation,
} from "@/features/valuations/repositories/valuation.repository";
import { updateValuationMetaSchema } from "@/features/valuations/validations/valuation-api.schemas";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

export async function GET(_request: Request, { params }: RouteContext<"/api/avaluos/[id]">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const valuation = await getValuationByPublicId(id, auth.user.organizationId);
    if (!valuation) return NextResponse.json({ error: "Avaluo no encontrado" }, { status: 404 });

    return NextResponse.json({ data: valuation });
  } catch (error) {
    return internalError("VALUATION_GET", error, "No se pudo obtener el avalúo.");
  }
}

export async function PUT(request: Request, { params }: RouteContext<"/api/avaluos/[id]">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;

    const body = await readJsonBody(request, updateValuationMetaSchema);
    if (!body.ok) return body.response;

    const { id } = await params;
    const result = await saveValuation({ id, ...body.data });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({ data: result.data });
  } catch (error) {
    return internalError("VALUATION_UPDATE", error, "No se pudo actualizar el avalúo.");
  }
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/avaluos/[id]">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const deleted = await softDeleteValuation(id, auth.user.organizationId);
    if (!deleted) return NextResponse.json({ error: "Avaluo no encontrado" }, { status: 404 });

    return NextResponse.json({ data: { id }, message: "Avaluo eliminado correctamente" });
  } catch (error) {
    return internalError("VALUATION_DELETE", error, "No se pudo eliminar el avalúo.");
  }
}
