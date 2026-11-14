import { NextResponse } from "next/server";
import { markNotificationsReadSchema } from "@/features/notifications/notification-types";
import { markNotificationsRead } from "@/features/notifications/notifications.service";
import { internalError, readJsonBody, tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { createRateLimiter } from "@/security/rate-limit/rate-limiter";

/** A click per notice: 120 a minute per person is more than anyone clicks. */
const markReadLimiter = createRateLimiter({ limit: 120, windowMs: 60 * 1000 });

/**
 * Marks notices as read: `{ ids: [uuid, …] }` (up to 100) or `{ all: true }`
 * («Marcar todas como leídas»). Only the person's own, in the open firm or
 * personal; an id of someone else's notice changes nothing. Answers the unread left.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const limit = markReadLimiter.consume(`notifications-read:${auth.user.id}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = await readJsonBody(request, markNotificationsReadSchema, { maxBytes: 16_000 });
    if (!body.ok) return body.response;
    const unreadCount = await markNotificationsRead(auth.user, body.data);
    return NextResponse.json({ data: { unreadCount } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return internalError("NOTIFICATIONS_MARK_READ", error, "No se pudieron marcar como leídas.");
  }
}
