import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { UploadError } from "@/features/files/services/upload";
import { getComparableCard } from "@/features/valuations/calculation/comparable-card.service";
import { addBaseComparableImage, removeBaseComparableImage } from "@/features/valuations/comparable-base/comparable-base-write.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { uploadRateLimitResponse } from "@/security/rate-limit/upload-limit";

type Context = RouteContext<"/api/comparables/[comparableId]/pantalla">;

/** "Pantalla de referencia" of a comparable kept in the base without a valuation; a new one replaces the one before. */
export async function POST(request: Request, { params }: Context) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const limited = uploadRateLimitResponse(auth.user.id);
    if (limited) return limited;
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No se envió ninguna imagen." }, { status: 400 });
    const { comparableId } = await params;
    await addBaseComparableImage(auth.user, comparableId, file, "screenshot");
    return NextResponse.json({ data: await getComparableCard(comparableId, auth.user.organizationId) }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    return valuationErrorResponse("COMPARABLE_BASE_SCREENSHOT", error, "No se pudo guardar la pantalla de referencia.");
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const { comparableId } = await params;
    await removeBaseComparableImage(auth.user, comparableId, { screenshot: true });
    return NextResponse.json({ data: await getComparableCard(comparableId, auth.user.organizationId) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_BASE_SCREENSHOT_DELETE", error, "No se pudo quitar la pantalla de referencia.");
  }
}
