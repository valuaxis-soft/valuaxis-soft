import { NextResponse } from "next/server";
import { requireApiUser } from "@/security/guards/api-guard";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { listValuations } from "@/features/valuations/repositories/valuation.repository";

export async function GET() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const valuations = await listValuations(user.organizationId);

    return NextResponse.json({ data: valuations });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al obtener avaluos", details: String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.createValuations);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const body = await request.json();
    const { saveValuation } = await import("@/features/valuations/actions/save-valuation.action");
    const {
      appraisalTypeId,
      clientName,
      operationTypeId,
      propertyTypeId,
      responsibleUserId,
      templateId,
      title,
    } = body;

    if (!title || !appraisalTypeId || !propertyTypeId || !operationTypeId) {
      return NextResponse.json(
        { error: "Faltan campos requeridos para crear el avaluo" },
        { status: 400 },
      );
    }

    const result = await saveValuation({
      title,
      clientName,
      appraisalTypeId: Number(appraisalTypeId),
      propertyTypeId: Number(propertyTypeId),
      operationTypeId: Number(operationTypeId),
      templateId: templateId ? Number(templateId) : null,
      responsibleUserId: responsibleUserId ? Number(responsibleUserId) : user.id,
      status: "NUEVO",
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code, missingCatalog: result.missingCatalog },
        { status: 400 },
      );
    }

    const publicId = result.data?.id;
    return NextResponse.json(
      {
        data: {
          ok: true,
          publicId,
          valuationId: publicId,
          workspaceUrl: `/workspace?id=${publicId}`,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Error al crear avaluo", details: String(error) },
      { status: 500 },
    );
  }
}
