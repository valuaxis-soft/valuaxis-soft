import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { UploadError } from "@/features/files/services/upload";
import { comparableTypeSchema } from "@/features/valuations/calculation/market-schemas";
import { addComparablePhoto, getMarketCalculation, removeComparablePhoto } from "@/features/valuations/calculation/market.service";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { uploadRateLimitResponse } from "@/security/rate-limit/upload-limit";

type Context = RouteContext<"/api/avaluos/[id]/mercado/comparables/[comparableId]/fotos">;

export async function POST(request: Request, { params }: Context) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const limited = uploadRateLimitResponse(auth.user.id);
    if (limited) return limited;
    const url = new URL(request.url);
    const type = comparableTypeSchema.safeParse(url.searchParams.get("tipo"));
    if (!type.success) return NextResponse.json({ error: "Tipo de comparable inválido" }, { status: 400 });
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No se envió ninguna fotografía." }, { status: 400 });
    const { id, comparableId } = await params;
    await addComparablePhoto(id, auth.user, comparableId, file);
    return NextResponse.json({ data: await getMarketCalculation(id, auth.user.organizationId, type.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    return valuationErrorResponse("COMPARABLE_PHOTO", error, "No se pudo subir la fotografía.");
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const url = new URL(request.url);
    const type = comparableTypeSchema.safeParse(url.searchParams.get("tipo"));
    const photoId = url.searchParams.get("fotoId");
    if (!type.success || !photoId) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
    const { id, comparableId } = await params;
    await removeComparablePhoto(id, auth.user, comparableId, photoId);
    return NextResponse.json({ data: await getMarketCalculation(id, auth.user.organizationId, type.data) });
  } catch (error) {
    return valuationErrorResponse("COMPARABLE_PHOTO_DELETE", error, "No se pudo quitar la fotografía.");
  }
}
