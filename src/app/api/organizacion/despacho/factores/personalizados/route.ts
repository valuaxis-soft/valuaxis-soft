import { NextResponse } from "next/server";
import { AUTH_PERMISSIONS } from "@/features/auth/model";
import { customFactorSchema } from "@/features/firm/custom-factors";
import { addCustomFactor, getCustomFactors } from "@/features/firm/firm.service";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** The homologation factors the firm created, for everyone who works on valuations. */
export async function GET() {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.viewValuations);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: { factors: await getCustomFactors(auth.user.organizationId) } });
  } catch (error) {
    return internalError("CUSTOM_FACTORS_GET", error, "No se pudieron cargar los factores del despacho.");
  }
}

/** Creates a factor in the homologation: from then on the list offers it. */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(AUTH_PERMISSIONS.editValuations);
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, customFactorSchema);
    if (!body.ok) return body.response;
    return NextResponse.json({ data: await addCustomFactor(auth.user, body.data.label) });
  } catch (error) {
    return internalError("CUSTOM_FACTORS_ADD", error, "No se pudo guardar el factor.");
  }
}
