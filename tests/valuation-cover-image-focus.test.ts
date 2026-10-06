import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CaratulaCoverModule } from "../src/features/valuations/components/caratula-preview-modules";
import { caratulaFromValuation, initialMetaFor } from "../src/features/valuations/components/workspace/model/initial-hydration";
import type { CaratulaFormData, PrincipalCoverImage, ValuationMeta } from "../src/features/valuations/model";
import {
  COVER_IMAGE_FOCUS_CENTER,
  coverImageObjectPosition,
  normalizeCoverImageFocus,
} from "../src/features/valuations/services/cover-image-focus";
import { saveFullValuationSchema } from "../src/features/valuations/validations/valuation-api.schemas";

test("a cover image focus is whole and inside 0–100 on both axes; anything unreadable is the center", () => {
  assert.deepEqual(normalizeCoverImageFocus({ x: 20, y: 80 }), { x: 20, y: 80 });
  assert.deepEqual(normalizeCoverImageFocus({ x: -5, y: 140 }), { x: 0, y: 100 });
  assert.deepEqual(normalizeCoverImageFocus({ x: 33.6, y: 0 }), { x: 34, y: 0 });
  assert.deepEqual(normalizeCoverImageFocus({ x: "10", y: Number.NaN }), COVER_IMAGE_FOCUS_CENTER);
  assert.deepEqual(normalizeCoverImageFocus({ y: 10 }), { x: 50, y: 10 }, "a missing axis stays centered");
  for (const unreadable of [null, undefined, "50% 50%", 7]) {
    assert.deepEqual(normalizeCoverImageFocus(unreadable), COVER_IMAGE_FOCUS_CENTER);
  }
});

test("the focus is the object-position of the image", () => {
  assert.equal(coverImageObjectPosition({ x: 0, y: 100 }), "0% 100%");
  assert.equal(coverImageObjectPosition(undefined), "50% 50%");
  assert.equal(coverImageObjectPosition({ x: 500, y: -1 }), "100% 0%");
});

test("the printed cover crops the principal image around its focus, centered by default", () => {
  const meta = { location: "Arandas, Jalisco" } as ValuationMeta;
  const principalImage: PrincipalCoverImage = { id: "img", filename: "fachada.jpg", mimeType: "image/jpeg", size: 1, url: "https://example.test/fachada.jpg" };
  const cover = (caratula: Partial<CaratulaFormData>) =>
    renderToStaticMarkup(createElement(CaratulaCoverModule, { caratula: { tituloInmueble: "Edificio", ...caratula } as CaratulaFormData, meta, principalImage }));

  assert.match(cover({}), /object-cover[^>]*style="object-position:50% 50%"/);
  assert.match(cover({ enfoqueImagenPrincipal: { x: 50, y: 15 } }), /style="object-position:50% 15%"/);
});

test("a valuation opens with its stored focus, or centered when it never had one", () => {
  const meta = initialMetaFor(null);
  assert.deepEqual(caratulaFromValuation(null, meta, []).enfoqueImagenPrincipal, COVER_IMAGE_FOCUS_CENTER);
  const stored = { caratula: { enfoqueImagenPrincipal: { x: 10, y: 90 } } } as Parameters<typeof caratulaFromValuation>[0];
  assert.deepEqual(caratulaFromValuation(stored, meta, []).enfoqueImagenPrincipal, { x: 10, y: 90 });
});

test("the full save accepts the focus next to the carátula's texts", () => {
  assert.equal(saveFullValuationSchema.safeParse({ caratula: { folio: "VLO-1", enfoqueImagenPrincipal: { x: 10, y: 90 } } }).success, true);
  assert.equal(saveFullValuationSchema.safeParse({ caratula: { enfoqueImagenPrincipal: { x: "10", y: 90 } } }).success, false);
  assert.equal(saveFullValuationSchema.safeParse({ caratula: { enfoqueImagenPrincipal: "arriba" } }).success, false);
});
