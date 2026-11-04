import { NextResponse } from "next/server";
import { z } from "zod";
import { auditValuation } from "@/features/valuations/services/valuation-audit";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { setValuationArchived } from "@/features/valuations/repositories/valuation.repository";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

const archiveSchema = z.object({ archived: z.boolean().default(true) });

/** Archives the valuation (out of the main list) or brings it back, with `archived: false`. */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/archivar">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;

    const body = await readJsonBody(request, archiveSchema);
    if (!body.ok) return body.response;

    const { id } = await params;
    const result = await setValuationArchived(id, auth.user.organizationId, body.data.archived);
    if (!result) return NextResponse.json({ error: "Avaluo no encontrado" }, { status: 404 });
    await auditValuation({ action: "ARCHIVE", user: auth.user, valuationPublicId: id, request, metadata: { archived: body.data.archived } });

    return NextResponse.json({ data: result });
  } catch (error) {
    return internalError("VALUATION_ARCHIVE", error, "No se pudo archivar el avalúo.");
  }
}
