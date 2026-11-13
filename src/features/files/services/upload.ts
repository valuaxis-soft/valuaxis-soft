import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { env } from "@/lib/env";
import {
  FileValidationError,
  storageProvider,
} from "@/infrastructure/storage/storage-provider";
import { MIME_BY_SHARP_FORMAT, NOT_AN_IMAGE_MESSAGE, imageContentProblem } from "@/features/files/image-content";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;

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

/**
 * What the appraiser reads when the storage refuses the file before reading
 * it: every upload here is an image, so a file of another type gets the one
 * message of every image upload, and each message says what to do.
 */
function validationMessage(code: string): string | null {
  if (code === "INVALID_TYPE") return NOT_AN_IMAGE_MESSAGE;
  if (code === "FILE_TOO_LARGE") return `La imagen pesa más de ${env.MAX_UPLOAD_SIZE_MB} MB, el máximo permitido. Guárdala o expórtala más ligera (por ejemplo, como JPG) y vuelve a subirla.`;
  if (code === "INVALID_EXTENSION") return "El archivo no tiene extensión (.jpg, .png o .webp). Guárdalo como JPG, PNG o WebP y vuelve a subirlo.";
  return null;
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
      throw new UploadError(validationMessage(error.code) ?? error.message, error.code);
    }
    throw error;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer, { animated: false }).metadata();
  } catch {
    throw new UploadError(NOT_AN_IMAGE_MESSAGE, "INVALID_IMAGE_CONTENT");
  }
  const detectedMimeType = metadata.format ? MIME_BY_SHARP_FORMAT[metadata.format] : undefined;
  // What counts is the content, read above, not the name: a PNG renamed .jpg is still a PNG and is
  // stored (re-encoded) as such. A content of another kind says what it really is (V5.5-05).
  if (!detectedMimeType || !allowedMimeTypes.includes(detectedMimeType)) {
    throw new UploadError(imageContentProblem(metadata.format), "INVALID_IMAGE_CONTENT");
  }

  const shouldNormalizeToJpeg = detectedMimeType !== "image/gif";
  const storedMimeType = shouldNormalizeToJpeg ? "image/jpeg" : detectedMimeType;
  const storedExtension = shouldNormalizeToJpeg ? ".jpg" : ".gif";
  const safeFilename = `${randomUUID()}${storedExtension}`;

  const processedBuffer =
    shouldNormalizeToJpeg
      ? await sharp(buffer)
          // Re-encoding drops the EXIF data, orientation included: turn the
          // pixels first, so a portrait photo from a phone stays upright.
          .rotate()
          .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
          // JPEG has no transparency: without a white background, transparent logos turn black.
          .flatten({ background: "#ffffff" })
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
