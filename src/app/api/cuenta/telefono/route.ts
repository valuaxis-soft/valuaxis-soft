import { NextResponse } from "next/server";
import { getPhoneVerification } from "@/features/account/phone/phone-verification.service";
import { internalError } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";

/** The signed-in user's own phone and whether it is verified. Any user, whatever the role: it is about the person. */
export async function GET() {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: await getPhoneVerification(auth.user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return internalError("PHONE_GET", error, "No se pudo consultar tu teléfono.");
  }
}
