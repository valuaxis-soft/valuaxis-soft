import { NextResponse, type NextRequest } from "next/server";
import { startGoogleOAuth, OAuthFlowError } from "@/features/auth/services/google-oauth.service";
import { buildPublicAppUrl } from "@/lib/public-url";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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
