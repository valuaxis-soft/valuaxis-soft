import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUser } from "../src/features/auth/model";
import {
  deleteDocumentHeaderImage,
  getDocumentHeaderImage,
  HEADER_IMAGE_ENTITY,
  HEADER_IMAGE_MIME_TYPES,
  HEADER_IMAGE_USAGE,
  replaceDocumentHeaderImage,
  type DocumentHeaderImageServiceDependencies,
} from "../src/features/files/services/valuation-document-header-image";
import { buildValuationDocumentHeaderImageKey } from "../src/infrastructure/storage/storage-keys";

const user: AuthUser = {
  id: 7,
  name: "Valuador",
  email: "valuador@example.com",
  role: "VALUADOR",
  active: true,
  organizationId: 3,
  organizationName: "Organizacion",
};

const valuation = {
  id: 11,
  publicId: "22222222-2222-4222-8222-222222222222",
  organizationId: 3,
  organizationPublicId: "11111111-1111-4111-8111-111111111111",
  status: "EN_EDICION",
  locked: false,
};

function serviceDependencies(
  overrides: Partial<DocumentHeaderImageServiceDependencies> = {},
): DocumentHeaderImageServiceDependencies {
  return {
    findValuation: async () => valuation,
    findHeader: async () => null,
    persistHeader: async ({ filePublicId, upload }) => ({
      id: filePublicId,
      key: upload.key,
      filename: upload.filename,
      mimeType: upload.mimeType,
      size: upload.size,
    }),
    deactivateHeader: async () => null,
    upload: async (file, key) => ({
      bucket: "bucket",
      key,
      url: "",
      filename: file.name,
      storedFilename: "stored.jpg",
      mimeType: "image/jpeg",
      size: file.size,
      checksum: "checksum",
    }),
    getPrivateUrl: async (key) => `https://signed.example/${encodeURIComponent(key)}`,
    deleteObject: async () => undefined,
    createPublicId: () => "33333333-3333-4333-8333-333333333333",
    ...overrides,
  };
}

test("construye la key privada de imagen de encabezado del documento", () => {
  assert.equal(
    buildValuationDocumentHeaderImageKey(
      valuation.organizationPublicId,
      valuation.publicId,
      "33333333-3333-4333-8333-333333333333",
    ),
    `organizaciones/${valuation.organizationPublicId}/avaluos/${valuation.publicId}/encabezado/33333333-3333-4333-8333-333333333333.jpg`,
  );
});

test("imagen de encabezado usa Archivo/Relacion y no devuelve key al cliente", async () => {
  let persisted = false;
  const image = await replaceDocumentHeaderImage(
    user,
    valuation.publicId,
    new File(["image"], "header.png", { type: "image/png" }),
    serviceDependencies({
      persistHeader: async ({ valuation: scopedValuation, filePublicId, upload }) => {
        persisted = true;
        assert.equal(scopedValuation.publicId, valuation.publicId);
        assert.match(upload.key, /organizaciones\/.+\/avaluos\/.+\/encabezado\/.+\.jpg$/);
        return {
          id: filePublicId,
          key: upload.key,
          filename: upload.filename,
          mimeType: upload.mimeType,
          size: upload.size,
        };
      },
    }),
  );

  assert.equal(persisted, true);
  assert.equal(image.url?.startsWith("https://signed.example/"), true);
  assert.equal("key" in image, false);
});


test("reemplazo seguro desactiva la referencia anterior y borra su objeto despues de persistir la nueva", async () => {
  const deletedKeys: string[] = [];
  const image = await replaceDocumentHeaderImage(
    user,
    valuation.publicId,
    new File(["image"], "header.png", { type: "image/png" }),
    serviceDependencies({
      findHeader: async () => ({
        id: "previous-id",
        key: "organizaciones/org/avaluos/val/encabezado/previous.jpg",
        filename: "previous.jpg",
        mimeType: "image/jpeg",
        size: 100,
      }),
      deleteObject: async (key) => {
        deletedKeys.push(key);
      },
    }),
  );

  assert.equal(image.id, "33333333-3333-4333-8333-333333333333");
  assert.deepEqual(deletedKeys, ["organizaciones/org/avaluos/val/encabezado/previous.jpg"]);
});
test("GET resuelve la key persistida a URL temporal", async () => {
  const image = await getDocumentHeaderImage(user, valuation.publicId, serviceDependencies({
    findHeader: async () => ({
      id: "file-id",
      key: "organizaciones/org/avaluos/val/encabezado/file.jpg",
      filename: "header.jpg",
      mimeType: "image/jpeg",
      size: 123,
    }),
  }));

  assert.equal(image?.id, "file-id");
  assert.equal(image?.url, "https://signed.example/organizaciones%2Forg%2Favaluos%2Fval%2Fencabezado%2Ffile.jpg");
  assert.equal("key" in (image ?? {}), false);
});

test("DELETE desactiva solo la relacion del encabezado y borra el objeto", async () => {
  let deletedKey = "";
  const deleted = await deleteDocumentHeaderImage(user, valuation.publicId, serviceDependencies({
    deactivateHeader: async () => ({ key: "organizaciones/org/avaluos/val/encabezado/file.jpg" }),
    deleteObject: async (key) => {
      deletedKey = key;
    },
  }));

  assert.equal(deleted.deleted, true);
  assert.equal(deletedKey, "organizaciones/org/avaluos/val/encabezado/file.jpg");
});

test("metadatos y reglas del encabezado son especificos", () => {
  assert.deepEqual(HEADER_IMAGE_MIME_TYPES, ["image/jpeg", "image/png", "image/webp"]);
  assert.equal(HEADER_IMAGE_ENTITY, "AVALUO_CARATULA_ENCABEZADO_IMAGEN");
  assert.equal(HEADER_IMAGE_USAGE, "CARATULA_ENCABEZADO_IMAGEN");
});
