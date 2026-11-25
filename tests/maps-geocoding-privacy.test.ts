/**
 * Legal matrix 1.5 bis: only the location goes to Google. «Buscar
 * dirección» sends the typed address and nothing else (no owner, no
 * solicitante, no folio): the request carries exactly the address, the
 * region, the language and the key.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { geocodeAddress } from "../src/features/maps/server/geocoding.service";

test("the geocoding request carries the typed address and nothing else", async () => {
  const requests: URL[] = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.body, undefined, "no body");
    requests.push(new URL(String(url)));
    return new Response(JSON.stringify({ status: "OK", results: [{ formatted_address: "Calle Inventada 10, Zapopan, Jal., México", geometry: { location: { lat: 20.63, lng: -103.4 }, location_type: "ROOFTOP" } }] }));
  }) as typeof fetch;
  // A made-up key.
  const found = await geocodeAddress("  Calle Inventada 10, Zapopan  ", fakeFetch, "clave-inventada");
  assert.deepEqual(found.map((result) => result.point), [[20.63, -103.4]]);
  assert.equal(requests.length, 1);
  const [url] = requests;
  assert.equal(url.host, "maps.googleapis.com");
  assert.deepEqual([...url.searchParams.keys()].sort(), ["address", "key", "language", "region"]);
  assert.equal(url.searchParams.get("address"), "Calle Inventada 10, Zapopan");
});
