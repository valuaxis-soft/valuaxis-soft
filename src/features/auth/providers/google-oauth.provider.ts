import { createRemoteJWKSet, jwtVerify } from "jose";
import { hashToken } from "@/security/tokens/token-hashing";
import { getPublicAppUrl } from "@/lib/public-url";

export type GoogleOAuthProfile = {
  provider: "google";
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
};

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GoogleOAuthTokenResponse = {
  access_token?: string;
  expires_in?: number;
  id_token?: string;
  scope?: string;
  token_type?: string;
};

export class GoogleOAuthProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleOAuthProviderError";
  }
}

const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const GOOGLE_SCOPES = ["openid", "email", "profile"] as const;

const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

export class GoogleOAuthProvider {
  constructor(
    private readonly config: GoogleOAuthConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  buildAuthorizationUrl(input: { state: string; nonce: string; codeChallenge: string; returnTo: string }) {
    const url = new URL(GOOGLE_AUTHORIZATION_URL);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
    url.searchParams.set("state", input.state);
    url.searchParams.set("nonce", input.nonce);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "select_account");
    return url;
  }

  async exchangeCode(code: string, codeVerifier: string) {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: this.config.redirectUri,
    });

    const response = await this.fetcher(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      throw new GoogleOAuthProviderError("Google token exchange failed.");
    }

    const tokens = (await response.json()) as GoogleOAuthTokenResponse;
    if (!tokens.id_token) {
      throw new GoogleOAuthProviderError("Google did not return an id_token.");
    }

    return tokens;
  }

  async validateIdToken(idToken: string, expectedNonceHash: string): Promise<GoogleOAuthProfile> {
    const { payload } = await jwtVerify(idToken, googleJwks, {
      audience: this.config.clientId,
      issuer: [...GOOGLE_ISSUERS],
    });

    const nonce = readStringClaim(payload.nonce);
    if (!nonce || hashToken(nonce) !== expectedNonceHash) {
      throw new GoogleOAuthProviderError("Google nonce mismatch.");
    }

    const sub = readStringClaim(payload.sub);
    const email = readStringClaim(payload.email);
    const emailVerified = payload.email_verified === true;

    if (!sub || !email) {
      throw new GoogleOAuthProviderError("Google identity is incomplete.");
    }

    return {
      provider: "google",
      providerUserId: sub,
      email: email.trim().toLowerCase(),
      emailVerified,
      name: readStringClaim(payload.name),
      givenName: readStringClaim(payload.given_name),
      familyName: readStringClaim(payload.family_name),
      picture: readStringClaim(payload.picture),
    };
  }
}

export function loadGoogleOAuthConfig(environment: NodeJS.ProcessEnv = process.env): GoogleOAuthConfig {
  const missing = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "APP_URL"].filter(
    (key) => !environment[key],
  );

  if (missing.length > 0) {
    throw new GoogleOAuthProviderError(`Google OAuth requiere variables faltantes: ${missing.join(", ")}`);
  }

  const expectedRedirectUri = new URL("/api/auth/google/callback", getPublicAppUrl(environment)).toString();
  if (environment.GOOGLE_REDIRECT_URI !== expectedRedirectUri) {
    throw new GoogleOAuthProviderError("GOOGLE_REDIRECT_URI debe coincidir con APP_URL + /api/auth/google/callback");
  }

  return {
    clientId: environment.GOOGLE_CLIENT_ID!,
    clientSecret: environment.GOOGLE_CLIENT_SECRET!,
    redirectUri: environment.GOOGLE_REDIRECT_URI!,
  };
}

export function getGoogleScopes() {
  return [...GOOGLE_SCOPES];
}

function readStringClaim(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
