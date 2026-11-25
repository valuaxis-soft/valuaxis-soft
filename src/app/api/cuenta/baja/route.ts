import { NextResponse } from "next/server";
import { z } from "zod";
import { requestAccountClosure } from "@/features/account/standing/account-standing.service";
import { revokeCurrentSession } from "@/features/auth/services/session.service";
import { internalError, readJsonBody } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { clientIp } from "@/security/rate-limit/rate-limiter";

/** The person confirmed after reading the effects in «Mi cuenta» › «Baja de la cuenta». */
const closureSchema = z.object({ confirm: z.literal(true) }).strict();

/**
 * «Dar de baja mi cuenta» (Terms 14.2; docs/CUENTAS.md): records the request
 * with its date and time, blocks the access and ends this session. The
 * balance and the concluded valuations stay. Any user, about their own account.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const body = await readJsonBody(request, closureSchema, { maxBytes: 1_000 });
    if (!body.ok) return body.response;

    const result = await requestAccountClosure(
      { id: auth.user.id, name: auth.user.name, email: auth.user.email, organizationId: auth.user.organizationId },
      { ip: clientIp(request.headers), userAgent: request.headers.get("user-agent") },
    );
    await revokeCurrentSession();
    return NextResponse.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return internalError("ACCOUNT_CLOSURE", error, "No se pudo registrar la baja. Intenta de nuevo o escríbenos por correo.");
  }
}
