import { cookies } from "next/headers";
import { createSecureToken, hashToken } from "@/security/tokens/token-hashing";

/**
 * The cookie of the registration session (Terms 3.2; matrix 2.1 and 3.2): a
 * random id, technical and first-party, that ties an acceptance to the browser
 * that gave it. Set on the first submit of «Crear cuenta», it lives one hour
 * and only on /registro. The log keeps its SHA-256, never the value.
 */
export const REGISTRATION_COOKIE = "valuaxis_registro";
const REGISTRATION_COOKIE_PATH = "/registro";
const REGISTRATION_COOKIE_SECONDS = 60 * 60;

/** The hash of this browser's registration cookie, creating the cookie when it has none (server actions only). */
export async function registrationCookieHash() {
  const store = await cookies();
  let value = store.get(REGISTRATION_COOKIE)?.value;
  if (!value || !/^[\w-]{32,128}$/.test(value)) {
    value = createSecureToken(32);
    store.set(REGISTRATION_COOKIE, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: REGISTRATION_COOKIE_PATH,
      maxAge: REGISTRATION_COOKIE_SECONDS,
    });
  }
  return hashToken(value);
}
