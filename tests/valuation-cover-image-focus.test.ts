import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CaratulaCoverModule } from "../src/features/valuations/components/caratula-preview-modules";
import { caratulaFromValuation, initialMetaFor } from "../src/features/valuations/components/workspace/model/initial-hydration";
import type { CaratulaFormData, PrincipalCoverImage, ValuationMeta } from "../src/features/valuations/model";
import {
  COVER_IMAGE_FOCUS_CENTER,
  DEFAULT_COVER_IMAGE_SIZE,
  coverImageObjectPosition,
  coverImageStyle,
  normalizeCoverImageFocus,
  normalizeCoverImageSize,
  coverImagePannableAxes,
  COVER_BOX_RATIO,
  coverImageLayout,
} from "../src/features/valuations/services/cover-image-focus";
import { readCompanyHeaderFields, updateCompanyHeaderFields } from "../src/features/valuations/services/caratula-company-header";
import { buildSectionsPayload } from "../src/features/valuations/components/workspace/model/save-payload";
import { hydrateBlockMetadata } from "../src/features/valuations/metadata";
import type { AppSection } from "../src/features/valuations/model";
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

  assert.match(cover({}), /<figure[^>]*style="width:100%;height:294px"[^>]*><img[^>]*style="width:100%;height:100%;object-fit:cover;object-position:50% 50%"/);
  assert.match(cover({ enfoqueImagenPrincipal: { x: 50, y: 15 } }), /style="width:100%;height:100%;object-fit:cover;object-position:50% 15%"/);
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

test("only an image wider than the cover box moves sideways; only a taller one moves up and down", () => {
  assert.deepEqual(coverImagePannableAxes(4 / 3), { x: false, y: true }, "a normal photo fills the width");
  assert.deepEqual(coverImagePannableAxes(COVER_BOX_RATIO * 1.5), { x: true, y: false }, "a panorama fills the height");
  assert.deepEqual(coverImagePannableAxes(COVER_BOX_RATIO), { x: false, y: false });
  assert.deepEqual(coverImagePannableAxes(null), { x: true, y: true }, "unknown size: both sliders stay");
});

test("the size of the cover image: absent fills the box as always; whole or scaled, around the focus", () => {
  assert.deepEqual(normalizeCoverImageSize(undefined), DEFAULT_COVER_IMAGE_SIZE);
  assert.deepEqual(normalizeCoverImageSize({ fit: "contain", scale: 72.4 }), { fit: "contain", scale: 72 });
  assert.deepEqual(normalizeCoverImageSize({ fit: "stretch", scale: 900 }), { fit: "cover", scale: 200 }, "unknown fit fills; scale clamped");
  assert.deepEqual(normalizeCoverImageSize({ scale: 10 }), { fit: "cover", scale: 50 });

  assert.deepEqual(coverImageStyle(undefined, undefined), { objectFit: "cover", objectPosition: "50% 50%" }, "no transform: the cover of before");
  assert.deepEqual(coverImageStyle({ x: 20, y: 80 }, { fit: "contain", scale: 100 }), { objectFit: "contain", objectPosition: "20% 80%" });
  assert.deepEqual(coverImageStyle({ x: 50, y: 30 }, { fit: "cover", scale: 150 }), {
    objectFit: "cover", objectPosition: "50% 30%", transform: "scale(1.5)", transformOrigin: "50% 30%",
  });
});

test("the printed cover shows the whole image with no background around it, the box as tall as the image", () => {
  const meta = { location: "Arandas, Jalisco" } as ValuationMeta;
  const principalImage: PrincipalCoverImage = { id: "img", filename: "auto.jpg", mimeType: "image/jpeg", size: 1, url: "https://example.test/auto.jpg" };
  const cover = (tamanoImagenPrincipal: CaratulaFormData["tamanoImagenPrincipal"]) => renderToStaticMarkup(createElement(CaratulaCoverModule, {
    caratula: { tituloInmueble: "Vehículo", tamanoImagenPrincipal } as CaratulaFormData, meta, principalImage,
  }));
  const whole = cover({ fit: "contain", scale: 80 });
  assert.match(whole, /<figure class="[^"]*bg-white"[^>]*style="width:100%"/, "white, and no fixed height: the page below moves up");
  assert.doesNotMatch(whole, /bg-slate-100|h-\[294px\]/);
  assert.match(whole, /<img[^>]*style="width:auto;height:auto;max-width:80%;max-height:235px"/);

  // Filling the box, a smaller image takes a smaller box of the same shape.
  assert.match(cover({ fit: "cover", scale: 60 }), /<figure[^>]*style="width:60%;height:176px"/);
  // Larger, it zooms in inside the box of always.
  assert.match(cover({ fit: "cover", scale: 150 }), /<figure[^>]*style="width:100%;height:294px"[^>]*><img[^>]*transform:scale\(1.5\);transform-origin:50% 50%/);

  assert.deepEqual(coverImageLayout({ x: 30, y: 70 }, { fit: "contain", scale: 120 }).image, {
    width: "auto", height: "auto", maxWidth: "100%", maxHeight: "294px", transform: "scale(1.2)", transformOrigin: "30% 70%",
  });
});

test("whole up to its size there is nothing to move; scaled up, both move", () => {
  assert.deepEqual(coverImagePannableAxes(COVER_BOX_RATIO * 1.5, { fit: "contain", scale: 100 }), { x: false, y: false }, "the box is the image itself");
  assert.deepEqual(coverImagePannableAxes(4 / 3, { fit: "contain", scale: 70 }), { x: false, y: false });
  assert.deepEqual(coverImagePannableAxes(4 / 3, { fit: "contain", scale: 140 }), { x: true, y: true });
  assert.deepEqual(coverImagePannableAxes(4 / 3, { fit: "cover", scale: 140 }), { x: true, y: true });
  assert.deepEqual(coverImagePannableAxes(4 / 3, { fit: "cover", scale: 60 }), { x: false, y: true }, "a smaller box keeps the cover's shape");
});

test("the size travels with the carátula form and is kept with the company header block, read back the same", () => {
  const sections = [{ id: "caratula", label: "", title: "CARÁTULA", sourceFile: "", enabled: true, required: true, blocks: [] }] as AppSection[];
  const sized = updateCompanyHeaderFields(sections, { tamanoImagenPrincipal: { fit: "contain", scale: 90 } });
  assert.deepEqual(readCompanyHeaderFields(sized).tamanoImagenPrincipal, { fit: "contain", scale: 90 });
  const header = buildSectionsPayload(sized)[0].blocks.find((block) => block.id === "caratula-company-header");
  assert.deepEqual(header?.coverImageSize, { fit: "contain", scale: 90 });
  assert.deepEqual(hydrateBlockMetadata({ kind: "block", payload: header }).coverImageSize, { fit: "contain", scale: 90 });

  // Back to the default it is no size at all, as a cover saved before the size existed.
  const reset = updateCompanyHeaderFields(sized, { tamanoImagenPrincipal: DEFAULT_COVER_IMAGE_SIZE });
  assert.equal(readCompanyHeaderFields(reset).tamanoImagenPrincipal, undefined);
  assert.equal(hydrateBlockMetadata({ kind: "block", payload: {} }).coverImageSize, undefined);
  assert.equal(saveFullValuationSchema.safeParse({ caratula: { tamanoImagenPrincipal: { fit: "contain", scale: 90 } } }).success, true);
  assert.equal(saveFullValuationSchema.safeParse({ caratula: { tamanoImagenPrincipal: { fit: "zoom", scale: 90 } } }).success, false);
});
