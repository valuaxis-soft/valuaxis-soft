import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { duplicateValuationTemplate } from "@/features/valuations/services/valuation-template.service";
import { duplicateValuationTemplateSchema } from "@/features/valuations/validations/valuation-template.schemas";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** «Duplicar»: the template's document and type under another name (409 when it is taken). */
export async function POST(request: Request, { params }: RouteContext<"/api/plantillas/[id]/duplicar">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;

    const body = await readJsonBody(request, duplicateValuationTemplateSchema);
    if (!body.ok) return body.response;

    const { id } = await params;
    const template = await duplicateValuationTemplate(auth.user, id, body.data.name);
    return template
      ? NextResponse.json({ data: template }, { status: 201 })
      : NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  } catch (error) {
    return valuationErrorResponse("TEMPLATE_DUPLICATE", error, "No se pudo duplicar la plantilla.");
  }
}
