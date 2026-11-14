import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { findValuationPdf } from "@/features/valuations/services/valuation-history.service";
import { storageProvider } from "@/infrastructure/storage/storage-provider";
import { internalError } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** A PDF the valuation stored when it was generated: a redirect to a freshly signed URL. */
export async function GET(request: Request, { params }: RouteContext<"/api/avaluos/[id]/historial/pdf/[fileId]">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.exportValuations);
    if (!auth.ok) return auth.response;

    const { id, fileId } = await params;
    const file = await findValuationPdf(id, auth.user.organizationId, fileId);
    if (!file) return NextResponse.json({ error: "PDF no encontrado." }, { status: 404 });

    const url = await storageProvider.getPrivateDownloadUrl(file.SClaveObjeto);
    return NextResponse.redirect(new URL(url, request.url), { status: 302, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return internalError("VALUATION_HISTORY_PDF", error, "No se pudo abrir el PDF guardado.");
  }
}
