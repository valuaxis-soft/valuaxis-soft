import { NextResponse, type NextRequest } from "next/server";
import { AUTH_PUBLIC_PATHS, AUTH_SESSION_COOKIE } from "@/features/auth/constants/auth.constants";
import { buildPublicAppUrl, getPublicAppUrl } from "@/lib/public-url";
import { NONCE_HEADER, contentSecurityPolicy, createNonce } from "@/security/headers/security-headers";
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

  const isProtected = !isPublicPath(pathname) && !pathname.startsWith("/_next");
  if (isProtected && !request.cookies.get(AUTH_SESSION_COOKIE)?.value) {
    const loginUrl = buildPublicAppUrl("/iniciar-sesion");
    loginUrl.searchParams.set("reason", "required");
    loginUrl.searchParams.set("redirectTo", safeRedirectPath(pathname));
    return NextResponse.redirect(loginUrl);
  }

  return withContentSecurityPolicy(request);
}

/**
 * Pages get a per-request nonce. Next.js reads the CSP from the request headers
 * and applies the nonce to the scripts it renders.
 */
function withContentSecurityPolicy(request: NextRequest) {
  const nonce = createNonce();
  const policy = contentSecurityPolicy({
    development: process.env.NODE_ENV !== "production",
    nonce,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", policy);
  // For inline scripts the app renders itself (the theme script).
  requestHeaders.set(NONCE_HEADER, nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
