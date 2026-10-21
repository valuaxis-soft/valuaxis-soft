import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import { createValuationTemplate, listValuationTemplates } from "@/features/valuations/services/valuation-template.service";
import { createValuationTemplateSchema } from "@/features/valuations/validations/valuation-template.schemas";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** The firm's templates. Only those who edit valuations work with them. */
export async function GET() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;

    return NextResponse.json({ data: await listValuationTemplates(auth.user.organizationId) });
  } catch (error) {
    return internalError("TEMPLATES_LIST", error, "No se pudieron obtener las plantillas.");
  }
}

/**
 * Saves the document of one of the firm's valuations as a template; with
 * `replace`, as a new version of the one with that name (200).
 */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;

    const body = await readJsonBody(request, createValuationTemplateSchema);
    if (!body.ok) return body.response;

    const { replaced, ...template } = await createValuationTemplate({ user: auth.user, ...body.data });
    return NextResponse.json({ data: template }, { status: replaced ? 200 : 201 });
  } catch (error) {
    return valuationErrorResponse("TEMPLATES_CREATE", error, "No se pudo guardar la plantilla.");
  }
}
