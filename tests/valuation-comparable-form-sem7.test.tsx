/**
 * Videos 7.1, 7.2 and 7.3: the comparable form. Chrome's autofill kept off
 * (V7.1-11, V7.2-05), photos from the first capture and up to ten (V7.1-08,
 * 09, V7.2-09), the firm's values offered while typing (V7.2-04, 22), the
 * labels and options he asked for (V7.2-16, 17, V7.3-27) and the coordinate
 * shown also in degrees (V7.2-08).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  STREET_TYPES,
  addressFromRecord,
  formatAddress,
  formatCoordinateDms,
  normalizeCrossing,
  parseCoordinate,
  streetTypeText,
} from "../src/features/valuations/calculation/comparable-card";
import type { ComparableCardDto } from "../src/features/valuations/calculation/comparable-card.service";
import { comparableValidity } from "../src/features/valuations/calculation/comparable-validity";
import { comparableInputSchema } from "../src/features/valuations/calculation/market-schemas";
import { MAX_COMPARABLE_PHOTOS, type ComparableDto } from "../src/features/valuations/calculation/market-types";
import { marketPhotoBlocks } from "../src/features/valuations/calculation/market-document";
import { mergeOptions, suggestionsFrom } from "../src/features/valuations/comparable-base/comparable-suggestions";
import { ComparableCardView } from "../src/features/valuations/components/calculation/comparable-card-view";
import { NO_BROWSER_AUTOFILL } from "../src/features/valuations/components/calculation/comparable-dialog";
import { matchingOptions } from "../src/features/valuations/components/calculation/suggest-input";

const DIALOG = readFileSync("src/features/valuations/components/calculation/comparable-dialog.tsx", "utf8");

test("V7.1-11 and V7.2-05: every text field turns Chrome's autofill off with a value it does not know, not with «off»", () => {
  // «off» is what Chrome ignores in an address; «valuaxis-ficha» it reads as HTML_TYPE_UNRECOGNIZED (disabling autofill).
  assert.equal(NO_BROWSER_AUTOFILL, "valuaxis-ficha");
  const inputs = DIALOG.match(/<(?:Input|FormulaInput|Control)\b[^>]*?>/g) ?? [];
  const fields = inputs.filter((tag) => !/aria-label=\{`(?:Nombre|Valor) de la característica/.test(tag) && !/type="(?:date|file)"/.test(tag));
  assert.ok(fields.length >= 20, "the form's fields were found");
  for (const tag of fields) assert.match(tag, /autoComplete=\{NO_BROWSER_AUTOFILL\}/, tag.slice(0, 120));
  assert.doesNotMatch(DIALOG, /<(?:Input|FormulaInput|Control)\b[^>]*autoComplete="off"/);
});

test("V7.1-11: no field id carries the words Chrome reads as an address («land» was taken for the country and filled «México»)", () => {
  const ids = [...DIALOG.matchAll(/"(cmp-[a-z0-9-]+)"/g)].map((match) => match[1]);
  assert.ok(ids.includes("cmp-sup-2"), "the land area has a neutral id");
  for (const id of ids) assert.doesNotMatch(id, /state|postal|zip|street|land|city|country|address|phone|tel\b/);
  for (const old of ["comparable-state", "comparable-postalCode", "comparable-street\"", "comparable-land-area", "comparable-phone"]) {
    assert.ok(!DIALOG.includes(`id="${old}`), `${old} is gone`);
  }
});

test("V7.1-09: a comparable keeps up to ten photos (the server's limit is checked in comparable-form-sem7.integration.ts)", () => {
  assert.equal(MAX_COMPARABLE_PHOTOS, 10);
  assert.match(DIALOG, /Un comparable lleva hasta \$\{MAX_COMPARABLE_PHOTOS\} fotografías/);
});

const comparable = (extra: Partial<ComparableDto> = {}): ComparableDto => ({
  id: "comparable-prueba", reference: 1, location: "Calle Inventada 12, Arandas, Jalisco", area: 180, price: 2_000_000, landUse: null,
  shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null, sourceName: "Portal de prueba",
  contactName: null, contactPhone: null, url: null, offerDate: null, photos: [], factors: [], ...extra,
});
const tenPhotos = Array.from({ length: 10 }, (_, index) => ({ id: `foto-${index}`, title: `Foto ${index + 1}`, url: `/api/archivos/imagen?key=f${index}` }));

test("V7.1-09: the card and the annex of photos show all ten photos of a comparable", () => {
  const card: ComparableCardDto = {
    comparable: comparable({ photos: tenPhotos }), type: "INMUEBLE_VENTA", valuation: null,
    validity: comparableValidity("2026-11-01", "2026-11-12"), warnings: [], uses: [], history: [],
  };
  const html = renderToStaticMarkup(<ComparableCardView card={card} />);
  assert.equal((html.match(/alt="Foto \d+"/g) ?? []).length, 10);
  assert.ok(html.includes("grid-cols-4"), "four a row past six");
  const blocks = marketPhotoBlocks({ settings: { comparableType: "INMUEBLE_VENTA" }, comparables: [comparable({ photos: tenPhotos })] } as never);
  assert.equal(blocks[0]?.images?.length, 10);
});

test("V7.1-08 and V7.2-09: the photos section is there from the first capture; the photos wait in memory and go up after saving", () => {
  assert.ok(!DIALOG.includes("Guarda el comparable para agregar fotografías del inmueble"));
  assert.match(DIALOG, /<SheetFormSection title="Fotografías del inmueble">/);
  assert.ok(DIALOG.indexOf('title="Fotografías del inmueble"') < DIALOG.indexOf("<ScreenshotSlot"), "photos come before the screenshot of the listing");
  assert.match(DIALOG, /photos: pendingPhotos\.map\(\(photo\) => photo\.file\)/);
  const panel = readFileSync("src/features/valuations/components/calculation/market-calculation-panel.tsx", "utf8");
  assert.match(panel, /pending\.photos\.map\(\(photo\) => \(\) => api\.market\.uploadPhoto\(valuationId, type, added\.id, photo\)\)/);
  const base = readFileSync("src/features/valuations/comparable-base/components/base-comparable-dialog.tsx", "utf8");
  assert.match(base, /for \(const photo of pending\.photos\) await run\(\(\) => api\.comparableBase\.uploadPhoto\(created\.id, photo\)\)/);
  // «Subir imagen» was taken for the photos: it says what it is.
  assert.ok(readFileSync("src/features/valuations/components/calculation/screenshot-slot.tsx", "utf8").includes("Subir captura del anuncio"));
});

test("V7.2-04 and V7.2-22: the firm's places and characteristics, most used first, each once whatever its accents", () => {
  const row = (address: Record<string, unknown>, property: Record<string, unknown> = {}, sameType = true) => ({ address, property, sameType });
  const suggestions = suggestionsFrom([
    row({ municipality: "Zapopan", neighborhood: "Colonia Inventada" }, { zone: "Habitacional media", frontage: 8 }),
    row({ municipality: "zapopan", subdivision: "Fracc. Ficticio" }, { zone: "Habitacional media", depth: 20 }),
    row({ municipality: "Arandas", streetType: "OTRO", streetTypeOther: "Callejuela" }, { zone: "Comercial" }),
    // Another type: its places count, its characteristics do not.
    row({ municipality: "Tepatitlán" }, { zone: "Industrial" }, false),
  ]);
  assert.deepEqual(suggestions.address.municipality, ["Zapopan", "Arandas", "Tepatitlán"]);
  assert.deepEqual(suggestions.address.subdivision, ["Fracc. Ficticio"]);
  assert.deepEqual(suggestions.address.streetTypeOther, ["Callejuela"]);
  assert.deepEqual(suggestions.characteristics.zone, ["Habitacional media", "Comercial"]);
  assert.deepEqual(suggestions.characteristics.frontage, ["8"]);
  assert.deepEqual(suggestions.characteristics.depth, ["20"]);
  assert.deepEqual(mergeOptions(["Buena", "Regular"], ["Económica", "buena"]), ["Buena", "Regular", "Económica"]);
});

test("V7.2-04: the list offers what contains what is typed, and never refuses another value", () => {
  assert.deepEqual(matchingOptions(["Zapopan", "Tlaquepaque", "Zapotlanejo"], "zapo"), ["Zapopan", "Zapotlanejo"]);
  assert.deepEqual(matchingOptions(["Tepatitlán"], "tepatitlan"), [], "the typed value itself is not offered again");
  assert.deepEqual(matchingOptions(["Tepatitlán", "Arandas"], ""), ["Tepatitlán", "Arandas"]);
  assert.deepEqual(matchingOptions(["Zapopan"], "Colonia nueva"), []);
});

test("V7.2-17: the area says which one, and the fields go in the order he asked for", () => {
  assert.match(DIALOG, /INMUEBLE_VENTA: "Superficie construida \(m²\)"/);
  assert.match(DIALOG, /INMUEBLE_RENTA: "Superficie rentable \(m²\)"/);
  assert.match(DIALOG, /TERRENO_VENTA: "Superficie de terreno \(m²\)"/);
  assert.ok(!DIALOG.includes(">Superficie (m²)<"));
  const at = (text: string) => DIALOG.indexOf(text);
  // Since the card is the form (V8.2), each field is an item of its band, in this order.
  const order = ['field("operation", "Tipo de operación"', 'field("constructionType", "Tipo de construcción"', 'field("price", dollars ? `${props.unitLabel} en dólares (USD)` : props.unitLabel', 'field("landArea", "Superficie de terreno (m²)"', 'field("area", AREA_FIELD_LABELS[props.comparableType]'];
  for (const marker of order) assert.ok(at(marker) >= 0, `${marker} is in the card`);
  for (let index = 1; index < order.length; index += 1) assert.ok(at(order[index - 1]) < at(order[index]), `${order[index - 1]} before ${order[index]}`);
});

test("V7.2-16: «Callejón» is a type of road; «Otro» prints the type written and it is kept", () => {
  assert.ok(STREET_TYPES.includes("CALLEJON"));
  assert.equal(formatAddress({ streetType: "CALLEJON", street: "del Iris", number: "4", municipality: "Arandas" }), "Callejón del Iris 4, Arandas");
  assert.equal(formatAddress({ streetType: "OTRO", streetTypeOther: "Callejuela", street: "del Iris", municipality: "Arandas" }), "Callejuela del Iris, Arandas");
  assert.equal(formatAddress({ streetType: "OTRO", street: "Callejón del Iris", municipality: "Arandas" }), "Callejón del Iris, Arandas", "without which, the name alone");
  assert.equal(formatAddress({ streetType: "OTRO", streetTypeOther: "Retorno", street: "Retorno Pinos" }), "Retorno Pinos", "not twice");
  assert.equal(streetTypeText({ streetType: "OTRO", streetTypeOther: "Callejuela" }), "Otro: Callejuela");
  assert.equal(addressFromRecord({ street: "del Iris", streetType: "OTRO", streetTypeOther: "Callejuela" })?.streetTypeOther, "Callejuela");
  assert.equal(addressFromRecord({ street: "del Iris", streetType: "CALLE", streetTypeOther: "Callejuela" })?.streetTypeOther, undefined);
  const base = { location: "x", area: null, price: null, factors: [], landUse: null, shape: null, zone: null, frontage: null, depth: null,
    topography: null, services: null, notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null };
  const saved = comparableInputSchema.safeParse({ ...base, address: { streetType: "OTRO", streetTypeOther: " Callejuela ", crossStreet: "Calle Hidalgo" } });
  assert.ok(saved.success);
  assert.equal(saved.data.address?.streetTypeOther, "Callejuela");
  assert.equal(saved.data.address?.crossStreet, "Calle Hidalgo");
  assert.ok(comparableInputSchema.safeParse({ ...base, address: { streetType: "CALLEJON" } }).success);
});

test("V7.3-27: a corner prints «esquina con», whether captured in its field or typed with «&», «cruce con» or «esq.»", () => {
  assert.equal(
    formatAddress({ streetType: "AVENIDA", street: "Inventada", number: "10", crossStreet: "Calle Ficticia", neighborhood: "Centro", municipality: "Arandas" }),
    "Av. Inventada 10 esquina con Calle Ficticia, col. Centro, Arandas",
  );
  assert.equal(formatAddress({ street: "Inventada", crossStreet: "esq. Ficticia" }), "Inventada esquina con Ficticia");
  assert.equal(normalizeCrossing("Av. Inventada & Calle Ficticia"), "Av. Inventada esquina con Calle Ficticia");
  assert.equal(normalizeCrossing("Av. Inventada cruce con Calle Ficticia"), "Av. Inventada esquina con Calle Ficticia");
  assert.equal(normalizeCrossing("Av. Inventada esq. Calle Ficticia"), "Av. Inventada esquina con Calle Ficticia");
  assert.equal(normalizeCrossing("Av. Inventada Esquina Con Calle Ficticia"), "Av. Inventada esquina con Calle Ficticia");
  assert.equal(normalizeCrossing("Calle La Esquina 12"), "Calle La Esquina 12", "a name stays");
  assert.match(DIALOG, /normalizeCrossing\(draft\.location\)/, "the line typed by hand reads the same");
});

test("V7.2-08: the decimal coordinate is shown also in degrees, and it is the same point", () => {
  assert.equal(formatCoordinateDms(parseCoordinate(`20°36'55.24"N`) as number, "latitude"), `20°36'55.24" N`);
  assert.equal(formatCoordinateDms(parseCoordinate(`103°28'25.56"O`) as number, "longitude"), `103°28'25.56" O`);
  assert.equal(formatCoordinateDms(-33.85, "latitude"), `33°51'00.00" S`);
  for (const value of [20.6153444, -103.4737667, 0.5]) {
    assert.ok(Math.abs((parseCoordinate(formatCoordinateDms(value, "latitude").replace(" ", "")) ?? 0) - value) < 1e-5);
  }
  assert.match(DIALOG, /dmsOf\(draft\.latitude, "latitude"\)/);
});
