import type { CaratulaFormData, ValuationMeta } from "@/features/valuations/model";

export type CaratulaValidationErrors = Partial<
  Record<
    "folio" | "tituloInmueble" | "location" | "postalCode" | "telefonoEmpresa" | "correoEmpresa",
    string
  >
>;

export function validateCaratula(
  caratula: CaratulaFormData,
  meta: ValuationMeta,
): CaratulaValidationErrors {
  const errors: CaratulaValidationErrors = {};

  if (caratula.folio.length > 15) errors.folio = "Máximo 15 caracteres.";
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
