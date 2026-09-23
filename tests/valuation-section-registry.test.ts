import assert from "node:assert/strict";
import test from "node:test";
import {
  getCanonicalSectionKey,
  findSectionDefinition,
  normalizeSectionKey,
  sectionKeyToWorkspaceId,
  valuationSectionRegistry,
} from "../src/features/valuations/sections/section-registry";

test("valuation section registry has unique ordered keys", () => {
  const keys = valuationSectionRegistry.map((section) => section.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(
    valuationSectionRegistry.map((section) => section.order),
    valuationSectionRegistry.map((section) => section.order).sort((a, b) => a - b),
  );
});

test("section key normalization supports route-friendly keys", () => {
  assert.equal(normalizeSectionKey("mercado-venta"), "MERCADO_VENTA");
  assert.equal(normalizeSectionKey("mercadoVenta"), "MERCADO_VENTA");
  assert.equal(findSectionDefinition("terreno")?.key, "TERRENO");
});

test("section key normalization supports compact historical aliases", () => {
  assert.equal(getCanonicalSectionKey("DATOS_GENERALES"), "DATOS_GENERALES");
  assert.equal(getCanonicalSectionKey("datos-generales"), "DATOS_GENERALES");
  assert.equal(getCanonicalSectionKey("datosGenerales"), "DATOS_GENERALES");
  assert.equal(getCanonicalSectionKey("datosgenerales"), "DATOS_GENERALES");
  assert.equal(getCanonicalSectionKey("mercadoventa"), "MERCADO_VENTA");
  assert.equal(getCanonicalSectionKey("mercadorentas"), "MERCADO_RENTAS");
  assert.equal(getCanonicalSectionKey("fotossujeto"), "FOTOS_SUJETO");
  assert.equal(getCanonicalSectionKey("croquiscomparables"), "CROQUIS_COMPARABLES");
  assert.equal(getCanonicalSectionKey("mapacomparables"), "MAPA_COMPARABLES");
  assert.equal(getCanonicalSectionKey("INDICADORES"), "MAPA_COMPARABLES");
  assert.equal(sectionKeyToWorkspaceId("datosgenerales"), "datosGenerales");
});

test("all valuation sections are active by default for the workspace", () => {
  assert.equal(
    valuationSectionRegistry.every((section) => section.visibleByDefault),
    true,
  );
  assert.equal(valuationSectionRegistry.at(-1)?.label, "MAPA COMPARABLES");
});
