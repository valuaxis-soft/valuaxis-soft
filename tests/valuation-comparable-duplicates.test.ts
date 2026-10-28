import assert from "node:assert/strict";
import { test } from "node:test";
import {
  duplicateReasons,
  localityWords,
  samePlace,
  type DuplicateProbe,
} from "../src/features/valuations/calculation/comparable-duplicates";
import { formatAddress } from "../src/features/valuations/calculation/comparable-card";
import { buildComparableListHref, parseComparableListParams } from "../src/features/valuations/comparable-base/comparable-list-params";

const probe = (overrides: Partial<DuplicateProbe> = {}): DuplicateProbe =>
  ({ url: null, location: "", address: null, contactPhone: null, price: null, ...overrides });

// The appraiser's case (video of 27 Oct 2026): the same municipality, the fraccionamiento with its words in
// another order, the same phone and area, another price. Every rule asked for the same price, so none fired.
const stored = probe({
  location: "Fracc. Valle de los Robles, Tepatitlán de Morelos, Jalisco",
  address: { municipality: "Tepatitlán de Morelos", state: "Jalisco", subdivision: "Valle de los Robles" },
  contactPhone: "378 123 4567", area: 160, price: 1_250_000,
});
const captured = probe({
  location: "",
  address: { municipality: "Tepatitlán", neighborhood: "Robles del Valle" },
  contactPhone: "+52 (378) 123-45-67", area: 160, price: 1_390_000,
});

test("a capture almost identical to one of the base is a duplicate even with another price", () => {
  assert.deepEqual(duplicateReasons(captured, stored), ["PHONE_AREA"]);
  // Without the phone the place and the area still tell it.
  assert.deepEqual(duplicateReasons({ ...captured, contactPhone: null }, stored), ["PLACE_AREA"]);
  // The same place and area at the same price is the "similar" of before.
  assert.deepEqual(duplicateReasons({ ...captured, contactPhone: null, price: 1_255_000 }, stored), ["SIMILAR"]);
});

test("places are compared without case, accents, separators or the order of their words", () => {
  const words = (location: string) => localityWords({ location });
  assert.ok(samePlace(words("Lote 3, Fracc. Valle-de los Robles, Tepatitlán"), words("Lote 9, Robles/Valle, TEPATITLAN")));
  assert.ok(samePlace(words("Coto Vallereal, Zapopan"), words("x 1, Valle Real, Zapopan")), "written together or apart");
  assert.ok(!samePlace(words("Centro, Arandas"), words("Las Fuentes, Arandas")), "the same town is not the same place");
  assert.ok(!samePlace(words("Arandas, Jalisco"), words("Arandas, Jal.")), "a municipio alone is not a place");
});

test("another property of the same advertiser or of the same town is not a duplicate", () => {
  assert.deepEqual(duplicateReasons({ ...captured, area: 220 }, stored), [], "the same phone with another area");
  assert.deepEqual(duplicateReasons(probe({ ...captured, contactPhone: null, address: { municipality: "Tepatitlán", neighborhood: "Centro" } }), stored), []);
});

test("the street and number match in any order of words", () => {
  assert.deepEqual(duplicateReasons(probe({ location: "12 Juárez, Centro, Arandas" }), probe({ location: "Calle Juárez 12, col. Centro, Arandas" })), ["ADDRESS"]);
});

test("the fraccionamiento is a part of the address and of the printed line", () => {
  assert.equal(formatAddress({ street: "Roble", number: "4", subdivision: "Valle Real", municipality: "Zapopan" }), "Roble 4, fracc. Valle Real, Zapopan");
});

test("the base filters bedrooms and bathrooms exactly, at least or at most, by fraccionamiento and by price", () => {
  const params = parseComparableListParams({ recamaras: "3", recamarasModo: "exacto", banos: "2.5", banosModo: "hasta", fraccionamiento: "Valle Real", precioMin: "1,000,000", precioMax: "2000000" });
  assert.equal(params.bedroomsMode, "exacto");
  assert.equal(params.bathroomsMode, "hasta");
  assert.equal(params.bathrooms, 2.5);
  assert.equal(params.subdivision, "Valle Real");
  assert.equal(params.priceMin, 1_000_000);
  assert.equal(params.priceMax, 2_000_000);
  assert.equal(parseComparableListParams({ recamarasModo: "todo" }).bedroomsMode, "al_menos", "an unknown mode is at least");
  assert.deepEqual(parseComparableListParams(Object.fromEntries(new URL(buildComparableListHref(params), "https://valuaxis.test").searchParams)), params);
});
