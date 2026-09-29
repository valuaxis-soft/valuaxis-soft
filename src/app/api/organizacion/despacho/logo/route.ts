import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { UploadError } from "@/features/files/services/upload";
import { deleteFirmLogo, replaceFirmLogo, signedLogoUrl } from "@/features/firm/firm.service";
import { internalError } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { uploadRateLimitResponse } from "@/security/rate-limit/upload-limit";

/** The firm's logo for any member: a redirect to a freshly signed URL. */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const url = await signedLogoUrl(auth.user.organizationId);
    if (!url) return NextResponse.json({ error: "Sin logotipo." }, { status: 404 });
    return NextResponse.redirect(new URL(url, request.url), { status: 302, headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    return internalError("FIRM_LOGO_GET", error, "No se pudo cargar el logotipo.");
  }
}

/** Replaces the firm's logo; returns its address. */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    const limited = uploadRateLimitResponse(auth.user.id);
    if (limited) return limited;
    const candidate = (await request.formData()).get("file");
    if (!(candidate instanceof File)) return NextResponse.json({ error: "No se envió ninguna imagen." }, { status: 400 });
    return NextResponse.json({ data: { logoUrl: await replaceFirmLogo(auth.user, candidate) } }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    return internalError("FIRM_LOGO", error, "No se pudo subir el logotipo.");
  }
}

export async function DELETE() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    await deleteFirmLogo(auth.user);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return internalError("FIRM_LOGO_DELETE", error, "No se pudo quitar el logotipo.");
  }
}
