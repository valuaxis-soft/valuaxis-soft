import { NextResponse, type NextRequest } from "next/server";
import { startGoogleOAuth, OAuthFlowError } from "@/features/auth/services/google-oauth.service";
import { buildPublicAppUrl } from "@/lib/public-url";
import { clientIp, rateLimits } from "@/security/rate-limit/rate-limiter";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!rateLimits.oauthStart.consume(`oauth:${clientIp(request.headers)}`).allowed) {
    return NextResponse.redirect(buildPublicAppUrl("/oauth/resultado?error=oauth_rate_limited"));
  }

  try {
    const authorizationUrl = await startGoogleOAuth({
      request,
      returnTo: request.nextUrl.searchParams.get("returnTo"),
    });
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    const code = error instanceof OAuthFlowError ? error.code : "oauth_unknown_error";
    return NextResponse.redirect(buildPublicAppUrl(`/oauth/resultado?error=${encodeURIComponent(code)}`));
  }
}
