import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { purgeValuationFromTrash } from "@/features/valuations/repositories/valuation-list.repository";
import { auditValuation } from "@/features/valuations/services/valuation-audit";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** The folio, typed by the person as the confirmation the dialog asks for. */
const purgeSchema = z.object({ folio: z.string().trim().min(1).max(80) }).strict();

/**
 * «Eliminar definitivamente» a valuation of the trash: it can no longer be
 * restored. AVALUO_ELIMINAR_DEFINITIVO (ADMINISTRADOR, migration 059).
 */
export async function DELETE(request: Request, { params }: RouteContext<"/api/avaluos/[id]/definitivo">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.purgeValuations);
    if (!auth.ok) return auth.response;

    const body = await readJsonBody(request, purgeSchema);
    if (!body.ok) return body.response;

    const { id } = await params;
    const outcome = await purgeValuationFromTrash(id, auth.user.organizationId, body.data.folio);
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    await auditValuation({ action: "PURGE", user: auth.user, valuationPublicId: id, request, metadata: { folio: outcome.folio } });

    return NextResponse.json({ data: { id, folio: outcome.folio } });
  } catch (error) {
    return internalError("VALUATION_PURGE", error, "No se pudo eliminar el avalúo definitivamente.");
  }
}
