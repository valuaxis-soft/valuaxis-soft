import { NextResponse, type NextRequest } from "next/server";
import { completeGoogleOAuth, OAuthFlowError } from "@/features/auth/services/google-oauth.service";
import { buildPublicAppUrl } from "@/lib/public-url";
import { safeRedirectPath } from "@/security/validation/redirect-safety";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const result = await completeGoogleOAuth({
      request,
      code: request.nextUrl.searchParams.get("code"),
      state: request.nextUrl.searchParams.get("state"),
      providerError: request.nextUrl.searchParams.get("error"),
    });

    return NextResponse.redirect(buildPublicAppUrl(safeRedirectPath(result.redirectTo)));
  } catch (error) {
    const code = error instanceof OAuthFlowError ? error.code : "oauth_unknown_error";
    return NextResponse.redirect(buildPublicAppUrl(`/oauth/resultado?error=${encodeURIComponent(code)}`));
  }
}
