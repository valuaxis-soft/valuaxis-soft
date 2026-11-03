import { NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { deleteBaseComparables } from "@/features/valuations/comparable-base/comparable-base-write.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

const MAX_SELECTION = 500;

const selectionSchema = z.object({
  ids: z.array(z.uuid("Comparable inválido.")).min(1, "Marca al menos un comparable.").max(MAX_SELECTION, `Hasta ${MAX_SELECTION} comparables por vez.`),
});

/** "Eliminar" the selection: the comparables of the base without a valuation go; those of a valuation stay and are named. */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, selectionSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: await deleteBaseComparables(auth.user, body.data.ids) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_BASE_DELETE_MANY", error, "No se pudieron eliminar los comparables.");
  }
}
