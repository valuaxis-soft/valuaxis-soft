import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { UploadError } from "@/features/files/services/upload";
import { comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { getMarketCalculation, removeComparableScreenshot, setComparableScreenshot } from "@/features/valuations/calculation/market.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { uploadRateLimitResponse } from "@/security/rate-limit/upload-limit";

type Context = RouteContext<"/api/avaluos/[id]/mercado/comparables/[comparableId]/pantalla">;

/** "Pantalla de referencia": the screenshot of the listing; a new one replaces the one before (?tipo=). */
export async function POST(request: Request, { params }: Context) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const limited = uploadRateLimitResponse(auth.user.id);
    if (limited) return limited;
    const type = comparableTypeSchema.safeParse(new URL(request.url).searchParams.get("tipo"));
    if (!type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No se envió ninguna imagen." }, { status: 400 });
    const { id, comparableId } = await params;
    await setComparableScreenshot(id, auth.user, comparableId, file);
    return NextResponse.json({ data: await getMarketCalculation(id, auth.user.organizationId, type.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    return valuationErrorResponse("COMPARABLE_SCREENSHOT", error, "No se pudo guardar la pantalla de referencia.");
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const type = comparableTypeSchema.safeParse(new URL(request.url).searchParams.get("tipo"));
    if (!type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
    const { id, comparableId } = await params;
    await removeComparableScreenshot(id, auth.user, comparableId);
    return NextResponse.json({ data: await getMarketCalculation(id, auth.user.organizationId, type.data) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_SCREENSHOT_DELETE", error, "No se pudo quitar la pantalla de referencia.");
  }
}
