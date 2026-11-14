import { NextResponse } from "next/server";
import { auditValuation, auditValuationDataChanges } from "@/features/valuations/services/valuation-audit";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { saveValuation } from "@/features/valuations/actions/save-valuation.action";
import { getValuationByPublicId } from "@/features/valuations/repositories/valuation.repository";
import { moveValuationToTrash } from "@/features/valuations/repositories/valuation-list.repository";
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
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: "status" in result && result.status ? result.status : 400 });
    if ("changes" in result && result.changes?.length) await auditValuationDataChanges({ user: auth.user, valuationPublicId: id, request, changes: result.changes });

    return NextResponse.json({ data: result.data });
  } catch (error) {
    return internalError("VALUATION_UPDATE", error, "No se pudo actualizar el avalúo.");
  }
}

/** «Eliminar»: to the trash, restorable for 30 days (POST …/restaurar); not deleted for good. */
export async function DELETE(request: Request, { params }: RouteContext<"/api/avaluos/[id]">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const deleted = await moveValuationToTrash(id, auth.user.organizationId);
    if (!deleted) return NextResponse.json({ error: "Avaluo no encontrado" }, { status: 404 });
    await auditValuation({ action: "DELETE", user: auth.user, valuationPublicId: id, request, metadata: { folio: deleted.folio } });

    return NextResponse.json({ data: { id, folio: deleted.folio }, message: "El avalúo se fue a la papelera." });
  } catch (error) {
    return internalError("VALUATION_DELETE", error, "No se pudo eliminar el avalúo.");
  }
}
