import { after, NextResponse } from "next/server";
import { z } from "zod";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { notifyValuationEvent } from "@/features/notifications/notification-events";
import type { ValuationEvent } from "@/features/notifications/notification-texts";
import { auditValuation } from "@/features/valuations/services/valuation-audit";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { changeReviewState, type ReviewAction } from "@/features/valuations/services/valuation-workflow.service";
import { REVIEW_NOTE_MAX_LENGTH } from "@/features/valuations/services/valuation-workflow/review";
import { readJsonBody } from "@/lib/api-response";
import { authorizeApiUser, requireApiUser } from "@/security/guards/api-guard";

const reviewSchema = z.object({
  action: z.enum(["enviar", "aprobar", "regresar"]),
  note: z.string().max(REVIEW_NOTE_MAX_LENGTH).nullish(),
}).strict();

/** Sending to review is the appraiser's (AVALUO_EDITAR); approving or returning it, the reviewer's (AVALUO_REVISAR). */
const PERMISSION_BY_ACTION: Record<ReviewAction, (typeof AUTH_PERMISSIONS)[keyof typeof AUTH_PERMISSIONS]> = {
  enviar: AUTH_PERMISSIONS.editValuations,
  aprobar: AUTH_PERMISSIONS.reviewValuations,
  regresar: AUTH_PERMISSIONS.reviewValuations,
};

const AUDIT_BY_ACTION = { enviar: "REVIEW_SUBMIT", aprobar: "REVIEW_APPROVE", regresar: "REVIEW_RETURN" } as const;

/** The notice each action leaves in the bell: to whoever reviews, or to the responsible and the creator. */
const NOTICE_BY_ACTION: Record<ReviewAction, ValuationEvent> = { enviar: "enviado_revision", aprobar: "aprobado", regresar: "regresado" };

/** «Enviar a revisión» (optional note), «Aprobar» (optional note) or «Regresar a edición» (reason required). */
export async function POST(request: Request, { params }: RouteContext<"/api/avaluos/[id]/revision">) {
  try {
    const auth = await requireApiUser([AUTH_PERMISSIONS.editValuations, AUTH_PERMISSIONS.reviewValuations]);
    if (!auth.ok) return auth.response;

    const body = await readJsonBody(request, reviewSchema);
    if (!body.ok) return body.response;
    const allowed = authorizeApiUser(auth.user, PERMISSION_BY_ACTION[body.data.action]);
    if (!allowed.ok) return allowed.response;

    const { id } = await params;
    const result = await changeReviewState({
      publicId: id,
      organizationId: auth.user.organizationId,
      user: auth.user,
      action: body.data.action,
      note: body.data.note,
    });
    if (!result.unchanged) {
      await auditValuation({ action: AUDIT_BY_ACTION[body.data.action], user: auth.user, valuationPublicId: id, request, metadata: { note: body.data.note?.trim() || null } });
      const reason = body.data.note?.trim() || null;
      after(() => notifyValuationEvent(NOTICE_BY_ACTION[body.data.action], id, auth.user, { reason }));
    }
    return NextResponse.json({ data: result });
  } catch (error) {
    return valuationErrorResponse("VALUATION_REVIEW", error, "No se pudo cambiar la revisión del avalúo.");
  }
}
