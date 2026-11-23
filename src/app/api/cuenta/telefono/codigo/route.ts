import { NextResponse } from "next/server";
import { z } from "zod";
import { phoneErrorResponse } from "@/features/account/phone/phone-http";
import { requestPhoneCode } from "@/features/account/phone/phone-verification.service";
import { readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { clientIp } from "@/security/rate-limit/rate-limiter";

export const runtime = "nodejs";

const sendCodeSchema = z.object({
  phone: z.string().trim().min(1, "Escribe tu teléfono.").max(40),
  channel: z.enum(["sms", "whatsapp"]),
}).strict();

/** Sends a verification code to the signed-in user's phone, by SMS or WhatsApp. */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, sendCodeSchema, { maxBytes: 2_000 });
    if (!body.ok) return body.response;

    const sent = await requestPhoneCode({
      user: auth.user,
      phone: body.data.phone,
      channel: body.data.channel,
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ data: sent }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return phoneErrorResponse("PHONE_SEND_CODE", error, "No se pudo enviar el código. Intenta de nuevo.");
  }
}
