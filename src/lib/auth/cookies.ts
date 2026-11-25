import { cookies } from "next/headers";
import { AUTH_SESSION_COOKIE, LEGACY_AUTH_SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/features/auth/constants/auth.constants";
import { sessionCookieOptions, sessionTokenOf } from "@/lib/auth/session-cookie";

/** Writes the session under its name and clears the old name ("devpware_session"), if the browser still has it. */
export async function setSessionCookie(token: string, maxAgeSeconds = SESSION_TTL_SECONDS) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_SESSION_COOKIE, token, sessionCookieOptions(maxAgeSeconds));
  if (cookieStore.get(LEGACY_AUTH_SESSION_COOKIE)) cookieStore.delete(LEGACY_AUTH_SESSION_COOKIE);
}

export async function getSessionCookie() {
  return sessionTokenOf(await cookies());
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_SESSION_COOKIE);
  if (cookieStore.get(LEGACY_AUTH_SESSION_COOKIE)) cookieStore.delete(LEGACY_AUTH_SESSION_COOKIE);
}
