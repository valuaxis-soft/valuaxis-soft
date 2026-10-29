/**
 * Pure rules of the professional accreditation (docs/ACREDITACION.md): the
 * states, the SEP verification URL a constancia's QR carries, how a name read
 * from the SEP is compared with the user's, and what an upload ends in.
 */

export const ACCREDITATION_STATUSES = ["NO_ACREDITADO", "EN_REVISION", "ACREDITADO", "RECHAZADO"] as const;
export type AccreditationStatus = (typeof ACCREDITATION_STATUSES)[number];

export function toAccreditationStatus(value: string | null | undefined): AccreditationStatus {
  return (ACCREDITATION_STATUSES as readonly string[]).includes(value ?? "") ? (value as AccreditationStatus) : "NO_ACREDITADO";
}

/* ------------------------------------------------------------------ */
/*  The URL in the QR                                                  */
/* ------------------------------------------------------------------ */

export const SEP_VERIFICATION_HOST = "cedulaprofesional.sep.gob.mx";
export const SEP_VERIFICATION_PATH = "/cedula-profesional/validar-folio";

/** CURP: 4 letters, birth date, sex (H, M or X), state, 3 consonants, homonymy digit or letter and check digit. */
const CURP_PATTERN = /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;
/** The constancia's folio: digits only (the SEP's own form pads it to 9). */
const FOLIO_PATTERN = /^\d{6,12}$/;

export type SepVerificationLink = {
  /** Rebuilt from the parts checked here, never the scanned text as is. */
  url: string;
  curp: string;
  folio: string;
};

export type SepLinkResult = { ok: true; link: SepVerificationLink } | { ok: false; reason: string };

/**
 * Accepts only `https://cedulaprofesional.sep.gob.mx/cedula-profesional/validar-folio?curp=…&id=…`:
 * https, that exact host (no look-alikes such as `cedulaprofesional.sep.gob.mx.evil.com`), no
 * port or credentials, that exact path, one CURP and one numeric folio.
 */
export function parseSepVerificationUrl(text: string): SepLinkResult {
  const raw = text.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "El código QR no contiene una dirección web." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "La dirección del código QR no es segura (https)." };
  if (url.hostname !== SEP_VERIFICATION_HOST || url.port !== "" || url.username !== "" || url.password !== "") {
    return { ok: false, reason: `El código QR no lleva a ${SEP_VERIFICATION_HOST}: no es de una constancia de la SEP.` };
  }
  if (url.pathname !== SEP_VERIFICATION_PATH) {
    return { ok: false, reason: "El código QR no es el de validación de la Constancia de Situación Profesional." };
  }
  const curps = url.searchParams.getAll("curp");
  const folios = url.searchParams.getAll("id");
  if (curps.length !== 1 || folios.length !== 1) {
    return { ok: false, reason: "El código QR no trae una CURP y un folio." };
  }
  const curp = curps[0].trim().toUpperCase();
  const folio = folios[0].trim();
  if (!CURP_PATTERN.test(curp)) return { ok: false, reason: "La CURP del código QR no es válida." };
  if (!FOLIO_PATTERN.test(folio)) return { ok: false, reason: "El folio del código QR no es válido." };
  const canonical = new URL(`https://${SEP_VERIFICATION_HOST}${SEP_VERIFICATION_PATH}`);
  canonical.searchParams.set("curp", curp);
  canonical.searchParams.set("id", folio);
  return { ok: true, link: { url: canonical.toString(), curp, folio } };
}

/** The first SEP link among the texts read from an upload, or why none is one. */
export function findSepVerificationLink(texts: string[]): SepLinkResult {
  if (!texts.length) {
    return {
      ok: false,
      reason: "No encontramos un código QR legible. Sube una foto nítida y completa del código QR de tu constancia, o el PDF original.",
    };
  }
  let firstFailure: SepLinkResult | null = null;
  for (const text of texts) {
    const result = parseSepVerificationUrl(text);
    if (result.ok) return result;
    firstFailure ??= result;
  }
  return firstFailure!;
}

/* ------------------------------------------------------------------ */
/*  Names                                                              */
/* ------------------------------------------------------------------ */

/** Particles that some records write and others leave out. */
const NAME_PARTICLES = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "VAN", "VON", "DA", "DI"]);

/** Upper case, no accents, letters only, without particles: "José de la Peña" → ["JOSE", "PENA"]. */
export function normalizeNameTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !NAME_PARTICLES.has(token));
}

/**
 * Whether the name the SEP shows is reasonably the user's: same words in any
 * order, accents and particles aside, allowing one word more on either side
 * (a second given name or a second surname left out), with at least two words
 * in common.
 */
export function namesMatch(userName: string, sepName: string): boolean {
  const user = normalizeNameTokens(userName);
  const sep = normalizeNameTokens(sepName);
  if (user.length < 2 || sep.length < 2) return false;
  const [shorter, longer] = user.length <= sep.length ? [user, sep] : [sep, user];
  if (longer.length - shorter.length > 1) return false;
  const pool = [...longer];
  for (const token of shorter) {
    const index = pool.indexOf(token);
    if (index < 0) return false;
    pool.splice(index, 1);
  }
  return true;
}

/* ------------------------------------------------------------------ */
/*  Outcome of an upload                                               */
/* ------------------------------------------------------------------ */

/** What the automatic check against the SEP could read. */
export type SepCheck =
  | { kind: "unavailable"; reason: string }
  | { kind: "read"; validCedula: boolean; cedulaNumber: string | null; name: string | null };

export type AutomaticResult = "NO_DISPONIBLE" | "COINCIDE" | "NO_COINCIDE" | "CEDULA_NO_VALIDA";

export type AccreditationDecision = {
  status: Extract<AccreditationStatus, "ACREDITADO" | "EN_REVISION">;
  automatic: AutomaticResult;
  /** Why it went to review, for the administrator and the user. */
  reason: string | null;
};

/**
 * An upload accredits on its own only when the SEP could be read, the cédula
 * is valid, the name matches the user's, the CURP is not already used by
 * another account and the user was never revoked. Anything else goes to
 * manual review.
 */
export function decideAccreditation(input: {
  userName: string;
  check: SepCheck;
  curpUsedByAnotherUser: boolean;
  previouslyRevoked: boolean;
}): AccreditationDecision {
  const { check } = input;
  const automatic: AutomaticResult =
    check.kind === "unavailable"
      ? "NO_DISPONIBLE"
      : !check.validCedula
        ? "CEDULA_NO_VALIDA"
        : check.name && namesMatch(input.userName, check.name)
          ? "COINCIDE"
          : "NO_COINCIDE";

  if (input.curpUsedByAnotherUser) {
    return { status: "EN_REVISION", automatic, reason: "La misma CURP ya está registrada en otra cuenta." };
  }
  if (input.previouslyRevoked) {
    return { status: "EN_REVISION", automatic, reason: "La acreditación de esta cuenta fue revocada antes; la revisa un administrador." };
  }
  switch (automatic) {
    case "COINCIDE":
      return { status: "ACREDITADO", automatic, reason: null };
    case "NO_DISPONIBLE":
      return { status: "EN_REVISION", automatic, reason: "La validación automática con la SEP no está disponible." };
    case "CEDULA_NO_VALIDA":
      return { status: "EN_REVISION", automatic, reason: "La SEP no muestra la cédula como válida." };
    case "NO_COINCIDE":
      return { status: "EN_REVISION", automatic, reason: "El nombre que muestra la SEP no coincide con el de la cuenta." };
  }
}
