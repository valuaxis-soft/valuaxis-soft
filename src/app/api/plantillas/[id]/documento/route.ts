import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import type { AppSection } from "@/features/valuations/model";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { saveValuationTemplateDocument } from "@/features/valuations/services/valuation-template.service";
import { saveTemplateDocumentSchema } from "@/features/valuations/validations/valuation-template.schemas";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** As large as a valuation's full save: a template holds the same document. */
const MAX_TEMPLATE_DOCUMENT_BYTES = 5_000_000;

/** «Editar plantilla»: saves the editor's document as the template's, without the client's data. */
export async function PUT(request: Request, { params }: RouteContext<"/api/plantillas/[id]/documento">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;

    const body = await readJsonBody(request, saveTemplateDocumentSchema, { maxBytes: MAX_TEMPLATE_DOCUMENT_BYTES });
    if (!body.ok) return body.response;

    const { id } = await params;
    const template = await saveValuationTemplateDocument({
      user: auth.user,
      publicId: id,
      // The schema checks the frame (sections, blocks, apartados with their lists); the document model is the editor's.
      sections: body.data.sections as unknown as AppSection[],
      version: body.data.version,
      sameSession: body.data.sameSession,
    });
    return template ? NextResponse.json({ data: template }) : NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  } catch (error) {
    return valuationErrorResponse("TEMPLATE_DOCUMENT_SAVE", error, "No se pudo guardar la plantilla.");
  }
}
