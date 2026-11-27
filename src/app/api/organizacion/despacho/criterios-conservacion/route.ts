import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { removeCriterionSchema, savedCriterionSchema } from "@/features/firm/conservation-criteria";
import { getSavedCriteria, removeCriterion, saveCriterion } from "@/features/firm/firm.service";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** The «Criterio propio» of conservation kept by the firm and by the user, for everyone who works on valuations. */
export async function GET() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: { criteria: await getSavedCriteria(auth.user) } });
  } catch (error) {
    return internalError("CONSERVATION_CRITERIA_GET", error, "No se pudieron cargar los criterios guardados.");
  }
}

/** Keeps a criterion for the firm (its team) or for the user alone: from then on the list of criteria offers it. */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, savedCriterionSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: { criteria: await saveCriterion(auth.user, body.data) } });
  } catch (error) {
    return internalError("CONSERVATION_CRITERIA_SAVE", error, "No se pudo guardar el criterio.");
  }
}

/** Takes a kept criterion out; a personal one, only its owner's. */
export async function DELETE(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, removeCriterionSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: { criteria: await removeCriterion(auth.user, body.data.name, body.data.scope) } });
  } catch (error) {
    return internalError("CONSERVATION_CRITERIA_REMOVE", error, "No se pudo quitar el criterio.");
  }
}
