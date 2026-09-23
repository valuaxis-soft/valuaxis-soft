import { cookies } from "next/headers";
import { AUTH_SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/features/auth/constants/auth.constants";

export async function setSessionCookie(token: string, maxAgeSeconds = SESSION_TTL_SECONDS) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function getSessionCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_SESSION_COOKIE)?.value ?? null;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_SESSION_COOKIE);
}
