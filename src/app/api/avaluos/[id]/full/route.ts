import { NextResponse } from "next/server";
import { requireApiUser } from "@/security/guards/api-guard";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { saveValuation } from "@/features/valuations/actions/save-valuation.action";
import { saveValuationSections } from "@/features/valuations/services/valuation-workflow.service";

export async function PUT(
  request: Request,
  { params }: RouteContext<"/api/avaluos/[id]/full">,
) {
  const debug = process.env.VALUATION_SAVE_DEBUG === "1";

  try {
    const { id } = await params;
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) {
      if (debug) console.error("[VALUATION_FULL] No autorizado para guardar", { id });
      return auth.response;
    }
    const { user } = auth;

    const body = await request.json();
    if (debug) {
      console.log("[VALUATION_FULL] PUT received", {
        id,
        userId: user.id,
        organizationId: user.organizationId,
        sectionsCount: Array.isArray(body.sections) ? body.sections.length : 0,
        caratula: Boolean(body.caratula),
      });
    }

    const result = await saveValuation({
      id,
      folio: body.folio,
      client: body.client,
      location: body.location,
      postalCode: body.postalCode,
      valuationKind: body.valuationKind,
      propertyKind: body.propertyKind,
      status: body.status,
    });

    if (!result.ok) {
      if (debug) console.error("[VALUATION_FULL] saveValuation returned error", { error: result.error, id });
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const sections = Array.isArray(body.sections) ? body.sections : [];
    let sectionResult = null;
    if (sections.length) {
      try {
        sectionResult = await saveValuationSections({
          publicId: id,
          organizationId: user.organizationId,
          sections,
          caratula: body.caratula,
          user,
        });
      } catch (error) {
        console.error("[VALUATION_FULL] saveValuationSections failed", {
          id,
          organizationId: user.organizationId,
          error,
          sectionsCount: sections.length,
        });
        return NextResponse.json(
          {
            error: "Error al guardar secciones del avalúo",
            details: debug ? String(error) : "Consulta los registros del servidor para más detalles.",
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      data: { valuation: result.data, sections: sectionResult },
      message: "Avaluo guardado correctamente.",
    });
  } catch (error) {
    console.error("[VALUATION_FULL] Unexpected error", error);
    return NextResponse.json(
      {
        error: "Error al guardar avaluo completo",
        details: process.env.VALUATION_SAVE_DEBUG === "1" ? String(error) : "Ocurrió un error interno",
      },
      { status: 500 },
    );
  }
}
