import type { CaratulaFormData, ValuationMeta } from "@/features/valuations/model";
import { signatureListError } from "@/features/valuations/services/valuation-signatures";

export type CaratulaValidationErrors = Partial<
  Record<
    "folio" | "tituloInmueble" | "location" | "postalCode" | "telefonoEmpresa" | "correoEmpresa" | "firmas",
    string
  >
>;

export const MAX_FOLIO_LENGTH = 80;

/** Field names as the user reads them, to say which ones stop a save. */
const FIELD_LABELS: Record<keyof CaratulaValidationErrors, string> = {
  folio: "Folio",
  tituloInmueble: "Título del bien",
  location: "Ubicación del bien",
  postalCode: "Código postal",
  telefonoEmpresa: "Teléfono",
  correoEmpresa: "Correo",
  firmas: "Firmas",
};

/** "Folio: Máximo 80 caracteres. Teléfono: Ingresa 10 dígitos…" */
export function describeCaratulaErrors(errors: CaratulaValidationErrors) {
  return (Object.entries(errors) as [keyof CaratulaValidationErrors, string][])
    .map(([field, message]) => `${FIELD_LABELS[field]}: ${message}`)
    .join(" ");
}

export function validateCaratula(
  caratula: CaratulaFormData,
  meta: ValuationMeta,
): CaratulaValidationErrors {
  const errors: CaratulaValidationErrors = {};

  // Free text, as each firm numbers its valuations; only the column size limits it.
  if (caratula.folio.length > MAX_FOLIO_LENGTH) errors.folio = `Máximo ${MAX_FOLIO_LENGTH} caracteres.`;
  if (caratula.tituloInmueble.length > 120) errors.tituloInmueble = "Máximo 120 caracteres.";
  if (meta.location.length > 180) errors.location = "Máximo 180 caracteres.";
  if (meta.postalCode && !/^\d{1,5}$/.test(meta.postalCode)) {
    errors.postalCode = "Usa solo 5 dígitos.";
  }

  const phoneDigits = getMexicanPhoneDigits(caratula.telefonoEmpresa);
  if (phoneDigits.length > 0 && phoneDigits.length !== 10) {
    errors.telefonoEmpresa = "Ingresa 10 dígitos para teléfono mexicano.";
  }

  if (caratula.correoEmpresa && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(caratula.correoEmpresa)) {
    errors.correoEmpresa = "Ingresa un correo válido.";
  }

  // Every signature needs a name; its cédula profesional is required to conclude.
  const signaturesError = signatureListError(caratula.firmas, { draft: true });
  if (signaturesError) errors.firmas = signaturesError;

  return errors;
}

export function hasCaratulaValidationErrors(errors: CaratulaValidationErrors) {
  return Object.keys(errors).length > 0;
}

export function sanitizePostalCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 5);
}

export function getMexicanPhoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length > 10 && digits.startsWith("52") ? digits.slice(2, 12) : digits.slice(0, 10);
}

export function formatMexicanPhone(value: string) {
  const digits = getMexicanPhoneDigits(value);
  if (digits.length !== 10) return digits;
  return `+52 (${digits.slice(0, 3)}) ${digits.slice(3, 6)} ${digits.slice(6)}`;
}
