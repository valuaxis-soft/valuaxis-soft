import { NextResponse } from "next/server";
import {
  AccreditationError,
  getAccreditation,
  MAX_ACCREDITATION_UPLOAD_BYTES,
  submitAccreditation,
} from "@/features/accreditation/accreditation.service";
import { internalError, tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { clientIp, createRateLimiter } from "@/security/rate-limit/rate-limiter";

export const runtime = "nodejs";

/** Reading a QR decodes images: 10 uploads per user an hour. */
const accreditationLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

/** The signed-in user's own accreditation. Any user, whatever the role: it is about the person. */
export async function GET() {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: await getAccreditation(auth.user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return internalError("ACCREDITATION_GET", error, "No se pudo consultar la acreditación.");
  }
}

/** Uploads the constancia (PDF) or the image of its QR; the file is read and discarded. */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const limit = accreditationLimiter.consume(`accreditation:${auth.user.id}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_ACCREDITATION_UPLOAD_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "El archivo pesa más de 10 MB." }, { status: 413 });
    }
    const candidate = (await request.formData()).get("file");
    if (!(candidate instanceof File)) return NextResponse.json({ error: "No se envió ningún archivo." }, { status: 400 });

    const accreditation = await submitAccreditation({
      user: auth.user,
      bytes: new Uint8Array(await candidate.arrayBuffer()),
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ data: accreditation }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AccreditationError) return NextResponse.json({ error: error.message }, { status: error.status });
    return internalError("ACCREDITATION_UPLOAD", error, "No se pudo leer la constancia. Intenta de nuevo.");
  }
}
