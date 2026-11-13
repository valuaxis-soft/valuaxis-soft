/**
 * Observations of the appraiser's videos 5.4 and 6.x on the comparables:
 * coordinates as Google Earth copies them, the card with the names of the
 * characteristics and the land area, the states of the review, the form's
 * checks and the clipboard. Made-up data only.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { characteristicLabelOf, parseCoordinate, parseCoordinatePair } from "../src/features/valuations/calculation/comparable-card";
import type { ComparableCardDto } from "../src/features/valuations/calculation/comparable-card.service";
import {
  REVIEW_CHECK_HINTS,
  REVIEW_CHECK_LABELS,
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  groupByComparableType,
  isVerifiedStatus,
  markAllChecks,
  statusAfterLinkCheck,
} from "../src/features/valuations/calculation/comparable-review";
import { comparableValidity } from "../src/features/valuations/calculation/comparable-validity";
import { comparableReviewSchema } from "../src/features/valuations/calculation/market-schemas";
import { COMPARABLE_TYPES, type ComparableDto, type ComparableType } from "../src/features/valuations/calculation/market-types";
import { ComparableCardView } from "../src/features/valuations/components/calculation/comparable-card-view";
import { buildingFieldsOf, openableUrl } from "../src/features/valuations/components/calculation/comparable-dialog";
import { filesAsChangeEvent, pastedImages } from "../src/features/files/clipboard-image";
import { NOT_AN_IMAGE_MESSAGE, imageContentProblem } from "../src/features/files/image-content";

test("V6.2-01: coordinates pasted as Google Earth copies them become decimals; O and W are west", () => {
  assert.equal(parseCoordinate(`20°43'31.39"N`), 20.7253861);
  assert.equal(parseCoordinate(`102°20'44.85"O`), -102.3457917);
  assert.equal(parseCoordinate(`102°20'44.85"W`), -102.3457917);
  assert.equal(parseCoordinate("102 20 44.85 W"), -102.3457917);
  assert.equal(parseCoordinate(`33°51'0"S`), -33.85);
  assert.equal(parseCoordinate("20.7092"), 20.7092);
  assert.equal(parseCoordinate("-102,3467"), -102.3467);
  assert.equal(parseCoordinate("México"), null);
  assert.equal(parseCoordinate(`20°75'00"N`), null, "minutes go up to 59");
  assert.deepEqual(parseCoordinatePair(`20°43'31.39"N 102°20'44.85"O`), { latitude: 20.7253861, longitude: -102.3457917 });
  assert.deepEqual(parseCoordinatePair("20.7092, -102.3467"), { latitude: 20.7092, longitude: -102.3467 });
  assert.equal(parseCoordinatePair("20.7092"), null);
});

test("V5.4-07: an added characteristic shows its name, never its internal key", () => {
  const labels = { "custom:mvqs43pb": "N° DORMITORIOS" };
  assert.equal(characteristicLabelOf("custom:mvqs43pb", labels), "N° dormitorios");
  assert.equal(characteristicLabelOf("edad-mvqrj8g8"), "Edad");
  assert.equal(characteristicLabelOf("custom:vista-al-mar"), "Vista al mar");
  assert.equal(characteristicLabelOf("custom:mvqs43pb"), "Característica adicional");
});

const comparable = (extra: Partial<ComparableDto> = {}): ComparableDto => ({
  id: "comparable-prueba", reference: 2, location: "Calle Inventada 12, Arandas, Jalisco", area: 360, price: 1_080_000, landUse: "Habitacional",
  shape: "Regular", zone: "Similar", frontage: 12, depth: 30, topography: "Plana", services: "Todos", notes: null, sourceName: "Portal de prueba",
  contactName: null, contactPhone: null, url: null, offerDate: null, photos: [], factors: [], ...extra,
});
const card = (type: ComparableType, item: ComparableDto, characteristicLabels?: Record<string, string>): ComparableCardDto => ({
  comparable: item, type, valuation: null, validity: comparableValidity("2026-11-01", "2026-11-12"), warnings: [], uses: [], history: [], characteristicLabels,
});
/** The text of the table of a section of the card, by its title. */
const sectionText = (html: string, title: string) => {
  const start = html.indexOf(`>${title}<`);
  assert.ok(start >= 0, `section ${title}`);
  return html.slice(start, html.indexOf("</section>", start)).replace(/<[^>]+>/g, " ");
};

test("V5.4-07 and V5.4-12: the card names the characteristics and shows the land area under TERRENO", () => {
  const land = renderToStaticMarkup(
    <ComparableCardView card={card("TERRENO_VENTA", comparable({ extra: { "custom:mvqs43pb": "3", "edad-mvqrj8g8": "30" } }), { "custom:mvqs43pb": "N° DORMITORIOS" })} />,
  );
  const characteristics = sectionText(land, "Características y observaciones");
  assert.match(characteristics, /N° dormitorios\s+3/);
  assert.match(characteristics, /Edad\s+30/);
  assert.doesNotMatch(characteristics, /mvqs43pb|mvqrj8g8/);
  assert.match(sectionText(land, "Terreno"), /Superficie de terreno \(m²\)\s+360/);

  const built = renderToStaticMarkup(<ComparableCardView card={card("INMUEBLE_VENTA", comparable({ area: 180, landArea: 250 }))} />);
  assert.match(sectionText(built, "Terreno"), /Superficie de terreno \(m²\)\s+250/);
});

test("V5.4-06: the review states, the old VERIFICADO read as «vigente», and the link check moves the state", () => {
  assert.deepEqual(REVIEW_STATUSES.map((status) => REVIEW_STATUS_LABELS[status]), [
    "Sin revisar", "Verificado y vigente", "Verificado y no vigente", "Con observaciones", "Rechazado",
  ]);
  assert.ok(comparableReviewSchema.safeParse({ status: "VERIFICADO_NO_VIGENTE", checks: { link: false }, notes: null }).success);
  assert.ok(isVerifiedStatus("VERIFICADO") && isVerifiedStatus("VERIFICADO_NO_VIGENTE") && !isVerifiedStatus("POR_REVISAR"));
  assert.equal(statusAfterLinkCheck("VERIFICADO", false), "VERIFICADO_NO_VIGENTE");
  assert.equal(statusAfterLinkCheck("POR_REVISAR", false), "VERIFICADO_NO_VIGENTE");
  assert.equal(statusAfterLinkCheck("VERIFICADO_NO_VIGENTE", true), "VERIFICADO");
  assert.equal(statusAfterLinkCheck("RECHAZADO", true), "RECHAZADO");
  assert.equal(statusAfterLinkCheck("CON_OBSERVACIONES", false), "CON_OBSERVACIONES");
});

test("V5.4-06 (13 nov): with every check marked, unmarking the link gives «no vigente» and marking it again «vigente», in any order", () => {
  // All marked: the appraiser verified the comparable.
  const marked = markAllChecks(["photo", "price", "link"], "POR_REVISAR");
  let status = marked.status;
  assert.equal(status, "VERIFICADO");
  for (let round = 0; round < 3; round++) {
    status = statusAfterLinkCheck(status, false);
    assert.equal(REVIEW_STATUS_LABELS[status], "Verificado y no vigente", `unmarked, round ${round}`);
    status = statusAfterLinkCheck(status, true);
    assert.equal(REVIEW_STATUS_LABELS[status], "Verificado y vigente", `marked again, round ${round}`);
  }
  assert.equal(marked.checks.link, true);
  // Marking the link alone does not verify a comparable nobody reviewed.
  assert.equal(statusAfterLinkCheck("POR_REVISAR", true), "POR_REVISAR");
  // Observations and rejections never move.
  for (const kept of ["CON_OBSERVACIONES", "RECHAZADO"] as const) {
    assert.equal(statusAfterLinkCheck(kept, false), kept);
    assert.equal(statusAfterLinkCheck(kept, true), kept);
    assert.equal(markAllChecks(["link"], kept).status, kept);
  }
  // The box says what unmarking it means.
  assert.match(`${REVIEW_CHECK_LABELS.link} (${REVIEW_CHECK_HINTS.link})`, /^El enlace sigue vigente \(desmárcalo si el anuncio ya caducó\)$/);
  assert.equal(markAllChecks(["link"], "VERIFICADO_NO_VIGENTE").status, "VERIFICADO");
});

test("V6.1-17 and V5.4-13: «Marcar todas» marks every check shown, and the review is grouped by market", () => {
  assert.deepEqual(markAllChecks(["photo", "price", "link"], "POR_REVISAR"), { checks: { photo: true, price: true, link: true }, status: "VERIFICADO" });
  assert.deepEqual(markAllChecks(["photo"], "POR_REVISAR").status, "POR_REVISAR");
  const rows = [
    { type: "INMUEBLE_VENTA" as const, id: "a" }, { type: "TERRENO_VENTA" as const, id: "b" }, { type: "INMUEBLE_VENTA" as const, id: "c" },
  ];
  assert.deepEqual(groupByComparableType(rows, COMPARABLE_TYPES).map((group) => [group.type, group.rows.map((row) => row.id)]), [
    ["TERRENO_VENTA", ["b"]], ["INMUEBLE_VENTA", ["a", "c"]],
  ]);
});

test("V6.3-16: an autofilled «México» in the land area says which field and what it holds", () => {
  const problem = buildingFieldsOf({ landArea: "México", bedrooms: "", bathrooms: "" });
  assert.ok("error" in problem);
  assert.equal(problem.field, "landArea");
  assert.match(problem.error, /Superficie de terreno \(m²\) dice «México»/);
  assert.deepEqual(buildingFieldsOf({ landArea: "250", bedrooms: "3", bathrooms: "2.5" }), { landArea: 250, bedrooms: 3, bathrooms: 2.5 });
});

test("V5.4-08: «Ver anuncio» opens only a web link", () => {
  assert.equal(openableUrl("https://portal.example/anuncio/1"), "https://portal.example/anuncio/1");
  assert.equal(openableUrl("portal.example/anuncio"), null);
  assert.equal(openableUrl("javascript:alert(1)"), null);
});

test("V5.4-05: a pasted screenshot is taken as an image file, and handed to the upload handlers of a file input", () => {
  const png = new File([new Uint8Array([137, 80, 78, 71])], "image.png", { type: "image/png" });
  const items = [
    { kind: "string", type: "text/plain", getAsFile: () => null },
    { kind: "file", type: "image/png", getAsFile: () => png },
    { kind: "file", type: "image/png", getAsFile: () => png },
  ] as unknown as DataTransferItem[];
  assert.deepEqual(pastedImages(items, "foto-comparable").map((file) => file.name), ["foto-comparable.png", "foto-comparable-2.png"]);
  const event = filesAsChangeEvent([png]);
  assert.equal(event.target.files?.[0], png);
  assert.equal(event.target.files?.length, 1);
  event.target.value = "";
});

test("V5.5-05: a file that is not an image gets one clear message, with accents and what to do", () => {
  assert.equal(NOT_AN_IMAGE_MESSAGE, "El archivo no es una imagen JPG, PNG o WebP. Si es una foto del iPhone (HEIC), ábrela y expórtala como JPG.");
  assert.equal(imageContentProblem(undefined), NOT_AN_IMAGE_MESSAGE, "unreadable content: the message of every upload");
  // A real image of another kind says what it is, within the same message.
  assert.equal(
    imageContentProblem("heif"),
    "El archivo no es una imagen JPG, PNG o WebP: es HEIC/HEIF, y cambiarle la extensión no la convierte. Si es una foto del iPhone (HEIC), ábrela y expórtala como JPG.",
  );
  assert.doesNotMatch(NOT_AN_IMAGE_MESSAGE, /valida/);
});

test("V5.4-10: the card shows «Tipo de vialidad» and «Vialidad»; a comparable of before reads «Calle»", () => {
  const avenue = renderToStaticMarkup(
    <ComparableCardView card={card("TERRENO_VENTA", comparable({ address: { streetType: "AVENIDA", street: "Inventada", number: "488" } }))} />,
  );
  assert.match(sectionText(avenue, "Ubicación"), /Tipo de vialidad\s+Avenida\s+Vialidad\s+Inventada/);
  const before = renderToStaticMarkup(<ComparableCardView card={card("TERRENO_VENTA", comparable({ address: { street: "Roble", number: "12" } }))} />);
  assert.match(sectionText(before, "Ubicación"), /Tipo de vialidad\s+Calle\s+Vialidad\s+Roble/);
  // Its printed line stays as it was stored.
  assert.match(sectionText(before, "Ubicación"), /Calle Inventada 12, Arandas, Jalisco/);
});
