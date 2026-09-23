import assert from "node:assert/strict";
import test from "node:test";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { AuthUser } from "../src/features/auth/model";
import { saveUpload } from "../src/features/files/services/upload";
import {
  assertCoverImageAccess,
  CoverImageError,
  getPrincipalCoverImage,
  replacePrincipalCoverImage,
  type CoverImageServiceDependencies,
  type ValuationScope,
} from "../src/features/files/services/valuation-cover-image";
import { buildValuationCoverImageKey } from "../src/infrastructure/storage/storage-keys";
import { createCoverImageRouteHandlers } from "../src/app/api/avaluos/[id]/caratula/imagen-principal/route";
import { S3StorageProvider } from "../src/infrastructure/storage/storage-provider";

const user: AuthUser = {
  id: 7,
  name: "Valuador",
  email: "valuador@example.com",
  role: "VALUADOR",
  permissions: ["AVALUO_VER", "AVALUO_CREAR", "AVALUO_EDITAR", "AVALUO_CONCLUIR", "AVALUO_REABRIR", "AVALUO_DUPLICAR", "AVALUO_EXPORTAR"],
  active: true,
  organizationId: 3,
  organizationName: "Organizacion",
};
const valuation: ValuationScope = {
  id: 11,
  publicId: "22222222-2222-4222-8222-222222222222",
  organizationId: 3,
  organizationPublicId: "11111111-1111-4111-8111-111111111111",
  status: "EN_EDICION",
  locked: false,
};

function serviceDependencies(overrides: Partial<CoverImageServiceDependencies> = {}): CoverImageServiceDependencies {
  return {
    findValuation: async () => valuation,
    findPrincipal: async () => null,
    persistPrincipal: async ({ filePublicId, upload }) => ({
      id: filePublicId,
      key: upload.key,
      filename: upload.filename,
      mimeType: upload.mimeType,
      size: upload.size,
    }),
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
    getPrivateUrl: async () => "https://signed.example/image",
    deleteObject: async () => undefined,
    createPublicId: () => "33333333-3333-4333-8333-333333333333",
    ...overrides,
  };
}

test("usuario sin sesion no puede subir imagen principal", async () => {
  const handlers = createCoverImageRouteHandlers({
    currentUser: async () => null,
    getImage: async () => null,
    replaceImage: async () => {
      throw new Error("no debe ejecutarse");
    },
  });
  const response = await handlers.POST(new Request("http://localhost", { method: "POST" }), {
    params: Promise.resolve({ id: valuation.publicId }),
  });
  assert.equal(response.status, 401);
});

test("S3StorageProvider sube con el bucket y key indicados sin llamar AWS real", async (t) => {
  let commandSeen: unknown;
  t.mock.method(S3Client.prototype, "send", async (command: unknown) => {
    commandSeen = command;
    return {};
  });
  const provider = new S3StorageProvider({
    driver: "s3",
    s3: {
      bucket: "private-bucket",
      region: "us-east-1",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
    },
  });
  const stored = await provider.createUpload({
    buffer: Buffer.from("image"),
    filename: "stored.jpg",
    mimeType: "image/jpeg",
    key: "private/cover.jpg",
    generateDownloadUrl: false,
  });
  assert.equal(commandSeen instanceof PutObjectCommand, true);
  assert.equal(stored.bucket, "private-bucket");
  assert.equal(stored.key, "private/cover.jpg");
  assert.equal(stored.url, "");
});

test("usuario sin permiso de edicion no puede subir", () => {
  const readonlyUser = { ...user, role: "CONSULTA", permissions: ["AVALUO_VER", "AVALUO_EXPORTAR"] };
  assert.throws(() => assertCoverImageAccess(readonlyUser, valuation, "edit"), CoverImageError);
});

test("usuario de otra organizacion no puede acceder al avaluo", () => {
  assert.throws(
    () => assertCoverImageAccess(user, { ...valuation, organizationId: 99 }, "edit"),
    (error: unknown) => error instanceof CoverImageError && error.status === 404,
  );
});

test("rechaza archivos que no son imagen y archivos demasiado grandes", async () => {
  const invalid = new File(["pdf"], "document.pdf", { type: "application/pdf" });
  await assert.rejects(() => saveUpload(invalid, { allowedMimeTypes: ["image/jpeg"] }), /Tipo de archivo/);

  const disguised = new File(["not-an-image"], "fake.jpg", { type: "image/jpeg" });
  await assert.rejects(
    () => saveUpload(disguised, { allowedMimeTypes: ["image/jpeg"] }),
    /contenido del archivo no es una imagen valida/,
  );

  const oversized = {
    name: "large.jpg",
    type: "image/jpeg",
    size: 1024 * 1024 * 1024,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as File;
  await assert.rejects(() => saveUpload(oversized, { allowedMimeTypes: ["image/jpeg"] }), /tamano maximo/);
});

test("imagen valida usa key versionada y persiste Archivo/Relacion mediante una sola operacion", async () => {
  let persisted = false;
  const dependencies = serviceDependencies({
    persistPrincipal: async ({ valuation: scopedValuation, filePublicId, upload }) => {
      persisted = true;
      assert.equal(scopedValuation.publicId, valuation.publicId);
      assert.match(upload.key, /organizaciones\/.+\/avaluos\/.+\/caratula\/imagen-principal\/.+\.jpg$/);
      return {
        id: filePublicId,
        key: upload.key,
        filename: upload.filename,
        mimeType: upload.mimeType,
        size: upload.size,
      };
    },
  });
  const image = await replacePrincipalCoverImage(
    user,
    valuation.publicId,
    new File(["image"], "house.png", { type: "image/png" }),
    dependencies,
  );
  assert.equal(persisted, true);
  assert.equal(image.url, "https://signed.example/image");
  assert.equal(
    buildValuationCoverImageKey(
      valuation.organizationPublicId,
      valuation.publicId,
      "33333333-3333-4333-8333-333333333333",
    ),
    `organizaciones/${valuation.organizationPublicId}/avaluos/${valuation.publicId}/caratula/imagen-principal/33333333-3333-4333-8333-333333333333.jpg`,
  );
});

test("si falla base de datos intenta borrar el objeto subido", async () => {
  let deletedKey = "";
  await assert.rejects(() => replacePrincipalCoverImage(
    user,
    valuation.publicId,
    new File(["image"], "house.png", { type: "image/png" }),
    serviceDependencies({
      persistPrincipal: async () => {
        throw new Error("database failed");
      },
      deleteObject: async (key) => {
        deletedKey = key;
      },
    }),
  ));
  assert.match(deletedKey, /imagen-principal\/.+\.jpg$/);
});

test("GET devuelve la imagen principal actual con URL temporal", async () => {
  const image = await getPrincipalCoverImage(user, valuation.publicId, serviceDependencies({
    findPrincipal: async () => ({
      id: "file-id",
      key: "private/key.jpg",
      filename: "house.jpg",
      mimeType: "image/jpeg",
      size: 123,
    }),
  }));
  assert.equal(image?.id, "file-id");
  assert.equal(image?.url, "https://signed.example/image");
  assert.equal("key" in (image ?? {}), false);
});
