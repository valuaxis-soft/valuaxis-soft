/**
 * Video 8.13 (27 nov 2026), the pure parts: the spellings of a word of the
 * search, the order of the markets in the review, the colours of the review
 * states, where a card puts a comparable (pin or approximate) and the export
 * of the machinery offers. Every place and person is invented.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { REVIEW_TONES, reviewMarketOrder } from "../src/features/valuations/calculation/comparable-review";
import { reviewStatusListSchema } from "../src/features/valuations/calculation/comparable-review-checklist";
import { machineryOfferRows } from "../src/features/valuations/calculation/machinery-export";
import { emptyOffer } from "../src/features/valuations/calculation/machinery-types";
import { APPROXIMATE_TTL_DAYS, approximateQueryOf, freshApproximate, locationOf } from "../src/features/valuations/comparable-base/comparable-location.service";
import { FUZZY_TOKEN_MIN, searchTokens, tokenSpellings } from "../src/features/valuations/comparable-search/normalize";
import { REVIEW_TONE_STYLES } from "../src/features/valuations/components/calculation/review-status-style";

test("V8.13 (06:14): a section, a fraccionamiento or a city are written several ways and each finds the others", () => {
  assert.deepEqual(tokenSpellings("2a"), ["2a", "2da", "segunda"]);
  assert.deepEqual(tokenSpellings("segunda"), ["segunda", "2a", "2da"]);
  assert.ok(tokenSpellings("fracc").includes("fraccionamiento"));
  assert.ok(tokenSpellings("cd").includes("ciudad"));
  assert.deepEqual(tokenSpellings("bugambilias"), ["bugambilias"]);
  // The words come without accents or case, so «Sección» and «seccion» are one.
  assert.deepEqual(searchTokens("Bugambilias 2a Sección"), ["bugambilias", "2a", "seccion"]);
  assert.ok("bugambilias".length >= FUZZY_TOKEN_MIN && "sur".length < FUZZY_TOKEN_MIN, "misspellings only from five letters");
});

test("V8.13 (13:04): the review opened from a market shows that market first, then the others in their order", () => {
  assert.deepEqual(reviewMarketOrder("INMUEBLE_RENTA"), ["INMUEBLE_RENTA", "TERRENO_VENTA", "INMUEBLE_VENTA", "TERRENO_RENTA"]);
  assert.deepEqual(reviewMarketOrder("TERRENO_VENTA"), ["TERRENO_VENTA", "INMUEBLE_VENTA", "INMUEBLE_RENTA", "TERRENO_RENTA"]);
  assert.deepEqual(reviewMarketOrder(null), ["TERRENO_VENTA", "INMUEBLE_VENTA", "INMUEBLE_RENTA", "TERRENO_RENTA"]);
});

test("V8.13 (12:32): a state of the firm takes any of ten colours, each with its chip, row and text", () => {
  assert.equal(REVIEW_TONES.length, 10);
  for (const tone of REVIEW_TONES) {
    const style = REVIEW_TONE_STYLES[tone];
    assert.ok(style.solid && style.row && style.text, tone);
    assert.doesNotMatch(`${style.solid} ${style.row} ${style.text}`, /#[0-9a-f]{3,6}/i, "theme tokens, no loose hex");
  }
  const parsed = reviewStatusListSchema.safeParse({ statuses: [
    { key: "POR_REVISAR", label: "Sin revisar", tone: "gris" },
    { key: "custom-abc123", label: "Visitado en campo", tone: "violeta" },
  ] });
  assert.ok(parsed.success);
});

test("V8.13 (08:40): the card shows the pin, else the approximate location of the address it has today", () => {
  const address = { location: "Calle Inventada 10, Villa Inventada", street: "Inventada", number: "10", municipality: "Villa Inventada", state: "Jalisco" };
  const query = approximateQueryOf(address);
  assert.equal(query, "Inventada 10, Villa Inventada, Jalisco, México");
  const now = new Date("2026-11-27T18:00:00.000Z");
  const cached = { query, latitude: 20.6, longitude: -103.4, address: "Inventada 10, Villa Inventada", geocodedAt: "2026-11-20T18:00:00.000Z" };
  const noPin = { latitude: null, longitude: null };
  assert.deepEqual(locationOf({ latitude: 20.7, longitude: -103.5 }, address, cached, now), { latitude: 20.7, longitude: -103.5, approximate: false, address: null }, "the valuer's pin first");
  assert.deepEqual(locationOf(noPin, address, cached, now), { latitude: 20.6, longitude: -103.4, approximate: true, address: cached.address });
  assert.equal(locationOf(noPin, { ...address, number: "12" }, cached, now), null, "another address: looked up again");
  assert.equal(locationOf(noPin, address, { ...cached, latitude: null, longitude: null }, now), null, "not found");
  assert.equal(locationOf(noPin, address, null, now), null);
});

test("V8.13: Google's answer is a temporary cache: older than 30 days it is not used (Google Maps Platform terms)", () => {
  const address = { location: "Calle Inventada 10, Villa Inventada", street: "Inventada", number: "10", municipality: "Villa Inventada", state: "Jalisco" };
  const cached = { query: approximateQueryOf(address), latitude: 20.6, longitude: -103.4, address: null, geocodedAt: "2026-10-01T12:00:00.000Z" };
  const noPin = { latitude: null, longitude: null };
  assert.equal(APPROXIMATE_TTL_DAYS, 30);
  assert.ok(freshApproximate(cached, new Date("2026-10-30T12:00:00.000Z")), "29 days: still used");
  assert.equal(freshApproximate(cached, new Date("2026-11-01T12:00:00.000Z")), null, "31 days: expired");
  assert.equal(locationOf(noPin, address, cached, new Date("2026-11-01T12:00:00.000Z")), null, "an expired answer is not shown");
  assert.equal(freshApproximate({ ...cached, geocodedAt: undefined }, new Date("2026-10-02T12:00:00.000Z")), null, "without its date it is not trusted");
  assert.equal(freshApproximate({ ...cached, geocodedAt: "ayer" }, new Date("2026-10-02T12:00:00.000Z")), null);
});

test("V8.13 (05:31): machinery exports its offers to Excel as the other markets do; contact only for who can edit", () => {
  const offer = { ...emptyOffer(0), ref: "1", folio: 91, description: "Retroexcavadora inventada", brand: "Marca", price: 1_500_000, contact: "Persona Inventada", phone: "33 0000 3333", email: "ventas@example.com" };
  const withContact = machineryOfferRows([offer], true);
  assert.deepEqual(withContact.rows[0].slice(0, 4), ["1", "C-00091", "Retroexcavadora inventada", "Marca"]);
  assert.ok(withContact.headers.includes("Teléfono"));
  const without = machineryOfferRows([offer], false);
  assert.ok(!without.headers.includes("Teléfono") && !without.headers.includes("Contacto") && !without.headers.includes("Correo"));
  assert.ok(!without.rows[0].includes("33 0000 3333"));
  assert.equal(without.rows[0][without.headers.indexOf("Precio")], 1_500_000);
});
