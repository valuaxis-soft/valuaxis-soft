import { NextResponse } from "next/server";
import { z } from "zod";
import { phoneErrorResponse } from "@/features/account/phone/phone-http";
import { confirmPhoneCode } from "@/features/account/phone/phone-verification.service";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { clientIp } from "@/security/rate-limit/rate-limiter";

export const runtime = "nodejs";

const checkCodeSchema = z.object({
  phone: z.string().trim().min(1, "Escribe tu teléfono.").max(40),
  code: z.string().trim().regex(/^\d{4,10}$/, "El código son los dígitos que te llegaron."),
}).strict();

/** Confirms the code sent to the signed-in user's phone; answers the phone verified. */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, checkCodeSchema, { maxBytes: 2_000 });
    if (!body.ok) return body.response;

    const view = await confirmPhoneCode({
      user: auth.user,
      phone: body.data.phone,
      code: body.data.code,
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ data: view }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return phoneErrorResponse("PHONE_CHECK_CODE", error, "No se pudo verificar el código. Intenta de nuevo.");
  }
}
