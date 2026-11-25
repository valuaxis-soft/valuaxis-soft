import { z } from "zod";
import { ACCEPTANCE_DOCUMENTS, type LegalDocumentKey } from "./legal-documents";

/**
 * The boxes of the sign-up form and of «Mi cuenta» → «Privacidad» (the
 * simplified notice, Part II; matrix 2), and when an account owes an
 * acceptance (matrix 1.2 and 3.1). Pure.
 */

/** Version of the screen texts that are not quoted from a document (casilla T, the age declaration; matrix rule 3). */
export const SCREEN_TEXTS_VERSION = 1;

/**
 * Casilla T. The matrix leaves its wording to We Law (1.1, «We Law redacta»):
 * until they send it, this one names the four documents, each with its link.
 */
export const TERMS_BOX_SEGMENTS: ReadonlyArray<string | { document: LegalDocumentKey; label: string }> = [
  "He leído y acepto los ",
  { document: "terminos", label: "Términos y condiciones de uso" },
  ", que incluyen la ",
  { document: "licencia", label: "Licencia de uso del software" },
  ", las ",
  { document: "politicas-comerciales", label: "Políticas comerciales" },
  " y el ",
  { document: "anexo-ia", label: "Anexo de inteligencia artificial y uso de comparables" },
  ".",
];

/** The Terms (4.1) only admit adults: declared at sign-up and kept with the acceptance. */
export const ADULT_DECLARATION_TEXT = "Declaro que soy mayor de edad.";

/**
 * The four boxes of the simplified notice, Part II, as the 15 nov 2026 version
 * writes them. The form quotes the version it shows; these are only the
 * fallback if that text cannot be read.
 */
export const FALLBACK_BOX_TEXTS: Record<1 | 2 | 3 | 4, string> = {
  1: "He leído el aviso de privacidad simplificado y el aviso de privacidad integral de Álvaro Gutiérrez Navarro, persona física, con nombre comercial Valuaxis Soft.",
  2: "Acepto recibir información comercial sobre nuevas funciones y promociones de la plataforma Valuaxis Soft por parte de Álvaro Gutiérrez Navarro, persona física, con nombre comercial Valuaxis Soft.",
  3: "Acepto recibir el boletín informativo de Álvaro Gutiérrez Navarro, persona física, con nombre comercial Valuaxis Soft.",
  4: "Acepto que mi estado y municipio se incluyan en estadísticas agregadas sobre el uso de la plataforma Valuaxis Soft, que no me identifican.",
};

export const OPTIONAL_CONSENT_KEYS = ["comercial", "boletin", "estadistica"] as const;
export type OptionalConsentKey = (typeof OPTIONAL_CONSENT_KEYS)[number];
export type OptionalConsents = Record<OptionalConsentKey, boolean>;

/** Casillas 2, 3 and 4 by their key. */
export const OPTIONAL_CONSENT_BOX: Record<OptionalConsentKey, 2 | 3 | 4> = { comercial: 2, boletin: 3, estadistica: 4 };

export const NO_OPTIONAL_CONSENTS: OptionalConsents = { comercial: false, boletin: false, estadistica: false };

/** Every box, ticked or not, as the log keeps it (matrix 3.2, «Casillas»). */
export type ConsentBoxes = OptionalConsents & {
  /** Casilla 1. */
  privacidad: boolean;
  /** Casilla T. */
  terminos: boolean;
  mayorDeEdad: boolean;
};

export const CONSENT_EVENTS = ["ALTA", "ACEPTACION_USUARIO_PREVIO", "NUEVA_ACEPTACION", "CAMBIO_CASILLAS"] as const;
export type ConsentEvent = (typeof CONSENT_EVENTS)[number];

/** The events that accept documents (casillas 1 and T); CAMBIO_CASILLAS only changes 2 to 4. */
export const ACCEPTANCE_EVENTS: readonly ConsentEvent[] = ["ALTA", "ACEPTACION_USUARIO_PREVIO", "NUEVA_ACEPTACION"];

export const CONSENT_EVENT_LABELS: Record<ConsentEvent, string> = {
  ALTA: "Alta de la cuenta",
  ACEPTACION_USUARIO_PREVIO: "Aceptación de una cuenta previa",
  NUEVA_ACEPTACION: "Nueva aceptación por cambios",
  CAMBIO_CASILLAS: "Cambio de autorizaciones",
};

/** One document as the log records it: the version in force when the box was ticked. */
export type ConsentDocumentRef = {
  documento: LegalDocumentKey | "textos-de-pantalla";
  version: number;
  /** False: a draft, shown because nothing was published yet; it does not count as accepting a published version. */
  publicable: boolean;
  hash: string | null;
  id: number | null;
};

/** A published version as the gate sees it. */
export type PublishedVersion = { documento: LegalDocumentKey; version: number; requiresAcceptance: boolean };

/**
 * The documents an account still has to accept: for each one, the newest
 * published version that asks for acceptance, when the account has not
 * accepted that version or a later one. Drafts never count either way.
 */
export function pendingAcceptances(published: readonly PublishedVersion[], accepted: readonly ConsentDocumentRef[]) {
  const pending: { documento: LegalDocumentKey; version: number }[] = [];
  for (const documento of ACCEPTANCE_DOCUMENTS) {
    const required = Math.max(0, ...published.filter((row) => row.documento === documento && row.requiresAcceptance).map((row) => row.version));
    if (required === 0) continue;
    const acceptedVersion = Math.max(0, ...accepted.filter((ref) => ref.documento === documento && ref.publicable).map((ref) => ref.version));
    if (acceptedVersion < required) pending.push({ documento, version: required });
  }
  return pending;
}

/** The optional boxes of the latest event that recorded them; none ticked when there is none. */
export function currentOptionalConsents(latestBoxes: unknown): OptionalConsents {
  const record = latestBoxes && typeof latestBoxes === "object" ? (latestBoxes as Record<string, unknown>) : {};
  return {
    comercial: record.comercial === true,
    boletin: record.boletin === true,
    estadistica: record.estadistica === true,
  };
}

/** `PATCH /api/cuenta/consentimientos`: one box or more of 2 to 4. */
export const optionalConsentsPatchSchema = z
  .object({ comercial: z.boolean().optional(), boletin: z.boolean().optional(), estadistica: z.boolean().optional() })
  .strict()
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), { message: "Indica la autorización que cambia." });

/** `POST /api/cuenta/consentimientos/aceptar`: casillas 1 and T (and the age, when not declared before) ticked, and the versions shown. */
export const acceptanceSchema = z
  .object({
    privacidad: z.literal(true),
    terminos: z.literal(true),
    mayorDeEdad: z.boolean().optional(),
    versionIds: z.array(z.number().int().positive()).max(20),
  })
  .strict();

/** The ids of the versions a form showed, from its hidden field («12,13,14»). */
export function parseVersionIds(value: unknown): number[] {
  if (typeof value !== "string" || value.length > 200) return [];
  return value.split(",").map((part) => Number(part.trim())).filter((id) => Number.isInteger(id) && id > 0);
}

/** Whether the form showed exactly the versions in force now: otherwise it must be read again. */
export function sameVersions(shown: readonly number[], current: readonly number[]) {
  if (shown.length !== current.length) return false;
  const set = new Set(shown);
  return current.every((id) => set.has(id));
}
