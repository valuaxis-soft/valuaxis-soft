import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("las imágenes de Datos usan Archivo, RelacionArchivo y metadatos de ubicación", () => {
  const service = readFileSync(
    join(root, "src/features/files/services/valuation-datos-image.ts"),
    "utf8",
  );

  assert.match(service, /tx\.archivo\.create/);
  assert.match(service, /tx\.relacionArchivo\.create/);
  assert.match(service, /SEntidad: DATOS_IMAGE_ENTITY/);
  assert.match(service, /BPrivado: true/);
  assert.match(service, /uso: DATOS_IMAGE_USAGE/);
  assert.match(service, /sectionKey: "datos"/);
  assert.match(service, /blockId/);
  assert.match(service, /subblockId: subBlockId/);
  assert.match(service, /getPrivateDownloadUrl/);
});

test("el workspace guarda también imágenes pertenecientes a subbloques", () => {
  const workspace = readFileSync(
    join(root, "src/features/valuations/components/workspace/valuation-workspace.tsx"),
    "utf8",
  );

  assert.match(
    workspace,
    /apartados: b\.apartados\.map[\s\S]*images: sb\.images\.map/,
  );
  assert.match(workspace, /api\.valuations\.datosImages\.upload/);
  assert.match(workspace, /api\.valuations\.datosImages\s*\.list/);
});

test("CargaArchivo usa un identificador corto y no duplica la key S3 definitiva", () => {
  const service = readFileSync(
    join(root, "src/features/files/services/valuation-datos-image.ts"),
    "utf8",
  );
  const cargaCreate = service.match(/await tx\.cargaArchivo\.create\(\{([\s\S]*?)\n    \}\);/)?.[1] ?? "";

  assert.match(cargaCreate, /SIdentificadorCarga: input\.filePublicId/);
  assert.doesNotMatch(cargaCreate, /input\.upload\.key/);
  assert.match(service, /storageProvider\.deleteObject\(upload\.key\)/);
  assert.match(service, /No se pudo registrar la imagen\. Intenta nuevamente\./);
});
