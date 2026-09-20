import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getGoogleScopes,
  GoogleOAuthProvider,
  GoogleOAuthProviderError,
  loadGoogleOAuthConfig,
} from "../src/features/auth/providers/google-oauth.provider";

const config = {
  clientId: "google-client-id",
  clientSecret: "google-client-secret",
  redirectUri: "https://avaluos.devpware.network/api/auth/google/callback",
};

function testEnv(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

test("google oauth provider builds authorization url with minimal scopes and exact callback", () => {
  const provider = new GoogleOAuthProvider(config);
  const url = provider.buildAuthorizationUrl({
    state: "secure-state",
    nonce: "secure-nonce",
    returnTo: "/dashboard",
  });

  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "secure-state");
  assert.equal(url.searchParams.get("nonce"), "secure-nonce");
  assert.deepEqual(url.searchParams.get("scope")?.split(" "), ["openid", "email", "profile"]);
  assert.equal(url.toString().includes(config.clientSecret), false);
});

test("google oauth scopes do not request gmail drive calendar or extra APIs", () => {
  assert.deepEqual(getGoogleScopes(), ["openid", "email", "profile"]);
});

test("google oauth config reports missing required variables", () => {
  assert.throws(
    () =>
      loadGoogleOAuthConfig(testEnv({
        GOOGLE_CLIENT_ID: "google-client-id",
        APP_URL: "https://avaluos.devpware.network",
      })),
    (error) =>
      error instanceof GoogleOAuthProviderError &&
      error.message.includes("GOOGLE_CLIENT_SECRET") &&
      error.message.includes("GOOGLE_REDIRECT_URI"),
  );
});

test("google oauth token exchange rejects responses without id token", async () => {
  const provider = new GoogleOAuthProvider(config, async () => {
    return new Response(JSON.stringify({ access_token: "not-used" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  await assert.rejects(() => provider.exchangeCode("code"), GoogleOAuthProviderError);
});

test("google oauth token exchange sends code only to server token endpoint", async () => {
  let receivedBody = "";
  const provider = new GoogleOAuthProvider(config, async (_url, init) => {
    receivedBody = String(init?.body);
    return new Response(JSON.stringify({ id_token: "header.payload.signature" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  await provider.exchangeCode("server-code");

  assert.match(receivedBody, /grant_type=authorization_code/);
  assert.match(receivedBody, /code=server-code/);
  assert.match(
    receivedBody,
    /redirect_uri=https%3A%2F%2Favaluos\.devpware\.network%2Fapi%2Fauth%2Fgoogle%2Fcallback/,
  );
});

test("google oauth config requires redirect uri to match APP_URL callback", () => {
  assert.throws(
    () =>
      loadGoogleOAuthConfig(testEnv({
        GOOGLE_CLIENT_ID: "google-client-id",
        GOOGLE_CLIENT_SECRET: "google-client-secret",
        GOOGLE_REDIRECT_URI: "https://other.example/api/auth/google/callback",
        APP_URL: "https://avaluos.devpware.network",
        NODE_ENV: "production",
      })),
    (error) =>
      error instanceof GoogleOAuthProviderError &&
      error.message.includes("GOOGLE_REDIRECT_URI"),
  );
});
