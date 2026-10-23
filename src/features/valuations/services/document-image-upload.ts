/**
 * The files the editor accepts as document images (photo annexes, plans,
 * sketches): what the server can read and store. Several can be chosen at
 * once; each one that cannot be used says why, by its name.
 */

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

/** For the file picker: by type and by extension, so every system offers the same files. */
export const DOCUMENT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";

export const DOCUMENT_IMAGE_FORMATS_LABEL = "JPG, JPEG, PNG, WebP o GIF";

/** Why this file cannot be uploaded as a document image; null when it can. */
export function documentImageUploadProblem(file: Pick<File, "name" | "type" | "size">): string | null {
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "" : "";
  if (extension === "heic" || extension === "heif" || file.type === "image/heic" || file.type === "image/heif") {
    return "las fotos HEIC del iPhone no se pueden usar; guárdala como JPG (en el iPhone: Ajustes › Cámara › Formatos › Más compatible) y súbela de nuevo.";
  }
  if (!file.size) return "el archivo está vacío.";
  if (!ACCEPTED_TYPES.has(file.type) || (extension && !ACCEPTED_EXTENSIONS.has(extension))) {
    return `formato no compatible. Usa ${DOCUMENT_IMAGE_FORMATS_LABEL}.`;
  }
  return null;
}

/** The message of one file that could not be uploaded. */
export function documentImageUploadError(fileName: string, reason: string) {
  return `No se pudo subir «${fileName}»: ${reason}`;
}

/** The summary once a selection finished uploading. */
export function documentImageUploadSummary(uploaded: number, total: number) {
  if (total <= 1) return uploaded ? "Imagen subida" : "No se subió la imagen";
  if (uploaded === total) return `${total} imágenes subidas`;
  return `Se subieron ${uploaded} de ${total} imágenes`;
}
