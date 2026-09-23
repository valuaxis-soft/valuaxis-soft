import assert from "node:assert/strict";
import test from "node:test";
import { readJsonBody, internalError } from "../src/lib/api-response";
import { createRateLimiter, clientIp } from "../src/security/rate-limit/rate-limiter";
import { isSameOriginRequest } from "../src/security/validation/origin";
import { contentSecurityPolicy, securityHeaders } from "../src/security/headers/security-headers";
import {
  createValuationSchema,
  reopenValuationSchema,
  saveFullValuationSchema,
} from "../src/features/valuations/validations/valuation-api.schemas";
import { valuationErrorResponse } from "../src/features/valuations/services/valuation-error-response";
import { ValuationWorkflowError } from "../src/features/valuations/services/valuation-workflow.service";

/* ------------------------------------------------------------------ */
/*  Rate limiting                                                      */
/* ------------------------------------------------------------------ */

test("the rate limiter allows up to the limit and then blocks with a retry time", () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
  const now = 1_000_000;
  assert.equal(limiter.consume("ip", now).allowed, true);
  assert.equal(limiter.consume("ip", now).allowed, true);
  assert.equal(limiter.consume("ip", now).allowed, true);
  const blocked = limiter.consume("ip", now + 10_000);
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) assert.equal(blocked.retryAfterSeconds, 50);
});

test("the rate limiter resets after the window and keeps keys independent", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });
  assert.equal(limiter.consume("a", 0).allowed, true);
  assert.equal(limiter.consume("a", 500).allowed, false);
  assert.equal(limiter.consume("b", 500).allowed, true);
  assert.equal(limiter.consume("a", 1_000).allowed, true);
});

test("the client IP comes from the proxy headers", () => {
  assert.equal(clientIp(new Headers({ "x-real-ip": "203.0.113.7" })), "203.0.113.7");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" })), "198.51.100.2");
  assert.equal(clientIp(new Headers()), "unknown");
});

/* ------------------------------------------------------------------ */
/*  CSRF                                                               */
/* ------------------------------------------------------------------ */

const allowedOrigins = ["https://valuaxissoft.com"];

test("a state-changing request from another site is rejected", () => {
  assert.equal(
    isSameOriginRequest({ method: "POST", origin: "https://evil.example", secFetchSite: "cross-site", allowedOrigins }),
    false,
  );
});

test("a state-changing request from our own origin is accepted", () => {
  assert.equal(
    isSameOriginRequest({ method: "PUT", origin: "https://valuaxissoft.com", secFetchSite: "same-origin", allowedOrigins }),
    true,
  );
});

test("without Origin, Sec-Fetch-Site decides", () => {
  assert.equal(isSameOriginRequest({ method: "DELETE", origin: null, secFetchSite: "cross-site", allowedOrigins }), false);
  assert.equal(isSameOriginRequest({ method: "DELETE", origin: null, secFetchSite: "same-origin", allowedOrigins }), true);
});

test("reads are never blocked", () => {
  assert.equal(isSameOriginRequest({ method: "GET", origin: "https://evil.example", secFetchSite: "cross-site", allowedOrigins }), true);
});

/* ------------------------------------------------------------------ */
/*  Headers                                                            */
/* ------------------------------------------------------------------ */

test("production headers forbid framing, sniffing and enable HSTS", () => {
  const headers = Object.fromEntries(securityHeaders({ development: false }).map((h) => [h.key, h.value]));
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.match(headers["Strict-Transport-Security"], /max-age=31536000/);
  assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.match(headers["Content-Security-Policy"], /img-src 'self' data: blob: https:\/\/\*\.amazonaws\.com/);
  assert.doesNotMatch(headers["Content-Security-Policy"], /unsafe-eval/);
});

test("development relaxes only what hot reload needs and skips HSTS", () => {
  const policy = contentSecurityPolicy({ development: true });
  assert.match(policy, /'unsafe-eval'/);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
  assert.equal(securityHeaders({ development: true }).some((h) => h.key === "Strict-Transport-Security"), false);
});

/* ------------------------------------------------------------------ */
/*  Input validation                                                   */
/* ------------------------------------------------------------------ */

function jsonRequest(body: string) {
  return new Request("https://valuaxissoft.com/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

test("a valid body is parsed and coerced", async () => {
  const result = await readJsonBody(
    jsonRequest(JSON.stringify({ title: "Casa", appraisalTypeId: "1", propertyTypeId: 2, operationTypeId: 3 })),
    createValuationSchema,
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.appraisalTypeId, 1);
});

test("an invalid body returns 400 with the failing fields", async () => {
  const result = await readJsonBody(jsonRequest(JSON.stringify({ title: "", appraisalTypeId: "x" })), createValuationSchema);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.response.status, 400);
    const payload = await result.response.json();
    assert.ok(payload.fields.some((field: { path: string }) => field.path === "appraisalTypeId"));
  }
});

test("malformed JSON returns 400 and oversized bodies return 413", async () => {
  const malformed = await readJsonBody(jsonRequest("{"), createValuationSchema);
  assert.equal(!malformed.ok && malformed.response.status, 400);
  const big = await readJsonBody(jsonRequest(JSON.stringify({ title: "x".repeat(2_000) })), createValuationSchema, {
    maxBytes: 100,
  });
  assert.equal(!big.ok && big.response.status, 413);
});

test("full save keeps presentation metadata the editor stores", () => {
  const parsed = saveFullValuationSchema.parse({
    sections: [{ id: "costos", blocks: [{ id: "b", contentLayout: { version: 2, rows: [] }, concepts: [] }] }],
  });
  assert.deepEqual(parsed.sections?.[0].blocks?.[0].contentLayout, { version: 2, rows: [] });
});

test("full save rejects abusive sizes", () => {
  const tooManySections = Array.from({ length: 41 }, (_, i) => ({ id: `s${i}` }));
  assert.equal(saveFullValuationSchema.safeParse({ sections: tooManySections }).success, false);
});

test("reopen requires a reason and the accepted terms", () => {
  assert.equal(reopenValuationSchema.safeParse({ reason: " ", acceptedText: "Acepto" }).success, false);
  assert.equal(reopenValuationSchema.safeParse({ reason: "Corrección", acceptedText: "Acepto" }).success, true);
});

/* ------------------------------------------------------------------ */
/*  Error responses                                                    */
/* ------------------------------------------------------------------ */

test("internal errors never reach the client", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const response = internalError("TEST", new Error('relation "devpware_avaluos" does not exist'));
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.doesNotMatch(JSON.stringify(body), /devpware|relation/);
  } finally {
    console.error = original;
  }
});

test("business errors keep their message and status", async () => {
  const response = valuationErrorResponse("TEST", new ValuationWorkflowError("El avaluo esta bloqueado", 409), "fallback");
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "El avaluo esta bloqueado" });
});
