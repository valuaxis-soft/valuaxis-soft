import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPublicAppUrl, getPublicAppUrl, PublicAppUrlError } from "../src/lib/public-url";
import { safeRedirectPath } from "../src/security/validation/redirect-safety";

test("public app url allows localhost only in development and trims trailing slash", () => {
  assert.equal(
    getPublicAppUrl({ APP_URL: "http://localhost:3000/", NODE_ENV: "development" }),
    "http://localhost:3000",
  );
});

test("public app url accepts production https origin", () => {
  assert.equal(
    getPublicAppUrl({ APP_URL: "https://avaluos.devpware.network/", NODE_ENV: "production" }),
    "https://avaluos.devpware.network",
  );
});

test("public app url rejects localhost in production", () => {
  assert.throws(
    () => getPublicAppUrl({ APP_URL: "http://localhost:3000", NODE_ENV: "production" }),
    PublicAppUrlError,
  );
});

test("public app url builds verification links from APP_URL", () => {
  assert.equal(
    buildPublicAppUrl("/verificar-correo?token=abc", {
      APP_URL: "https://avaluos.devpware.network",
      NODE_ENV: "production",
    }).toString(),
    "https://avaluos.devpware.network/verificar-correo?token=abc",
  );
});

test("safe redirect path allows internal returnTo and blocks external variants", () => {
  assert.equal(safeRedirectPath("/dashboard"), "/dashboard");
  assert.equal(safeRedirectPath("/workspace/abc"), "/workspace/abc");
  assert.equal(safeRedirectPath("https://evil.example/dashboard"), "/dashboard");
  assert.equal(safeRedirectPath("//evil.example/dashboard"), "/dashboard");
  assert.equal(safeRedirectPath("/\\evil.example"), "/dashboard");
  assert.equal(safeRedirectPath("/no-permitida"), "/dashboard");
});

test("oauth success redirect can be built as an absolute APP_URL dashboard URL", () => {
  assert.equal(
    buildPublicAppUrl(safeRedirectPath(null), {
      APP_URL: "https://avaluos.devpware.network",
      NODE_ENV: "production",
    }).toString(),
    "https://avaluos.devpware.network/dashboard",
  );
});
