import assert from "node:assert/strict";
import test from "node:test";
import {
  buildComparableAssetKey,
  buildOrganizationAssetKey,
  buildValuationAssetKey,
  buildValuationCoverImageKey,
  buildValuationDatosImageKey,
  buildValuationExportKey,
} from "../src/infrastructure/storage/storage-keys";

const organizationUuid = "11111111-1111-4111-8111-111111111111";
const valuationUuid = "22222222-2222-4222-8222-222222222222";
const comparableUuid = "33333333-3333-4333-8333-333333333333";
const fileUuid = "44444444-4444-4444-8444-444444444444";
const blockUuid = "55555555-5555-4555-8555-555555555555";
const subBlockUuid = "66666666-6666-4666-8666-666666666666";

test("construye exactamente la key vigente de imagen principal de Caratula", () => {
  assert.equal(
    buildValuationCoverImageKey(organizationUuid, valuationUuid, fileUuid),
    `organizaciones/${organizationUuid}/avaluos/${valuationUuid}/caratula/imagen-principal/${fileUuid}.jpg`,
  );
});

test("construye una key de imagen de fachada del sujeto", () => {
  assert.equal(
    buildValuationAssetKey(
      organizationUuid,
      valuationUuid,
      ["sujeto", "fachada"],
      fileUuid,
      "webp",
    ),
    `organizaciones/${organizationUuid}/avaluos/${valuationUuid}/sujeto/fachada/${fileUuid}.webp`,
  );
});

test("construye la key privada de una imagen de bloque de Datos", () => {
  assert.equal(
    buildValuationDatosImageKey(
      organizationUuid,
      valuationUuid,
      blockUuid,
      null,
      fileUuid,
    ),
    `organizaciones/${organizationUuid}/avaluos/${valuationUuid}/secciones/datos/bloques/${blockUuid}/imagenes/${fileUuid}.jpg`,
  );
});

test("construye la key privada de una imagen de subbloque de Datos", () => {
  assert.equal(
    buildValuationDatosImageKey(
      organizationUuid,
      valuationUuid,
      blockUuid,
      subBlockUuid,
      fileUuid,
    ),
    `organizaciones/${organizationUuid}/avaluos/${valuationUuid}/secciones/datos/bloques/${blockUuid}/subbloques/${subBlockUuid}/imagenes/${fileUuid}.jpg`,
  );
});

test("construye una key de imagen de comparable", () => {
  assert.equal(
    buildComparableAssetKey(
      organizationUuid,
      valuationUuid,
      comparableUuid,
      "imagenes",
      fileUuid,
      "jpg",
    ),
    `organizaciones/${organizationUuid}/avaluos/${valuationUuid}/comparables/${comparableUuid}/imagenes/${fileUuid}.jpg`,
  );
});

test("construye una key de exportacion PDF", () => {
  assert.equal(
    buildValuationExportKey(organizationUuid, valuationUuid, "pdf", fileUuid),
    `organizaciones/${organizationUuid}/avaluos/${valuationUuid}/exportaciones/pdf/${fileUuid}.pdf`,
  );
});

test("construye assets de organizacion bajo una raiz estandar", () => {
  assert.equal(
    buildOrganizationAssetKey(organizationUuid, "perfil", [], fileUuid, ".JPG"),
    `organizaciones/${organizationUuid}/perfil/${fileUuid}.jpg`,
  );
});

test("rechaza segmentos vacios", () => {
  assert.throws(
    () => buildValuationAssetKey(organizationUuid, "", ["sujeto"], fileUuid, "jpg"),
    /vacios/,
  );
});

test("rechaza path traversal", () => {
  assert.throws(
    () => buildValuationAssetKey(organizationUuid, valuationUuid, [".."], fileUuid, "jpg"),
    /path traversal/,
  );
  assert.throws(
    () => buildValuationAssetKey(organizationUuid, valuationUuid, ["sujeto..privado"], fileUuid, "jpg"),
    /path traversal/,
  );
});

test("rechaza slash interno", () => {
  assert.throws(
    () => buildValuationAssetKey(organizationUuid, valuationUuid, ["sujeto/fachada"], fileUuid, "jpg"),
    /una sola parte/,
  );
});

test("rechaza backslash interno", () => {
  assert.throws(
    () => buildValuationAssetKey(organizationUuid, valuationUuid, ["sujeto\\fachada"], fileUuid, "jpg"),
    /una sola parte/,
  );
});

test("rechaza espacios", () => {
  assert.throws(
    () => buildValuationAssetKey(organizationUuid, valuationUuid, ["sujeto fachada"], fileUuid, "jpg"),
    /espacios/,
  );
});
