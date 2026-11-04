import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { CROQUIS_KINDS, latLonSchema, northArrowSchema, pinsForCroquis, type CroquisKind } from "@/features/maps/croquis";
import { renderAndStoreCroquis } from "@/features/maps/server/croquis-image.service";
import { getSubjectLocation } from "@/features/maps/server/subject-location.service";
import { findValuation } from "@/features/valuations/calculation/access";
import { ValuationWorkflowError } from "@/features/valuations/services/valuation-workflow/errors";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { prisma } from "@/infrastructure/database/prisma-client";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { uploadRateLimitResponse } from "@/security/rate-limit/upload-limit";

const bodySchema = z.object({
  kind: z.enum(CROQUIS_KINDS.map((item) => item.kind) as [CroquisKind, ...CroquisKind[]]),
  center: latLonSchema,
  zoom: z.number().int().min(1).max(21),
  clean: z.boolean(),
  northArrow: northArrowSchema,
  includeComparables: z.boolean(),
});

/**
 * "Aplicar al croquis": renders one croquis (macro, micro or the map of
 * comparables) with the stored pin of the subject and stores it as an image
 * of the valuation. The editor then puts it in its section and saves the
 * document as usual. Counts against the upload limit, like any image.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/croquis">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const limited = uploadRateLimitResponse(auth.user.id);
    if (limited) return limited;
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);
    if (!body.ok) return body.response;

    const valuation = await findValuation(prisma, id, auth.user.organizationId);
    if (valuation.BBloqueado) throw new ValuationWorkflowError("El avalúo está concluido; reábrelo para editarlo.", 409);
    const stored = await getSubjectLocation(id, auth.user.organizationId);
    if (!stored.location) throw new ValuationWorkflowError("Primero ubica el inmueble sujeto en el mapa.", 400);

    const { kind, center, zoom, clean, northArrow, includeComparables } = body.data;
    const image = await renderAndStoreCroquis(auth.user, {
      kind,
      center,
      zoom,
      subject: stored.location.point,
      clean,
      northArrow,
      pins: pinsForCroquis(kind, { includeComparables }, stored.comparables),
    });
    return NextResponse.json({ data: image }, { status: 201 });
  } catch (error) {
    return valuationErrorResponse("CROQUIS", error, "No se pudo generar el croquis.");
  }
}
