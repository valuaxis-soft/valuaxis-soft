import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { OAUTH_REQUEST_TTL_MINUTES } from "../constants/auth.constants";

/**
 * Binds a Google sign-in to the browser that started it. The cookie holds the
 * OAuth state and the PKCE code verifier. The callback only accepts a state
 * that matches this browser's cookie, so a stolen or planted callback URL
 * cannot log a victim into someone else's account (login CSRF).
 */
const OAUTH_BINDING_COOKIE = "valuaxis_oauth";
const COOKIE_PATH = "/api/auth/google";

export async function setOAuthBinding(state: string, codeVerifier: string) {
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_BINDING_COOKIE, `${state}.${codeVerifier}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: OAUTH_REQUEST_TTL_MINUTES * 60,
  });
}

/** Reads and removes the binding: each sign-in attempt can use it once. */
export async function takeOAuthBinding(): Promise<{ state: string; codeVerifier: string } | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(OAUTH_BINDING_COOKIE)?.value;
  cookieStore.delete({ name: OAUTH_BINDING_COOKIE, path: COOKIE_PATH });
  return parseOAuthBinding(value);
}

export function parseOAuthBinding(value: string | undefined | null) {
  if (!value) return null;
  const [state, codeVerifier, ...rest] = value.split(".");
  if (!state || !codeVerifier || rest.length) return null;
  return { state, codeVerifier };
}

export function statesMatch(expected: string, received: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
