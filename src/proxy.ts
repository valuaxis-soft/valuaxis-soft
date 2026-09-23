import { NextResponse, type NextRequest } from "next/server";
import { AUTH_PUBLIC_PATHS, AUTH_SESSION_COOKIE } from "@/features/auth/constants/auth.constants";
import { buildPublicAppUrl, getPublicAppUrl } from "@/lib/public-url";
import { isSameOriginRequest } from "@/security/validation/origin";
import { safeRedirectPath } from "@/security/validation/redirect-safety";

const publicPaths = [...AUTH_PUBLIC_PATHS, "/favicon.ico", "/api"];

function isPublicPath(pathname: string) {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function allowedOrigins(request: NextRequest) {
  const origins = [request.nextUrl.origin];
  try {
    origins.push(getPublicAppUrl());
  } catch {
    // APP_URL missing in local tooling: the request's own origin still applies.
  }
  return origins;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CSRF: API calls that change data must come from our own pages.
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    const sameOrigin = isSameOriginRequest({
      method: request.method,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
      allowedOrigins: allowedOrigins(request),
    });
    if (!sameOrigin) {
      return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (isPublicPath(pathname) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(request.cookies.get(AUTH_SESSION_COOKIE)?.value);

  if (!hasSessionCookie) {
    const loginUrl = buildPublicAppUrl("/iniciar-sesion");
    loginUrl.searchParams.set("reason", "required");
    loginUrl.searchParams.set("redirectTo", safeRedirectPath(pathname));
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
