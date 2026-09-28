import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { UploadError } from "@/features/files/services/upload";
import { deleteFirmLogo, replaceFirmLogo } from "@/features/firm/firm.service";
import { internalError } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { uploadRateLimitResponse } from "@/security/rate-limit/upload-limit";

/** Replaces the firm's logo; returns its temporary URL. */
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
