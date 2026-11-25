/**
 * The session cookie carries the product's name, «valuaxis_session», instead
 * of «devpware_session» (the lawyer's cookies section, 25 Nov 2026), and
 * nobody is signed out by the change.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NextRequest } from "next/server";

import { AUTH_SESSION_COOKIE, LEGACY_AUTH_SESSION_COOKIE } from "../src/features/auth/constants/auth.constants";
import { moveLegacySessionCookie, sessionTokenOf } from "../src/lib/auth/session-cookie";
import { proxy } from "../src/proxy";

process.env.APP_URL ??= "https://valuaxissoft.com";

const jar = (entries: Record<string, string>) => {
  const values = new Map(Object.entries(entries));
  return {
    values,
    get: (name: string) => (values.has(name) ? { value: values.get(name) as string } : undefined),
    set: (name: string, value: string) => { values.set(name, value); },
    delete: (name: string) => { values.delete(name); },
  };
};

test("the session cookie is valuaxis_session; no cookie of the app carries devpware", () => {
  assert.equal(AUTH_SESSION_COOKIE, "valuaxis_session");
  assert.equal(LEGACY_AUTH_SESSION_COOKIE, "devpware_session");
  assert.match(readFileSync("src/features/auth/oauth/oauth-binding-cookie.ts", "utf8"), /"valuaxis_oauth"/);
});

test("the new name is read first and the old one still signs in", () => {
  assert.equal(sessionTokenOf(jar({ valuaxis_session: "new", devpware_session: "old" })), "new");
  assert.equal(sessionTokenOf(jar({ devpware_session: "old" })), "old");
  assert.equal(sessionTokenOf(jar({})), null);
});

test("a browser with the old cookie gets the new one with the same session and loses the old", () => {
  const response = jar({});
  const deleted: string[] = [];
  moveLegacySessionCookie(jar({ devpware_session: "token" }), { ...response, delete: (name: string) => { deleted.push(name); } });
  assert.equal(response.values.get("valuaxis_session"), "token");
  assert.deepEqual(deleted, ["devpware_session"]);
  // Already moved: the new one is not overwritten.
  const both = jar({});
  moveLegacySessionCookie(jar({ devpware_session: "old", valuaxis_session: "new" }), both);
  assert.equal(both.values.has("valuaxis_session"), false);
  // Without the old cookie the response is left alone.
  const none = jar({});
  moveLegacySessionCookie(jar({ valuaxis_session: "new" }), none);
  assert.equal(none.values.size, 0);
});

test("the proxy lets the old cookie in and moves it on the next page", async () => {
  const request = new NextRequest("https://valuaxissoft.com/dashboard", { headers: { cookie: "devpware_session=abc" } });
  const response = await proxy(request);
  assert.equal(response.status, 200, "not sent to sign in");
  const setCookie = response.headers.getSetCookie().join("\n");
  assert.match(setCookie, /valuaxis_session=abc;.*HttpOnly/i);
  assert.match(setCookie, /devpware_session=;/);
  // Without any session the page still asks to sign in.
  const anonymous = await proxy(new NextRequest("https://valuaxissoft.com/dashboard"));
  assert.equal(anonymous.status, 307);
  // A server action (POST) signs in or out by itself: the proxy does not touch its cookies.
  const action = await proxy(new NextRequest("https://valuaxissoft.com/dashboard", { method: "POST", headers: { cookie: "devpware_session=abc" } }));
  assert.equal(action.headers.getSetCookie().length, 0);
});
