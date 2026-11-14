import { NextResponse } from "next/server";
import { userPreferencesPatchSchema } from "@/features/account/user-preferences";
import { getAccountPreferences, updateNotificationPreferences, updateUserPreferences } from "@/features/account/user-preferences.service";
import { internalError, readJsonBody, tooManyRequests } from "@/lib/api-response";
import { requireApiUser } from "@/security/guards/api-guard";
import { createRateLimiter } from "@/security/rate-limit/rate-limiter";

/** A choice in a list: 30 changes per user a minute is more than anyone clicks. */
const preferencesLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });

/** The signed-in user's own preferences. Any user, whatever the role: they are about the person. */
export async function GET() {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    return NextResponse.json({ data: await getAccountPreferences(auth.user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return internalError("PREFERENCES_GET", error, "No se pudieron consultar tus preferencias.");
  }
}

/**
 * Changes the user's own preferences: `{ autosaveSeconds?: 0 | 10 | 15 | 30 | 60 | 300, valuationListColumns?: { columns },
 * notifications?: { equipo?: boolean, … } }`. What is not sent stays as it was.
 */
export async function PATCH(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const limit = preferencesLimiter.consume(`preferences:${auth.user.id}`);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);
    const body = await readJsonBody(request, userPreferencesPatchSchema);
    if (!body.ok) return body.response;
    const { notifications, ...preferences } = body.data;
    if (preferences.autosaveSeconds !== undefined || preferences.valuationListColumns !== undefined) await updateUserPreferences(auth.user.id, preferences);
    if (notifications) await updateNotificationPreferences(auth.user.id, notifications);
    return NextResponse.json({ data: await getAccountPreferences(auth.user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return internalError("PREFERENCES_UPDATE", error, "No se pudieron guardar tus preferencias.");
  }
}
