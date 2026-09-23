import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTerrainSketchSlot,
  TerrainSketchError,
} from "../src/features/files/services/valuation-terrain-sketch";
import { buildValuationTerrainSketchKey } from "../src/infrastructure/storage/storage-keys";

test("la key de croquis separa info-terreno y el slot", () => {
  assert.equal(
    buildValuationTerrainSketchKey("org", "avaluo", "macro", "archivo"),
    "organizaciones/org/avaluos/avaluo/secciones/info-terreno/croquis/macro/archivo.jpg",
  );
  assert.equal(
    buildValuationTerrainSketchKey("org", "avaluo", "micro", "archivo"),
    "organizaciones/org/avaluos/avaluo/secciones/info-terreno/croquis/micro/archivo.jpg",
  );
});

test("solo macro y micro son slots válidos", () => {
  assert.equal(parseTerrainSketchSlot("macro"), "macro");
  assert.equal(parseTerrainSketchSlot("micro"), "micro");
  assert.throws(() => parseTerrainSketchSlot("otro"), TerrainSketchError);
});
