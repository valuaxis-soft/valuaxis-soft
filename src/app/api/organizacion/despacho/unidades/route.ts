import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { customUnitRenameSchema, customUnitSchema } from "@/features/firm/custom-units";
import { addCustomUnit, getCustomUnits, removeCustomUnit, renameCustomUnit } from "@/features/firm/firm.service";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** The units the firm typed in "Formato del valor" and confirmed, for everyone who works on valuations. */
export async function GET() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: { units: await getCustomUnits(auth.user.organizationId) } });
  } catch (error) {
    return internalError("CUSTOM_UNITS_GET", error, "No se pudieron cargar las unidades.");
  }
}

/** Confirms a unit typed in the editor: from then on the list offers it. */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, customUnitSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: { units: await addCustomUnit(auth.user, body.data.unit) } });
  } catch (error) {
    return internalError("CUSTOM_UNITS_ADD", error, "No se pudo guardar la unidad.");
  }
}

/** Renames a unit of the firm, from the firm's settings. */
export async function PATCH(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, customUnitRenameSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: { units: await renameCustomUnit(auth.user, body.data.unit, body.data.nextUnit) } });
  } catch (error) {
    return internalError("CUSTOM_UNITS_RENAME", error, "No se pudo renombrar la unidad.");
  }
}

/** Removes a unit from the firm's list, from the firm's settings. */
export async function DELETE(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, customUnitSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: { units: await removeCustomUnit(auth.user, body.data.unit) } });
  } catch (error) {
    return internalError("CUSTOM_UNITS_REMOVE", error, "No se pudo quitar la unidad.");
  }
}
