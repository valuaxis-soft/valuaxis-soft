import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { restoreValuationFromTrash } from "@/features/valuations/repositories/valuation-list.repository";
import { auditValuation } from "@/features/valuations/services/valuation-audit";
import { internalError } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** «Restaurar» from the trash (or «Deshacer» right after deleting): back to the list as it was. */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/restaurar">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const outcome = await restoreValuationFromTrash(id, auth.user.organizationId);
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    await auditValuation({ action: "RESTORE", user: auth.user, valuationPublicId: id, request, metadata: { folio: outcome.folio } });

    return NextResponse.json({ data: { id, folio: outcome.folio } });
  } catch (error) {
    return internalError("VALUATION_RESTORE", error, "No se pudo restaurar el avalúo.");
  }
}
