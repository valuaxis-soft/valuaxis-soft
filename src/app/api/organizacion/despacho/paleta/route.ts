import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { getFirmDocumentPalette, saveFirmDocumentPalette } from "@/features/firm/document-palette.service";
import { firmDocumentPaletteSchema } from "@/features/firm/firm-schemas";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** The firm's colours of the dictamen, for everyone who opens a valuation («Usar los del despacho»). */
export async function GET() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: await getFirmDocumentPalette(auth.user.organizationId) });
  } catch (error) {
    return internalError("FIRM_DOCUMENT_PALETTE_GET", error, "No se pudieron cargar los colores del dictamen.");
  }
}

/** Only the administrator changes them (Despacho). */
export async function PUT(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, firmDocumentPaletteSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: await saveFirmDocumentPalette(auth.user, body.data.palette) });
  } catch (error) {
    return internalError("FIRM_DOCUMENT_PALETTE_SAVE", error, "No se pudieron guardar los colores del dictamen.");
  }
}
