/**
 * The screenshot and photos the appraiser pastes for a listing before its
 * comparable exists, and the figures of a listing read in code.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCount, parsePostalCode, parsePublicationId } from "../src/features/ai/text-figures";
import { streetTypeOfName } from "../src/features/valuations/calculation/comparable-card";
import { MAX_COMPARABLE_PHOTOS } from "../src/features/valuations/calculation/market-types";
import { addListingImages, NO_IMAGES, promoteToScreenshot, uploadListingImages } from "../src/features/valuations/comparable-search/listing-images";

const image = (name: string, type = "image/png") => new File([new Uint8Array([1, 2, 3])], name, { type });

test("the first image pasted is the screenshot, the rest are photos, up to the ten a comparable keeps", () => {
  const first = addListingImages(NO_IMAGES, [image("captura.png"), image("foto-1.jpg", "image/jpeg")]);
  assert.equal(first.images.screenshot?.name, "captura.png");
  assert.deepEqual(first.images.photos.map((file) => file.name), ["foto-1.jpg"]);
  // With a screenshot, what comes next is a photo.
  const second = addListingImages(first.images, [image("foto-2.webp", "image/webp")]);
  assert.equal(second.images.screenshot?.name, "captura.png");
  assert.equal(second.images.photos.length, 2);
  // A HEIC or a PDF is not taken, and it is counted to say so.
  const odd = addListingImages(second.images, [image("foto.heic", "image/heic"), image("anuncio.pdf", "application/pdf")]);
  assert.equal(odd.rejected, 2);
  assert.equal(odd.images.photos.length, 2);
  const many = addListingImages(first.images, Array.from({ length: 12 }, (_, index) => image(`f${index}.png`)));
  assert.equal(many.images.photos.length, MAX_COMPARABLE_PHOTOS);
  assert.equal(many.overflow, 12 - (MAX_COMPARABLE_PHOTOS - 1));
});

test("a photo can be made the screenshot, and the screenshot there was becomes a photo", () => {
  const images = { screenshot: image("a.png"), photos: [image("b.png"), image("c.png")] };
  const swapped = promoteToScreenshot(images, 1);
  assert.equal(swapped.screenshot?.name, "c.png");
  assert.deepEqual(swapped.photos.map((file) => file.name), ["a.png", "b.png"]);
  assert.equal(promoteToScreenshot(images, 9), images);
});

test("the images of a new comparable go up the screenshot first, then the photos in order; a failure does not stop the rest", async () => {
  const calls: string[] = [];
  const outcome = await uploadListingImages({ screenshot: image("captura.png"), photos: [image("1.png"), image("2.png")] }, {
    screenshot: async (file) => { calls.push(`pantalla:${file.name}`); return calls.length; },
    photo: async (file) => {
      calls.push(`foto:${file.name}`);
      if (file.name === "1.png") throw new Error("La imagen pesa más de 10 MB.");
      return calls.length;
    },
  });
  assert.deepEqual(calls, ["pantalla:captura.png", "foto:1.png", "foto:2.png"]);
  assert.equal(outcome.uploaded, 2);
  assert.equal(outcome.failed, 1);
  assert.match(String(outcome.firstError), /10 MB/);
  assert.equal(outcome.latest, 3);
});

test("counts, postal codes and listing ids are read in code from what the listing wrote", () => {
  assert.equal(parseCount("3 recámaras"), 3);
  assert.equal(parseCount("dos plantas"), 2);
  assert.equal(parseCount("una recámara"), 1);
  assert.equal(parseCount("2.5 baños", { halves: true }), 2.5);
  assert.equal(parseCount("2.5 recámaras"), null);
  assert.equal(parseCount("varias recámaras"), null);
  assert.equal(parsePostalCode("C.P. 47600"), "47600");
  assert.equal(parsePostalCode("Tel. 3312345678"), null);
  assert.equal(parsePublicationId("ID: 145-998"), "145-998");
  assert.equal(parsePublicationId("Clave EB-XK1234"), "EB-XK1234");
  assert.equal(parsePublicationId("Código de propiedad: 88123"), "88123");
  assert.equal(parsePublicationId("ID del anuncio"), null);
  // The ways a listing labels its id: the label goes, the id stays.
  assert.equal(parsePublicationId("Publicación No. 998877"), "998877");
  assert.equal(parsePublicationId("No. de publicación: 998877"), "998877");
  assert.equal(parsePublicationId("Anuncio #A-5521"), "A-5521");
  assert.equal(parsePublicationId("Folio 4521"), "4521");
  assert.equal(parsePublicationId("Clave: TX-0099"), "TX-0099");
  assert.equal(parsePublicationId("ID-145998"), "145998");
  assert.equal(parsePublicationId("Publicación reciente"), null);
});

test("a road read from a listing keeps the type its name already says", () => {
  assert.equal(streetTypeOfName("Av. Inventada"), "AVENIDA");
  assert.equal(streetTypeOfName("Avenida Inventada"), "AVENIDA");
  assert.equal(streetTypeOfName("Blvr. Ficticio"), "BOULEVARD");
  assert.equal(streetTypeOfName("Priv. Ejemplo"), "PRIVADA");
  assert.equal(streetTypeOfName("Inventada"), null);
});
