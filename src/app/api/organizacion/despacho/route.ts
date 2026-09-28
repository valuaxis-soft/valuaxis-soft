import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { firmSettingsSchema } from "@/features/firm/firm-schemas";
import { getFirmSettings, saveFirmSettings } from "@/features/firm/firm.service";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** The firm's letterhead and the defaults of new valuations. */
export async function GET() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: await getFirmSettings(auth.user.organizationId) });
  } catch (error) {
    return internalError("FIRM_GET", error, "No se pudieron cargar los datos del despacho.");
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.manageUsers);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, firmSettingsSchema);
    if (!body.ok) return body.response;
    await saveFirmSettings(auth.user, body.data);
    return NextResponse.json({ data: await getFirmSettings(auth.user.organizationId) });
  } catch (error) {
    return internalError("FIRM_SAVE", error, "No se pudieron guardar los datos del despacho.");
  }
}
