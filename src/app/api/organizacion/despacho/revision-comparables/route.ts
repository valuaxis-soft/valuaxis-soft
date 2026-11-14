import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { getComparableReviewSettings, saveComparableReviewSettings } from "@/features/firm/comparable-review-settings.service";
import { comparableReviewSettingsSchema } from "@/features/firm/firm-schemas";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** The firm's checklist of the comparable review, for everyone who reviews comparables. */
export async function GET() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: await getComparableReviewSettings(auth.user.organizationId) });
  } catch (error) {
    return internalError("COMPARABLE_REVIEW_SETTINGS_GET", error, "No se pudo cargar la lista de verificación.");
  }
}

/** Only the administrator changes it (Despacho). */
export async function PUT(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, comparableReviewSettingsSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: await saveComparableReviewSettings(auth.user, body.data) });
  } catch (error) {
    return internalError("COMPARABLE_REVIEW_SETTINGS_SAVE", error, "No se pudo guardar la lista de verificación.");
  }
}
