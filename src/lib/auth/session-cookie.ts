/**
 * The session cookie's name changed from "devpware_session" to
 * "valuaxis_session" without signing anybody out: the new name is read first
 * and the old one is the fallback; only the new one is written, and the old
 * one is cleared on the next response that can write cookies. Free of
 * next/headers so the proxy can use it too.
 */
import { AUTH_SESSION_COOKIE, LEGACY_AUTH_SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/features/auth/constants/auth.constants";

type CookieReader = { get(name: string): { value: string } | undefined };
type CookieWriter = {
  set(name: string, value: string, options: ReturnType<typeof sessionCookieOptions>): unknown;
  delete(name: string): unknown;
};

export const sessionCookieOptions = (maxAgeSeconds = SESSION_TTL_SECONDS) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: maxAgeSeconds,
});

/** The session token a browser sends: under the new name, or under the old one. */
export function sessionTokenOf(cookies: CookieReader): string | null {
  return cookies.get(AUTH_SESSION_COOKIE)?.value || cookies.get(LEGACY_AUTH_SESSION_COOKIE)?.value || null;
}

/**
 * A browser that still carries the old cookie: the response gives it the
 * new one with the same session (unless it already has it) and clears the old.
 * The session's real expiry stays in the database.
 */
export function moveLegacySessionCookie(request: CookieReader, response: CookieWriter) {
  const legacy = request.get(LEGACY_AUTH_SESSION_COOKIE)?.value;
  if (legacy === undefined) return;
  if (legacy && !request.get(AUTH_SESSION_COOKIE)?.value) response.set(AUTH_SESSION_COOKIE, legacy, sessionCookieOptions());
  response.delete(LEGACY_AUTH_SESSION_COOKIE);
}
