import { after, NextResponse } from "next/server";
import { notifyLowCredits } from "@/features/notifications/notification-events";
import { auditValuation } from "@/features/valuations/services/valuation-audit";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { phoneRequiredResponse } from "@/features/account/phone/phone-http";
import { accountSuspendedResponse } from "@/features/account/standing/account-standing-http";
import { saveValuation } from "@/features/valuations/actions/save-valuation.action";
import { listValuations } from "@/features/valuations/repositories/valuation.repository";
import { createValuationSchema } from "@/features/valuations/validations/valuation-api.schemas";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

export async function GET() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;

    return NextResponse.json({ data: await listValuations(auth.user.organizationId) });
  } catch (error) {
    return internalError("VALUATIONS_LIST", error, "No se pudieron obtener los avalúos.");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.createValuations);
    if (!auth.ok) return auth.response;
    const phoneRequired = await phoneRequiredResponse(auth.user.id);
    if (phoneRequired) return phoneRequired;
    const suspended = await accountSuspendedResponse(auth.user.id);
    if (suspended) return suspended;

    const body = await readJsonBody(request, createValuationSchema);
    if (!body.ok) return body.response;
    const input = body.data;

    const result = await saveValuation({
      title: input.title,
      clientName: input.clientName,
      appraisalTypeId: input.appraisalTypeId,
      propertyTypeId: input.propertyTypeId,
      operationTypeId: input.operationTypeId,
      appraisalKindOther: input.appraisalTypeOther,
      propertyKindOther: input.propertyTypeOther,
      valuationKindOther: input.operationTypeOther,
      appraisalClass: input.appraisalClass,
      essence: input.essence,
      templateId: input.templateId ?? null,
      responsibleUserId: input.responsibleUserId ?? auth.user.id,
      status: "NUEVO",
    });

    if (!result.ok) {
      // Without Avalúos Disponibles (and the charge on) the answer carries the page to buy them.
      return NextResponse.json(
        { error: result.error, code: result.code, missingCatalog: result.missingCatalog, ...(result.link ? { link: result.link } : {}) },
        { status: result.code === "NO_CREDITS" ? 409 : 400 },
      );
    }

    const publicId = result.data?.id;
    if (publicId) await auditValuation({ action: "CREATE", user: auth.user, valuationPublicId: publicId, request });
    // Creating consumed an Avalúo Disponible: with few left, whoever sees the billing hears about it.
    after(() => notifyLowCredits(auth.user.organizationId));
    return NextResponse.json(
      { data: { ok: true, publicId, valuationId: publicId, workspaceUrl: `/workspace?id=${publicId}` } },
      { status: 201 },
    );
  } catch (error) {
    return internalError("VALUATIONS_CREATE", error, "No se pudo crear el avalúo.");
  }
}
