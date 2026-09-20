import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { env } from "@/lib/env";
import {
  FileValidationError,
  storageProvider,
} from "@/infrastructure/storage/storage-provider";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;

const MIME_BY_SHARP_FORMAT: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export type UploadResult = {
  url: string;
  bucket: string;
  filename: string;
  storedFilename: string;
  mimeType: string;
  size: number;
  key: string;
  checksum: string;
};

export type SaveUploadOptions = {
  allowedMimeTypes?: string[];
  generateDownloadUrl?: boolean;
  key?: string;
};

export class UploadError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export async function saveUpload(file: File, options: SaveUploadOptions = {}): Promise<UploadResult> {
  const allowedMimeTypes = options.allowedMimeTypes ?? ALLOWED_TYPES;
  try {
    storageProvider.validateFile(file, {
      allowedMimeTypes,
      maxSizeBytes: MAX_FILE_SIZE,
    });
  } catch (error) {
    if (error instanceof FileValidationError) {
      throw new UploadError(error.message, error.code);
    }
    throw error;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { animated: false }).metadata();
  } catch {
    throw new UploadError("El contenido del archivo no es una imagen valida.", "INVALID_IMAGE_CONTENT");
  }
  const detectedMimeType = metadata.format ? MIME_BY_SHARP_FORMAT[metadata.format] : undefined;
  if (!detectedMimeType || !allowedMimeTypes.includes(detectedMimeType) || detectedMimeType !== file.type) {
    throw new UploadError("El contenido de la imagen no coincide con el tipo declarado.", "INVALID_IMAGE_CONTENT");
  }

  const shouldNormalizeToJpeg = detectedMimeType !== "image/gif";
  const storedMimeType = shouldNormalizeToJpeg ? "image/jpeg" : detectedMimeType;
  const storedExtension = shouldNormalizeToJpeg ? ".jpg" : ".gif";
  const safeFilename = `${randomUUID()}${storedExtension}`;

  const processedBuffer =
    shouldNormalizeToJpeg
      ? await sharp(buffer)
          .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer()
      : buffer;

  const result = await storageProvider.createUpload({
    buffer: processedBuffer,
    filename: safeFilename,
    mimeType: storedMimeType,
    generateDownloadUrl: options.generateDownloadUrl,
    key: options.key,
  });

  return {
    url: result.url,
    bucket: result.bucket,
    filename: file.name,
    storedFilename: result.filename,
    mimeType: storedMimeType,
    size: processedBuffer.length,
    key: result.key,
    checksum: result.checksum,
  };
}
