import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/features/auth/services/session.service";
import { listNotifications } from "@/features/notifications/notifications.service";
import { internalError } from "@/lib/api-response";
import { authorizeApiUser } from "@/security/guards/api-guard";

const querySchema = z.object({ limite: z.coerce.number().int().min(1).max(100).default(50) }).strict();

/**
 * The bell: the signed-in person's latest notices in the open firm (and their
 * personal ones) and how many are unread; `?limite=` from 1 to 100, 50 by
 * default. Any user: the notices are about the person. The bell asks every
 * minute, so this does not renew the session: an idle tab still expires.
 */
export async function GET(request: Request) {
  try {
    const session = await getCurrentSession();
    const auth = authorizeApiUser(session?.user ?? null);
    if (!auth.ok) return auth.response;
    const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return NextResponse.json({ error: "El límite debe ser un número de 1 a 100." }, { status: 400 });
    const data = await listNotifications(auth.user, { limit: query.data.limite });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return internalError("NOTIFICATIONS_LIST", error, "No se pudieron consultar tus notificaciones.");
  }
}
