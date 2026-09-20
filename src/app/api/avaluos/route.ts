import { NextResponse } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import { listValuations } from "@/features/valuations/repositories/valuation.repository";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

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
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

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
