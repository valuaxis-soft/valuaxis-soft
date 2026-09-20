import { env } from "@/lib/env";

/**
 * Sistema de almacenamiento dual:
 * - LOCAL: Almacenamiento local en /public/uploads (default para dev)
 * - S3: Almacenamiento en AWS S3 (produccion)
 *
 * Configuracion AWS S3 (el usuario debe configurar manualmente):
 * 1. Instalar: npm install @aws-sdk/client-s3 @aws-sdk/lib-storage
 * 2. Crear bucket S3 con acceso publico o CloudFront
 * 3. Configurar variables de entorno:
 *    - AWS_S3_BUCKET=tu-bucket
 *    - AWS_S3_REGION=us-east-1
 *    - AWS_ACCESS_KEY_ID=tu-access-key
 *    - AWS_SECRET_ACCESS_KEY=tu-secret-key
 *    - STORAGE_DRIVER=s3 (o local para desarrollo)
 *
 * El sistema detecta automaticamente STORAGE_DRIVER y usa el metodo adecuado.
 */

export type StorageDriver = "local" | "s3";

export type StorageResult = {
  url: string;
  bucket: string;
  filename: string;
  mimeType: string;
  size: number;
  key: string;
};

export type StorageConfig = {
  driver: StorageDriver;
  s3?: {
    bucket: string;
    region: string;
    endpoint?: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
};

export function getStorageConfig(): StorageConfig {
  const driver: StorageDriver = env.STORAGE_DRIVER;

  if (driver === "s3") {
    return {
      driver: "s3",
      s3: {
        bucket: env.AWS_S3_BUCKET || "",
        region: env.AWS_S3_REGION || env.AWS_REGION || "us-east-1",
        endpoint: env.AWS_S3_ENDPOINT || undefined,
        accessKeyId: env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY || "",
      },
    };
  }

  return { driver: "local" };
}

/**
 * Sube un archivo al almacenamiento configurado.
 * Cuando STORAGE_DRIVER=s3, usa AWS S3.
 * Cuando STORAGE_DRIVER=local, guarda en /public/uploads.
 */
export async function storeFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  requestedKey?: string,
): Promise<StorageResult> {
  const config = getStorageConfig();

  if (config.driver === "s3") {
    return storeFileS3(buffer, filename, mimeType, config);
  }

  return storeFileLocal(buffer, filename, mimeType, requestedKey);
}

/**
 * Almacenamiento LOCAL (default para desarrollo)
 */
async function storeFileLocal(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  requestedKey?: string,
): Promise<StorageResult> {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { randomUUID } = await import("node:crypto");

  const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
  const key = requestedKey
    ? normalizeInternalObjectKey(requestedKey)
    : `uploads/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  const dir = join(process.cwd(), "public", key.split("/").slice(0, -1).join("/"));
  const filepath = join(process.cwd(), "public", key);

  await mkdir(dir, { recursive: true });
  await writeFile(filepath, buffer);

  return {
    url: `/${key}`,
    bucket: "local",
    filename,
    mimeType,
    size: buffer.length,
    key,
  };
}

function normalizeInternalObjectKey(key: string) {
  const normalized = key.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw new Error("Clave de almacenamiento invalida.");
  }
  return normalized;
}

/**
 * Almacenamiento AWS S3 (produccion)
 * Descomentar y configurar cuando se instale @aws-sdk/client-s3
 */
async function storeFileS3(
  _buffer: Buffer,
  _filename: string,
  _mimeType: string,
  _config: StorageConfig,
): Promise<StorageResult> {
  void _buffer;
  void _filename;
  void _mimeType;
  void _config;
  // TODO: Implementar cuando el usuario instale @aws-sdk/client-s3
  // Ejemplo de implementacion:
  //
  // import { S3Client } from "@aws-sdk/client-s3";
  // import { Upload } from "@aws-sdk/lib-storage";
  //
  // const client = new S3Client({
  //   region: config.s3!.region,
  //   credentials: {
  //     accessKeyId: config.s3!.accessKeyId,
  //     secretAccessKey: config.s3!.secretAccessKey,
  //   },
  //   endpoint: config.s3!.endpoint,
  // });
  //
  // const key = `uploads/${Date.now()}-${filename}`;
  //
  // const upload = new Upload({
  //   client,
  //   params: {
  //     Bucket: config.s3!.bucket,
  //     Key: key,
  //     Body: buffer,
  //     ContentType: mimeType,
  //   },
  // });
  //
  // await upload.done();
  //
  // const region = config.s3!.region;
  // const bucket = config.s3!.bucket;
  // const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  throw new Error(
    "AWS S3 no configurado. Instala @aws-sdk/client-s3 y configura las variables de entorno.",
  );
}

/**
 * Elimina un archivo del almacenamiento.
 */
export async function deleteFile(key: string): Promise<void> {
  const config = getStorageConfig();

  if (config.driver === "s3") {
    // TODO: Implementar con S3
    // import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
    throw new Error("S3 delete not configured");
  }

  const { unlink } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const filepath = join(process.cwd(), "public", key);
  await unlink(filepath).catch(() => {});
}
