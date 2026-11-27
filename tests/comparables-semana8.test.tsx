/**
 * Week 8 of the comparables (videos 8.7 to 8.12 and the audio of 26 nov 2026):
 * the pure parts and what the screens render. What needs the database is in
 * tests/integration/comparables-semana8.integration.ts.
 */
import "./support/no-ai-key";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { listingPrefill, LISTING_SECTIONS } from "../src/features/ai/listing-prefill";
import { verifyListingExtraction } from "../src/features/ai/listing-extraction";
import { typedLocationMismatch } from "../src/features/valuations/calculation/comparable-card";
import {
  DEFAULT_REVIEW_STATUS_LIST, reviewStatusOf, statusAfterLinkCheck, markAllChecks,
} from "../src/features/valuations/calculation/comparable-review";
import { newStatusKey, resolveReviewStatuses, reviewStatusListSchema } from "../src/features/valuations/calculation/comparable-review-checklist";
import { oldCutoff } from "../src/features/valuations/comparable-base/comparable-trash.service";
import { offerFromListing } from "../src/features/valuations/comparable-search/machinery-offers";
import { suggestedMachinerySearchText, suggestedWebSearchText } from "../src/features/valuations/comparable-search/web-listings";
import { searchPlaceOf } from "../src/features/valuations/comparable-search/web-search.service";
import { ADD_COMPARABLE_OPTIONS, AddComparableMenu } from "../src/features/valuations/components/calculation/add-comparable-menu";
import { candidatesOfRounds, QUOTA_NOTE, quotaText } from "../src/features/valuations/components/calculation/ai-comparable-search";
import { DUPLICATE_ANSWERS, DuplicateChoice, sameDecision } from "../src/features/valuations/components/calculation/duplicate-decision";
import { IMPORT_TEMPLATE_WORDING, ImportComparablesDialog } from "../src/features/valuations/components/calculation/import-comparables-dialog";
import { ListingEvidence } from "../src/features/valuations/components/calculation/listing-evidence";
import { PASTE_LISTING_SUBMIT } from "../src/features/valuations/components/calculation/paste-listing-dialog";
import { ReviewStatusEditor } from "../src/features/valuations/components/calculation/review-status-editor";
import { EMPTY_EXTRACTION } from "./support/fake-ai-gateway";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

const noop = () => undefined;
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

/* 1. «Pegar anuncio» inside «Agregar comparable»; «Importar Excel» a menu (V8.12, 00:23 and 03:31) */

test("V8.12: «Agregar comparable» asks how — by hand or pasting a listing — and without AI it is the plain button", () => {
  assert.deepEqual(ADD_COMPARABLE_OPTIONS, { byHand: "Capturar a mano", paste: "Pegar anuncio" });
  const menu = html(createElement(AddComparableMenu, { valuationId: "a", type: "TERRENO_VENTA", priceLabel: "Precio", pasteListing: true, onByHand: noop, onListing: noop }));
  assert.match(menu, /Agregar comparable/);
  assert.match(menu, /data-add-comparable-menu/);
  // «Pegar anuncio» is no longer a button of its own next to it.
  const panel = source("src/features/valuations/components/calculation/market-calculation-panel.tsx");
  assert.doesNotMatch(panel, /<PasteListingDialog/);
  assert.match(panel, /<AddComparableMenu/);
  const plain = html(createElement(AddComparableMenu, { valuationId: "a", type: "TERRENO_VENTA", priceLabel: "Precio", pasteListing: false, onByHand: noop, onListing: noop }));
  assert.doesNotMatch(plain, /data-add-comparable-menu/);
});

test("V8.12: «Importar Excel» is a menu with «Descargar plantilla», «Descargar plantilla de este mercado» and «Elegir archivo»", () => {
  assert.equal(IMPORT_TEMPLATE_WORDING.download, "Descargar plantilla");
  assert.equal(IMPORT_TEMPLATE_WORDING.downloadMarket, "Descargar plantilla de este mercado");
  assert.equal(IMPORT_TEMPLATE_WORDING.choose, "Elegir archivo");
  const markup = html(createElement(ImportComparablesDialog, { scope: { kind: "valuation", valuationId: "a", type: "TERRENO_VENTA", onImported: noop } }));
  assert.match(markup, /data-import-menu/);
  assert.match(markup, /Importar Excel/);
  const dialog = source("src/features/valuations/components/calculation/import-comparables-dialog.tsx");
  assert.match(dialog, /<DropdownMenuItem[^>]*render=\{<a href=\{templateHref\} download \/>\}>/);
  assert.match(dialog, /IMPORT_TEMPLATE_WORDING\.downloadMarket/);
  assert.match(dialog, /onClick=\{\(\) => input\.current\?\.click\(\)\}/);
});

/* 2. The listing read in the card itself; its button and its date (V8.12, 06:37 and 11:40) */

const LISTING = "Casa en venta en Fraccionamiento Inventado, Villa Ejemplo, Jalisco. Precio $2,350,000. Terreno 160 m2. Construcción 185 m2. Tel. 33 0000 2222.";
const proposal = () => verifyListingExtraction(LISTING, "https://portal.example/casa-1", {
  ...EMPTY_EXTRACTION, operation: "venta", operationEvidence: "Casa en venta", price: "$2,350,000", landArea: "Terreno 160 m2", builtArea: "Construcción 185 m2",
  municipality: "Villa Ejemplo", state: "Jalisco", contactPhone: "33 0000 2222",
});

test("V8.12: «Extraer datos y crear ficha»; without a date in the listing the offer is dated today, and the row says so", () => {
  assert.equal(PASTE_LISTING_SUBMIT, "Extraer datos y crear ficha");
  const reading = listingPrefill(proposal(), "INMUEBLE_VENTA", "Precio de oferta ($)", "2026-11-26");
  assert.equal(reading.values.offerDate, "2026-11-26");
  assert.equal(reading.values.price, "2350000");
  assert.equal(reading.values.area, "185");
  const dated = reading.rows.find((row) => row.field === "offerDate");
  assert.match(dated?.note ?? "", /se puso la de hoy/);
  // A listing with its date keeps it.
  const withDate = verifyListingExtraction(`${LISTING} Publicado el 15 de marzo de 2026.`, null, { ...EMPTY_EXTRACTION, listingDate: "15 de marzo de 2026" });
  assert.equal(listingPrefill(withDate, "INMUEBLE_VENTA", "Precio", "2026-11-26").values.offerDate, "2026-03-15");
});

test("V8.12: what was read shows in the card's own sections and bands, each value with its fragment", () => {
  const reading = listingPrefill(proposal(), "INMUEBLE_VENTA", "Precio de oferta ($)", "2026-11-26");
  const markup = html(createElement(ListingEvidence, { reading }));
  for (const title of ["Oferta", "Ubicación", "Fuente de información", "Construcción"]) assert.match(markup, new RegExp(`aria-label="${title}"`), title);
  assert.match(markup, /<q[^>]*data-evidence[^>]*>\$2,350,000<\/q>/);
  assert.match(markup, /data-listing-found[^>]*>\d+ de \d+/);
  assert.deepEqual(LISTING_SECTIONS.map((section) => section.title), ["Oferta", "Ubicación", "Fuente de información", "Terreno", "Construcción", "Características y observaciones"]);
  // The pasting window has no review of its own any more: the card is the review.
  const paste = source("src/features/valuations/components/calculation/paste-listing-dialog.tsx");
  assert.doesNotMatch(paste, /Usar estos datos/);
  assert.match(source("src/features/valuations/components/calculation/comparable-dialog.tsx"), /<ListingEvidence reading=\{props\.listingEvidence\} \/>/);
});

/* 4. Possible duplicates: three answers, chosen before saving (V8.12) */

const match = {
  comparableId: "c1", folio: 144, location: "Calle Inventada 5, Villa Ejemplo", type: "TERRENO_VENTA" as const, price: 1_000_000, area: 200,
  contactPhone: null, valuation: null, sameValuation: false, updatedOn: "2026-11-01", reasons: ["URL" as const], thumbnailUrl: null,
};

test("V8.12: a possible duplicate offers three answers and «Ver ficha» apart; saving waits for one", () => {
  assert.deepEqual(DUPLICATE_ANSWERS, {
    reuse: "Usar el comparable existente",
    update: "Es el mismo: actualizar los datos de su ficha",
    different: "Es diferente: crear otra ficha",
  });
  const markup = html(createElement(DuplicateChoice, { matches: [match] as never, assetClass: "INMUEBLE", decision: null, onDecision: noop }));
  for (const answer of Object.values(DUPLICATE_ANSWERS)) assert.ok(markup.includes(answer), answer);
  assert.equal(markup.match(/type="radio"/g)?.length, 3);
  assert.doesNotMatch(markup, /checked=""/, "nothing chosen beforehand");
  assert.match(markup, /Ver ficha/);
  assert.match(markup, /C-00144/);
  assert.ok(sameDecision({ action: "update", comparableId: "c1" }, { action: "update", comparableId: "c1" }));
  assert.ok(!sameDecision({ action: "update", comparableId: "c1" }, { action: "reuse", comparableId: "c1" }));
  const sheet = source("src/features/valuations/components/calculation/comparable-dialog.tsx");
  // The save button waits for the answer, and the question is also beside it.
  assert.match(sheet, /<Button type="submit" disabled=\{saving \|\| \(pendingDuplicates && !decision\)\}/);
  assert.match(sheet, /data-duplicates-footer/);
});

/* 5. Addresses: a typed line that names another street; the same rows in every card (V8.11) */

test("V8.11: a typed «Ubicación» that does not name the card's street is told, and one that names it is not", () => {
  const lince = { streetType: "CIRCUITO" as const, street: "Del Lince Poniente", neighborhood: "Bugambilias", municipality: "Zapopan", state: "Jalisco" };
  assert.equal(
    typedLocationMismatch("Callejon del Iris 155, col. Bugambilias, fracc. Ciudad Bugambilias, Zapopan, Jalisco", lince),
    "Cto. Del Lince Poniente",
  );
  assert.equal(typedLocationMismatch("Circuito del Lince Pte. 20, Bugambilias", { ...lince, street: "Del Lince Pte." }), null);
  assert.equal(typedLocationMismatch("Circuito Lince Poniente 20, Bugambilias, Zapopan", lince), null);
  assert.equal(typedLocationMismatch("", lince), null, "nothing typed: the line is built from the fields");
  assert.equal(typedLocationMismatch("Rancho El Inventado, km 3", { municipality: "Zapopan" }), null, "no street to compare");
  const sheet = source("src/features/valuations/components/calculation/comparable-dialog.tsx");
  assert.match(sheet, /data-location-mismatch/);
  // «¿Cuál tipo de vialidad?» goes inside the cell of «Tipo de vialidad»: no row of its own that only some cards have.
  assert.doesNotMatch(sheet, /field\("streetTypeOther"/);
  assert.match(sheet, /aria-label="¿Cuál tipo de vialidad\?"/);
  // A comparable's address is never copied to the others from the table's menu.
  assert.match(source("src/features/valuations/components/calculation/market-calculation-panel.tsx"), /noFill\s+value=\{comparable\.location\}/);
});

/* 6. Buscar con IA: the count, its words, the request and the history (V8.8) */

test("V8.8: «N/25 anuncios encontrados con IA», and the listings «se contabilizan», never «se cobra»", () => {
  assert.equal(quotaText({ used: 4, cap: 25 }), "4/25 anuncios encontrados con IA");
  const note = QUOTA_NOTE(25, 5);
  assert.match(note, /se contabilizan aunque no uses ninguno/);
  assert.doesNotMatch(note, /cobra/);
  assert.doesNotMatch(source("src/features/valuations/components/calculation/ai-comparable-search.tsx"), /se cobra/);
});

test("V8.8: the request starts from where the valuation is: a bare «Código postal» gives way to the address of its pin", () => {
  const bare = { SColonia: null, SMunicipio: null, SEstado: null, SDireccionCompleta: "Código postal 47180" };
  const place = searchPlaceOf(bare, "Av. Inventada 1234, Colonia Ejemplo, Guadalajara, Jal., México");
  assert.equal(place.address, "Av. Inventada 1234, Colonia Ejemplo, Guadalajara, Jal., México");
  const text = suggestedWebSearchText("INMUEBLE_VENTA", { propertyType: "Casa", ...place, area: null, landUse: null });
  assert.match(text, /cerca de Av\. Inventada 1234, Colonia Ejemplo, Guadalajara/);
  assert.doesNotMatch(text, /47180/);
  // Without a pin the C.P. is said as such; a real address stays; the town of the address leads.
  assert.equal(searchPlaceOf(bare, null).address, "C.P. 47180");
  assert.equal(searchPlaceOf({ ...bare, SDireccionCompleta: "Calle Inventada 5, Guadalajara" }, "otra").address, "Calle Inventada 5, Guadalajara");
  assert.match(
    suggestedWebSearchText("TERRENO_VENTA", { propertyType: null, ...searchPlaceOf({ ...bare, SMunicipio: "Guadalajara", SEstado: "Jalisco" }, null), area: null, landUse: null }),
    /en Guadalajara, Jalisco/,
  );
});

test("V8.8: the listings of every search, each once, in the order found; «Nueva búsqueda» starts from the last request", () => {
  const candidate = (key: string) => ({ key, url: `https://portal.example/${key}` }) as never;
  const rounds = [{ candidates: [candidate("a")] }, { candidates: [candidate("b"), candidate("a"), candidate("c")] }];
  assert.deepEqual(candidatesOfRounds(rounds).map((item: { key: string }) => item.key), ["a", "b", "c"]);
  const hook = source("src/features/valuations/components/calculation/ai-comparable-search.tsx");
  assert.match(hook, /const last = asked\[asked\.length - 1\] \?\? rounds\[rounds\.length - 1\]\?\.request \?\? setup\?\.suggestion/);
  assert.match(hook, /Búsqueda \{group\.number\}/);
});

test("audio of 26 nov: the machinery panel asks for the machine by name, brand, model and year, and a listing becomes an offer", () => {
  const text = suggestedMachinerySearchText("INMUEBLE_RENTA", { propertyType: null, neighborhood: null, municipality: "Guadalajara", state: "Jalisco", address: null, area: null, landUse: null },
    { name: "Retroexcavadora", brand: "Marca Inventada", model: "X1", year: "2018" });
  assert.match(text, /^Retroexcavadora Marca Inventada X1 año 2018 en renta en Guadalajara, Jalisco/);
  const offer = offerFromListing({
    title: "Retroexcavadora inventada 2018", price: 1_200_000, currency: "MXN", listingDate: "2026-11-20", contactName: "Vendedor Inventado", agency: null,
    portal: "Portal Ejemplo", contactPhone: "33 0000 3333", url: "https://portal.example/retro", neighborhood: null, municipality: "Zapopan", state: "Jalisco",
    reference: null, notes: "3,000 horas",
  }, 150, 2);
  assert.deepEqual(
    { ref: offer.ref, description: offer.description, price: offer.price, date: offer.date, company: offer.company, link: offer.link, location: offer.location },
    { ref: "C3", description: "Retroexcavadora inventada 2018", price: 1_200_000, date: "20/11/2026", company: "Portal Ejemplo", link: "https://portal.example/retro", location: "Zapopan, Jalisco" },
  );
  assert.match(offer.notes, /3,000 horas.*ficha C-00150 de la base del despacho/);
  // A price in dollars is not written as pesos.
  assert.equal(offerFromListing({ ...offer, title: "x", currency: "USD", price: 50_000, listingDate: null, contactName: null, agency: null, portal: "p", contactPhone: null, url: "u", neighborhood: null, municipality: null, state: null, reference: null, notes: null }, null, 0).price, null);
});

/* 7. The search of the base: «Agregar seleccionados (N)» beside its boxes, and «Cerrar» (V8.7, 22:28) */

test("V8.7: «Agregar seleccionados (N)» lives with the boxes of the results, and the window closes with «Cerrar»", () => {
  const dialog = source("src/features/valuations/components/calculation/search-comparables-dialog.tsx");
  assert.match(dialog, /data-add-selected[\s\S]*seleccionados \(\{chosen\.length\}\)/);
  assert.match(dialog, /<DialogFooter>\s*<Button[^\n]*data-search-close>\s*Cerrar\s*<\/Button>\s*<\/DialogFooter>/);
});

/* 8. The firm's states of the review (V8.12, 04:49) */

test("V8.12: the firm's states — add, rename, delete — with «Sin revisar» first; a deleted state keeps its name", () => {
  assert.deepEqual(DEFAULT_REVIEW_STATUS_LIST.map((item) => [item.key, item.tone]), [
    ["POR_REVISAR", "gris"], ["VERIFICADO", "verde"], ["VERIFICADO_NO_VIGENTE", "azul"], ["CON_OBSERVACIONES", "ocre"], ["RECHAZADO", "rojo"],
  ]);
  const custom = { key: "custom-disponible", label: "Disponible", tone: "verde" as const };
  assert.ok(reviewStatusListSchema.safeParse({ statuses: [...DEFAULT_REVIEW_STATUS_LIST, custom] }).success);
  assert.ok(!reviewStatusListSchema.safeParse({ statuses: DEFAULT_REVIEW_STATUS_LIST.slice(1) }).success, "«Sin revisar» stays first");
  assert.ok(!reviewStatusListSchema.safeParse({ statuses: [...DEFAULT_REVIEW_STATUS_LIST, { ...custom, label: "rechazado" }] }).success, "two with the same name");
  assert.equal(resolveReviewStatuses(null), DEFAULT_REVIEW_STATUS_LIST);
  assert.match(newStatusKey(["custom-a"], () => "b"), /^custom-b$/);
  // Read with the list of today, else with the name saved with the review.
  assert.equal(reviewStatusOf("custom-disponible", [custom]).label, "Disponible");
  assert.deepEqual(reviewStatusOf("custom-disponible", DEFAULT_REVIEW_STATUS_LIST, { statusLabel: "Disponible", statusTone: "verde" }), custom);
  assert.equal(reviewStatusOf("VERIFICADO", [{ key: "VERIFICADO", label: "Vigente", tone: "verde" }]).label, "Vigente");
  // A state of the firm is the appraiser's word: the link of the listing does not move it.
  assert.equal(statusAfterLinkCheck("custom-disponible", false), "custom-disponible");
  assert.equal(markAllChecks(["link"], "custom-disponible").status, "custom-disponible");
  const editor = html(createElement(ReviewStatusEditor, { statuses: [...DEFAULT_REVIEW_STATUS_LIST, custom], onSaved: noop, onClose: noop }));
  assert.match(editor, /Agregar estado/);
  assert.match(editor, /Guardar estados/);
  assert.match(editor, /value="Disponible"/);
  assert.match(source("src/features/valuations/components/calculation/comparable-review-dialog.tsx"), /Editar estados/);
});

/* 9. The trash of old comparables (V8.8, 12:30) */

test("V8.8: the ages of «Borrar comparables viejos» are counted back from today, in Mexico", () => {
  assert.equal(oldCutoff(6, "2026-11-26"), "2026-05-26");
  assert.equal(oldCutoff(12, "2026-11-26"), "2025-11-26");
  assert.equal(oldCutoff(24, "2026-11-26"), "2024-11-26");
  assert.equal(oldCutoff(6, "2026-08-31"), "2026-02-28", "the last day of a shorter month");
});
