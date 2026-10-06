/**
 * Who signs a valuation and for how long it is valid.
 *
 * Signatures: as many as the appraiser needs, each from someone with a cédula
 * profesional. Validity: whole months chosen by the appraiser, 12 at most,
 * counted from the valuation date.
 */
import { storedImageUrl } from "@/features/files/services/stored-image-url";
import { addMonthsToIsoDate } from "@/features/firm/firm-rules";
import { extractStorageKey } from "@/features/valuations/services/image-source";

/** No business limit; this only keeps the document and the payload bounded. */
export const MAX_SIGNATURES = 20;
export const MIN_VALIDITY_MONTHS = 1;
export const MAX_VALIDITY_MONTHS = 12;

const NAME_MAX = 180;
const CEDULA_MAX = 60;
const ROLE_MAX = 120;

export type ValuationSignature = {
  name: string;
  /** Cédula profesional. */
  cedula: string;
  /** Optional title shown under the name ("Perito valuador"); empty when none. */
  role: string;
  /**
   * The scanned signature, printed over the line. In the editor it is the
   * address of the image; it is stored as its storage key.
   */
  image?: string;
};

export type SignatureErrors = Partial<Record<keyof ValuationSignature, string>>;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const emptySignature = (): ValuationSignature => ({ name: "", cedula: "", role: "" });

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * `draft` accepts a signature that still lacks its cédula: a valuation in
 * progress can be saved with it, but it cannot be concluded.
 */
type SignatureRules = { draft?: boolean };

/** What is wrong with one signature; an empty object when it is complete. */
export function signatureErrors(signature: ValuationSignature, rules: SignatureRules = {}): SignatureErrors {
  const errors: SignatureErrors = {};
  const name = signature.name.trim();
  const cedula = signature.cedula.trim();
  if (!name) errors.name = "Escribe el nombre de quien firma.";
  else if (name.length > NAME_MAX) errors.name = `Máximo ${NAME_MAX} caracteres.`;
  if (!cedula) {
    if (!rules.draft) errors.cedula = "Escribe la cédula profesional de quien firma.";
  } else if (cedula.length > CEDULA_MAX) errors.cedula = `Máximo ${CEDULA_MAX} caracteres.`;
  if (signature.role.trim().length > ROLE_MAX) errors.role = `Máximo ${ROLE_MAX} caracteres.`;
  return errors;
}

/** The first problem of a list of signatures, or null when all of them are complete. */
export function signatureListError(signatures: ValuationSignature[], rules: SignatureRules = {}): string | null {
  if (signatures.length > MAX_SIGNATURES) return `Un avalúo admite máximo ${MAX_SIGNATURES} firmas.`;
  for (const [index, signature] of signatures.entries()) {
    const [message] = Object.values(signatureErrors(signature, rules));
    if (message) return `Firma ${index + 1}: ${message}`;
  }
  return null;
}

const STORAGE_KEY = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/;

/** The storage key of a signature image, from the address the editor holds or the key itself; "" when it is neither. */
export function signatureImageKey(value: unknown): string {
  const key = extractStorageKey(text(value));
  return key.length <= 1024 && STORAGE_KEY.test(key) && !key.split("/").includes("..") ? key : "";
}

const withImage = (signature: ValuationSignature, key: string, asAddress: boolean): ValuationSignature =>
  key ? { ...signature, image: asAddress ? storedImageUrl(key) : key } : signature;

/** Validates what a client sent and returns the trimmed signatures in the same order, images as storage keys. */
export function parseSignatures(input: unknown, rules: SignatureRules = {}): Parsed<ValuationSignature[]> {
  if (!Array.isArray(input)) return { ok: false, error: "Las firmas no son válidas." };
  const signatures = input.map((item): ValuationSignature => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return withImage({ name: text(row.name), cedula: text(row.cedula), role: text(row.role) }, signatureImageKey(row.image), false);
  });
  const error = signatureListError(signatures, rules);
  return error ? { ok: false, error } : { ok: true, value: signatures };
}

/**
 * The signatures to show. A row saved before signatures were a list has none
 * stored: its single signer (name and registration) is the first signature.
 */
export function resolveSignatures(
  stored: unknown,
  legacy: { name?: string | null; registration?: string | null },
): ValuationSignature[] {
  if (Array.isArray(stored)) {
    return stored.slice(0, MAX_SIGNATURES).map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      // The browser gets an address that does not expire; the key stays in the database.
      return withImage({ name: text(row.name), cedula: text(row.cedula), role: text(row.role) }, signatureImageKey(row.image), true);
    });
  }
  const name = text(legacy.name);
  return name ? [{ name, cedula: text(legacy.registration), role: "" }] : [];
}

export const isValidityMonths = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= MIN_VALIDITY_MONTHS && value <= MAX_VALIDITY_MONTHS;

export const VALIDITY_MONTHS_ERROR = `La vigencia debe ser de ${MIN_VALIDITY_MONTHS} a ${MAX_VALIDITY_MONTHS} meses completos.`;

/** 1 mes, 6 meses. */
export const formatValidityMonths = (months: number) => (months === 1 ? "1 mes" : `${months} meses`);

const isoDate = (value: string | null | undefined) => /^\d{4}-\d{2}-\d{2}/.exec(value ?? "")?.[0] ?? null;

/** The last day the valuation is valid: its date plus the months. Null without a YYYY-MM-DD date. */
export function validUntilDate(valuationDate: string | null | undefined, months: number | null) {
  const from = isoDate(valuationDate);
  return from && months !== null ? addMonthsToIsoDate(from, months) : null;
}

/**
 * The months between a valuation date and the validity date stored before the
 * validity was captured in months; null when they are not 1 to 12 whole months apart.
 */
export function validityMonthsBetween(valuationDate: string | null | undefined, validUntil: string | null | undefined) {
  const from = isoDate(valuationDate);
  const until = isoDate(validUntil);
  if (!from || !until) return null;
  for (let months = MIN_VALIDITY_MONTHS; months <= MAX_VALIDITY_MONTHS; months += 1) {
    if (addMonthsToIsoDate(from, months) === until) return months;
  }
  return null;
}
