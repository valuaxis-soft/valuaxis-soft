import { env } from "@/lib/env";

/**
 * Configuracion de almacenamiento y operaciones de disco local.
 *
 * STORAGE_DRIVER=s3 usa S3StorageProvider (storage-provider.ts).
 * STORAGE_DRIVER=local usa DevelopmentStorageProvider, que escribe con estas funciones.
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
 * Guarda un archivo en disco local bajo /public (solo desarrollo).
 */
export async function storeFile(
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
 * Elimina un archivo del disco local (solo desarrollo).
 */
export async function deleteFile(key: string): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const filepath = join(process.cwd(), "public", normalizeInternalObjectKey(key));
  await unlink(filepath).catch(() => {});
}
