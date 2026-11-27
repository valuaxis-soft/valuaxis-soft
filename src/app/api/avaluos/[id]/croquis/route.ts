import { NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { CROQUIS_KINDS, MAX_SUBJECT_LEGEND, croquisSettingsSchema, latLonSchema, northArrowSchema, pinsOfMarkets, type CroquisKind } from "@/features/maps/croquis";
import { COMPARABLE_TYPES } from "@/features/valuations/calculation/market-types";
import { MAX_LABEL_PLACEMENTS, croquisLabelPlacementSchema } from "@/features/maps/highlights";
import { freeLinesSchema } from "@/features/maps/free-lines";
import { isZoomStep } from "@/features/maps/map-styles";
import { streetHighlightsSchema } from "@/features/maps/highlights";
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
  /** Quarter steps since 27 nov 2026 (video 8.14). */
  zoom: z.number().min(1).max(21).refine(isZoomStep),
  /** Options of the on-screen map: the stored croquis is always the OpenStreetMap street drawing (no businesses, no photo), so they are accepted and not used. */
  clean: z.boolean(),
  northArrow: northArrowSchema,
  /** Whether this croquis carries the comparables (the map of comparables' own «Incluir comparables», or the macro and micro's). */
  includeComparables: z.boolean(),
  streets: streetHighlightsSchema,
  mapType: croquisSettingsSchema.shape.mapType,
  /** V5.7-14: the names placed by hand (where and at what angle); the others follow their street. */
  labels: z.array(croquisLabelPlacementSchema).max(MAX_LABEL_PLACEMENTS).optional(),
  /** «Trazo libre»: the lines drawn by hand. */
  lines: freeLinesSchema.optional(),
  /** Video 8.14: the markets of comparables this croquis shows; absent or empty, all of them. */
  markets: z.array(z.enum(COMPARABLE_TYPES)).max(COMPARABLE_TYPES.length).optional(),
  /** Video 8.14: the subject's name in the legend. */
  subjectLegend: z.string().trim().max(MAX_SUBJECT_LEGEND).optional(),
});

/**
 * "Generar croquis de localización": renders one croquis (macro, micro or the map of
 * comparables) with the stored pin of the subject and stores it as an image
 * of the valuation, with the highlighted streets of etapa 2 drawn on it,
 * over a base map drawn from OpenStreetMap (never a Google image).
 * The editor then puts it in its section and saves the document as usual.
 * Counts against the upload limit, like any image.
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

    const { kind, center, zoom, northArrow, includeComparables, streets, labels, lines, markets, subjectLegend } = body.data;
    const result = await renderAndStoreCroquis(auth.user, {
      kind,
      center,
      zoom,
      subject: stored.location.point,
      northArrow,
      pins: includeComparables ? pinsOfMarkets(stored.comparables, markets) : [],
      streets,
      labels,
      lines,
      address: stored.address,
      subjectLegend,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return valuationErrorResponse("CROQUIS", error, "No se pudo generar el croquis.");
  }
}
