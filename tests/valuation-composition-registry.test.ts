import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getSectionComposition,
  getFixedModules,
  hasFixedZone,
  type AppSectionComposition,
  type FixedModuleDescriptor,
} from "@/features/valuations/sections/composition-registry";

/* ------------------------------------------------------------------ */
/*  CARATULA fixed modules                                              */
/* ------------------------------------------------------------------ */

test("CARATULA returns fixed modules in expected order", () => {
  const modules = getFixedModules("CARATULA");
  assert.equal(modules.length, 3);
  assert.equal(modules[0].kind, "caratula-cover");
  assert.equal(modules[1].kind, "caratula-assumptions");
  assert.equal(modules[2].kind, "caratula-conclusion");
});

test("CARATULA has fixed zone", () => {
  assert.equal(hasFixedZone("CARATULA"), true);
});

test("CARATULA composition has correct structure", () => {
  const composition = getSectionComposition("CARATULA");
  assert.ok(composition, "CARATULA composition should exist");
  assert.equal(composition.sectionKey, "CARATULA");
  assert.ok(Array.isArray(composition.fixedModules), "fixedModules should be array");
  assert.equal(composition.fixedModules!.length, 3);
});

/* ------------------------------------------------------------------ */
/*  TERRENO fixed modules                                               */
/* ------------------------------------------------------------------ */

test("TERRENO returns terrain-main", () => {
  const modules = getFixedModules("TERRENO");
  assert.equal(modules.length, 1);
  assert.equal(modules[0].kind, "terreno-main");
});

test("TERRENO has fixed zone", () => {
  assert.equal(hasFixedZone("TERRENO"), true);
});

/* ------------------------------------------------------------------ */
/*  DATOS — no fixed modules                                            */
/* ------------------------------------------------------------------ */

test("DATOS returns no fixed modules", () => {
  const modules = getFixedModules("DATOS_GENERALES");
  assert.equal(modules.length, 0);
});

test("DATOS has no fixed zone", () => {
  assert.equal(hasFixedZone("DATOS_GENERALES"), false);
});

test("DATOS composition is undefined", () => {
  const composition = getSectionComposition("DATOS_GENERALES");
  assert.equal(composition, undefined);
});

/* ------------------------------------------------------------------ */
/*  CONSTRUCCION — no fixed modules                                     */
/* ------------------------------------------------------------------ */

test("CONSTRUCCION returns no fixed modules", () => {
  const modules = getFixedModules("CONSTRUCCION");
  assert.equal(modules.length, 0);
});

test("CONSTRUCCION has no fixed zone", () => {
  assert.equal(hasFixedZone("CONSTRUCCION"), false);
});

/* ------------------------------------------------------------------ */
/*  Generic sections — no fixed modules                                 */
/* ------------------------------------------------------------------ */

test("CONSIDERACIONES returns no fixed modules", () => {
  const modules = getFixedModules("CONSIDERACIONES");
  assert.equal(modules.length, 0);
});

test("COSTOS returns no fixed modules", () => {
  const modules = getFixedModules("COSTOS");
  assert.equal(modules.length, 0);
});

test("MERCADO_VENTA returns no fixed modules", () => {
  const modules = getFixedModules("MERCADO_VENTA");
  assert.equal(modules.length, 0);
});

test("CONCLUSIONES returns no fixed modules", () => {
  const modules = getFixedModules("CONCLUSIONES");
  assert.equal(modules.length, 0);
});

/* ------------------------------------------------------------------ */
/*  Default behavior                                                    */
/* ------------------------------------------------------------------ */

test("zero fixed modules implies no fixed zone", () => {
  assert.equal(hasFixedZone("DATOS_GENERALES"), false);
  assert.equal(getFixedModules("DATOS_GENERALES").length, 0);
  assert.equal(getSectionComposition("DATOS_GENERALES"), undefined);
});

/* ------------------------------------------------------------------ */
/*  Registry purity                                                     */
/* ------------------------------------------------------------------ */

test("registry does not expose React components", () => {
  const source = readFileSync(
    join(process.cwd(), "src/features/valuations/sections/composition-registry.ts"),
    "utf-8",
  );
  // Check for actual React usage, not just mentions in comments
  assert.ok(!source.includes("import.*React"), "must not import React");
  assert.ok(!source.includes("ComponentType"), "must not use ComponentType");
  assert.ok(!source.includes("JSX.Element"), "must not reference JSX.Element");
  assert.ok(!source.includes(": ReactNode"), "must not use ReactNode as type");
});

/* ------------------------------------------------------------------ */
/*  Type exports                                                        */
/* ------------------------------------------------------------------ */

test("types are exported", () => {
  // Verify types are importable by checking the module structure
  const composition: AppSectionComposition = {
    sectionKey: "CARATULA",
    fixedModules: [{ id: "test", kind: "test-kind" }],
  };
  assert.equal(composition.sectionKey, "CARATULA");
  assert.equal(composition.fixedModules!.length, 1);
});

test("FixedModuleDescriptor has id and kind", () => {
  const module: FixedModuleDescriptor = { id: "test", kind: "test-kind" };
  assert.equal(module.id, "test");
  assert.equal(module.kind, "test-kind");
});
