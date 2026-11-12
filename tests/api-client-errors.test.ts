/**
 * V5.7-04 / MAP-04: an answer that is not ours (the proxy's 504 page) used to
 * show the English "Request failed". The message is now in Spanish.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { ApiError, api, failedRequestMessage } from "../src/lib/api-client";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("a gateway timeout page reads in Spanish, with what to do", async () => {
  globalThis.fetch = (async () => new Response("<html>504 Gateway Time-out</html>", { status: 504, headers: { "Content-Type": "text/html" } })) as typeof fetch;
  await assert.rejects(api.maps.streets([20.63, -103.4]), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 504);
    assert.doesNotMatch(error.message, /Request failed|HTTP/);
    assert.match(error.message, /inténtalo de nuevo/);
    return true;
  });
});

test("our own JSON message still wins", async () => {
  globalThis.fetch = (async () => Response.json({ error: "No se pudieron obtener las calles de OpenStreetMap en este momento." }, { status: 503 })) as typeof fetch;
  await assert.rejects(api.maps.streets([20.63, -103.4]), /OpenStreetMap/);
});

test("every status gets a sentence in Spanish", () => {
  for (const status of [400, 404, 413, 429, 500, 502, 503, 504]) assert.match(failedRequestMessage(status), /[áéíóúñ]|inténtalo|grandes/);
});
