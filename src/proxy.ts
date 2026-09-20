import { NextResponse, type NextRequest } from "next/server";
import { AUTH_PUBLIC_PATHS, AUTH_SESSION_COOKIE } from "@/features/auth/constants/auth.constants";
import { buildPublicAppUrl } from "@/lib/public-url";
import { safeRedirectPath } from "@/security/validation/redirect-safety";

const publicPaths = [...AUTH_PUBLIC_PATHS, "/favicon.ico", "/api"];

function isPublicPath(pathname: string) {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
