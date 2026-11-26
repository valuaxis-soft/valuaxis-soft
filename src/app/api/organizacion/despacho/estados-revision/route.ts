import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { saveReviewStatuses } from "@/features/firm/comparable-review-settings.service";
import { reviewStatusListSchema } from "@/features/valuations/calculation/comparable-review-checklist";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/**
 * «Estados de revisión» of the comparables (V8.12): the firm's list, edited
 * from «Revisión de comparables» by whoever reviews comparables, the same for
 * the whole firm. Answers the review settings with the new list. Reading it is
 * GET ../revision-comparables, with the checklist.
 */
export async function PUT(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, reviewStatusListSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: await saveReviewStatuses(auth.user, body.data) });
  } catch (error) {
    return internalError("COMPARABLE_REVIEW_STATUSES_SAVE", error, "No se pudieron guardar los estados de revisión.");
  }
}
