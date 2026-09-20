import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { deleteFile, getStorageConfig, storeFile } from "@/infrastructure/storage/storage";

export type FileValidationPolicy = {
  allowedMimeTypes: string[];
  maxSizeBytes: number;
};

export type CreateUploadInput = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  generateDownloadUrl?: boolean;
  key?: string;
};

export type StoredObject = {
  bucket: string;
  key: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  checksum: string;
};

export interface StorageProvider {
  calculateChecksum(buffer: Buffer): string;
  validateFile(file: { name: string; size: number; type: string }, policy: FileValidationPolicy): void;
  createUpload(input: CreateUploadInput): Promise<StoredObject>;
  confirmUpload(key: string): Promise<void>;
  cancelUpload(key: string): Promise<void>;
  getPrivateDownloadUrl(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
}

export class FileValidationError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "FileValidationError";
  }
}

export class DevelopmentStorageProvider implements StorageProvider {
  calculateChecksum(buffer: Buffer) {
    return createHash("sha256").update(buffer).digest("hex");
  }

  validateFile(file: { name: string; size: number; type: string }, policy: FileValidationPolicy) {
    validateFileAgainstPolicy(file, policy);
  }

  async createUpload(input: CreateUploadInput): Promise<StoredObject> {
    const stored = await storeFile(input.buffer, input.filename, input.mimeType, input.key);
    return {
      ...stored,
      checksum: this.calculateChecksum(input.buffer),
    };
  }

  async confirmUpload() {
    return;
  }

  async cancelUpload(key: string) {
    await deleteFile(key);
  }

  async getPrivateDownloadUrl(key: string) {
    return `/${key}`;
  }

  async deleteObject(key: string) {
    await deleteFile(key);
  }
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config = getStorageConfig()) {
    if (config.driver !== "s3" || !config.s3?.bucket) {
      throw new Error("AWS_S3_BUCKET es obligatorio cuando STORAGE_DRIVER=s3.");
    }

    this.bucket = config.s3.bucket;
    const credentials =
      config.s3.accessKeyId && config.s3.secretAccessKey
        ? {
            accessKeyId: config.s3.accessKeyId,
            secretAccessKey: config.s3.secretAccessKey,
          }
        : undefined;
    this.client = new S3Client({
      region: config.s3.region,
      endpoint: config.s3.endpoint || undefined,
      credentials,
    });
  }

  calculateChecksum(buffer: Buffer) {
    return createHash("sha256").update(buffer).digest("hex");
  }

  validateFile(file: { name: string; size: number; type: string }, policy: FileValidationPolicy) {
    validateFileAgainstPolicy(file, policy);
  }

  async createUpload(input: CreateUploadInput): Promise<StoredObject> {
    const key = input.key ?? createGenericObjectKey(input.filename);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType,
      }),
    );

    return {
      bucket: this.bucket,
      key,
      url: input.generateDownloadUrl === false ? "" : await this.getPrivateDownloadUrl(key),
      filename: input.filename,
      mimeType: input.mimeType,
      size: input.buffer.length,
      checksum: this.calculateChecksum(input.buffer),
    };
  }

  async confirmUpload() {
    return;
  }

  async cancelUpload(key: string) {
    await this.deleteObject(key);
  }

  async getPrivateDownloadUrl(key: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 15 * 60 },
    );
  }

  async deleteObject(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

function validateFileAgainstPolicy(
  file: { name: string; size: number; type: string },
  policy: FileValidationPolicy,
) {
  if (!policy.allowedMimeTypes.includes(file.type)) {
    throw new FileValidationError("Tipo de archivo no permitido.", "INVALID_TYPE");
  }
  if (file.size > policy.maxSizeBytes) {
    throw new FileValidationError("El archivo excede el tamano maximo permitido.", "FILE_TOO_LARGE");
  }
  if (!extname(file.name)) {
    throw new FileValidationError("El archivo debe conservar una extension valida.", "INVALID_EXTENSION");
  }
}

function createGenericObjectKey(filename: string) {
  const normalizedExtension = extname(filename).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
  return `uploads/${new Date().toISOString().slice(0, 7)}/${randomUUID()}${normalizedExtension}`;
}

export function createStorageProvider(): StorageProvider {
  return getStorageConfig().driver === "s3"
    ? new S3StorageProvider()
    : new DevelopmentStorageProvider();
}

export const storageProvider: StorageProvider = createStorageProvider();
