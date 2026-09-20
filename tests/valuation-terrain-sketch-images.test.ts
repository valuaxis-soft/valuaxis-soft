import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  parseTerrainSketchSlot,
  TerrainSketchError,
} from "../src/features/files/services/valuation-terrain-sketch";
import { buildValuationTerrainSketchKey } from "../src/infrastructure/storage/storage-keys";

const root = process.cwd();

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

test("el servicio registra Archivo, RelacionArchivo, CargaArchivo e historial por slot", () => {
  const service = readFileSync(
    join(root, "src/features/files/services/valuation-terrain-sketch.ts"),
    "utf8",
  );

  assert.match(service, /tx\.archivo\.create/);
  assert.match(service, /tx\.relacionArchivo\.create/);
  assert.match(service, /tx\.cargaArchivo\.create/);
  assert.match(service, /SEntidad: TERRAIN_SKETCH_ENTITY/);
  assert.match(service, /SIdentificadorEntidad: input\.valuation\.publicId/);
  assert.match(service, /BPrivado: true/);
  assert.match(service, /uso: TERRAIN_SKETCH_USAGE/);
  assert.match(service, /sectionKey: "info-terreno"/);
  assert.match(service, /elementKey: "croquis-localizacion"/);
  assert.match(service, /slot,/);
  assert.match(service, /data: \{ BPrincipal: false \}/);
  assert.match(service, /SIdentificadorCarga: input\.filePublicId/);
  assert.doesNotMatch(
    service.match(/await tx\.cargaArchivo\.create\(\{([\s\S]*?)\n    \}\);/)?.[1] ?? "",
    /input\.upload\.key/,
  );
});

test("el servicio usa URL privada y limpia S3 si falla la persistencia", () => {
  const service = readFileSync(
    join(root, "src/features/files/services/valuation-terrain-sketch.ts"),
    "utf8",
  );
  assert.match(service, /getPrivateDownloadUrl/);
  assert.match(service, /storageProvider\.deleteObject\(upload\.key\)/);
  assert.match(service, /generateDownloadUrl: false/);
});

test("el endpoint específico expone GET y POST con sesión", () => {
  const route = readFileSync(
    join(root, "src/app/api/avaluos/[id]/info-terreno/croquis/route.ts"),
    "utf8",
  );
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /getCurrentUser/);
  assert.match(route, /listTerrainSketches/);
  assert.match(route, /replaceTerrainSketch/);
});
