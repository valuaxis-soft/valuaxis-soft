import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { saveValuation } from "@/features/valuations/actions/save-valuation.action";
import { refreshLiveFormulas } from "@/features/valuations/calculation/live-formulas.service";
import { auditValuationDataChanges, auditValuationSave } from "@/features/valuations/services/valuation-audit";
import { valuationErrorResponse } from "@/features/valuations/services/valuation-error-response";
import {
  saveValuationSections,
  type CaratulaPayload,
  type SectionPayload,
} from "@/features/valuations/services/valuation-workflow.service";
import { saveFullValuationSchema } from "@/features/valuations/validations/valuation-api.schemas";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** A full valuation with images referenced by key, not embedded, stays well below this. */
const MAX_FULL_SAVE_BYTES = 5_000_000;

export async function PUT(request: Request, { params }: RouteContext<"/api/avaluos/[id]/full">) {
  const debug = process.env.VALUATION_SAVE_DEBUG === "1";
  // Known before anything can fail, so a failure is logged with the valuation it was saving.
  let valuationId: string | undefined;

  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const body = await readJsonBody(request, saveFullValuationSchema, { maxBytes: MAX_FULL_SAVE_BYTES });
    if (!body.ok) return body.response;
    const { sections = [], caratula, ...meta } = body.data;

    const { id } = await params;
    valuationId = id;
    if (debug) {
      console.log("[VALUATION_FULL] PUT received", {
        id,
        userId: user.id,
        organizationId: user.organizationId,
        sectionsCount: sections.length,
        caratula: Boolean(caratula),
      });
    }

    const result = await saveValuation({ id, ...meta });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: "status" in result && result.status ? result.status : 400 });

    const sectionResult = sections.length
      ? await saveValuationSections({
          publicId: id,
          organizationId: user.organizationId,
          sections: sections as SectionPayload[],
          caratula: caratula as CaratulaPayload | undefined,
          user,
        })
      : null;
    // The fields of the calculation panels that read the document follow it (live-formulas.service.ts).
    const liveFormulas = sectionResult ? await refreshLiveFormulas(id, user) : [];
    // The history: one «Guardó cambios» per person every few minutes, and what changed of the valuation's data.
    await auditValuationSave({ user, valuationPublicId: id, request });
    if ("changes" in result && result.changes?.length) await auditValuationDataChanges({ user, valuationPublicId: id, request, changes: result.changes });

    return NextResponse.json({
      data: { valuation: result.data, sections: sectionResult, liveFormulas },
      message: "Avaluo guardado correctamente.",
    });
  } catch (error) {
    return valuationErrorResponse("VALUATION_FULL", error, "No se pudo guardar el avalúo.", { valuationId });
  }
}
