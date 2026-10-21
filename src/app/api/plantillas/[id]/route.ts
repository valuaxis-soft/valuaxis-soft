import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import {
  deleteValuationTemplate,
  getValuationTemplate,
  updateValuationTemplate,
} from "@/features/valuations/services/valuation-template.service";
import { updateValuationTemplateSchema } from "@/features/valuations/validations/valuation-template.schemas";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

const notFound = () => NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });

/** The template with its document, to import Blocks from it. */
export async function GET(_request: Request, { params }: RouteContext<"/api/plantillas/[id]">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const template = await getValuationTemplate(auth.user.organizationId, id);
    return template ? NextResponse.json({ data: template }) : notFound();
  } catch (error) {
    return internalError("TEMPLATE_GET", error, "No se pudo obtener la plantilla.");
  }
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/plantillas/[id]">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;

    const body = await readJsonBody(request, updateValuationTemplateSchema);
    if (!body.ok) return body.response;

    const { id } = await params;
    const template = await updateValuationTemplate(auth.user.organizationId, id, body.data);
    return template ? NextResponse.json({ data: template }) : notFound();
  } catch (error) {
    return valuationErrorResponse("TEMPLATE_RENAME", error, "No se pudo cambiar el nombre de la plantilla.");
  }
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/plantillas/[id]">) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    return (await deleteValuationTemplate(auth.user.organizationId, id)) ? new NextResponse(null, { status: 204 }) : notFound();
  } catch (error) {
    return internalError("TEMPLATE_DELETE", error, "No se pudo eliminar la plantilla.");
  }
}
