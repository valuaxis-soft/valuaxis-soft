/**
 * The legal documents of the platform (We Law, 15 nov 2026; docs/LEGAL.md).
 * Each one is stored by version in `devpware_documentos_legales`, its text
 * exactly as published and its SHA-256. Pure: no database here.
 */

export const LEGAL_DOCUMENT_KEYS = [
  "terminos",
  "licencia",
  "privacidad-integral",
  "privacidad-simplificado",
  "politicas-comerciales",
  "anexo-ia",
  "informacion-disociada",
] as const;

export type LegalDocumentKey = (typeof LEGAL_DOCUMENT_KEYS)[number];

export const LEGAL_DOCUMENT_TITLES: Record<LegalDocumentKey, string> = {
  terminos: "Términos y condiciones de uso",
  licencia: "Licencia de uso del software",
  "privacidad-integral": "Aviso de privacidad integral",
  "privacidad-simplificado": "Aviso de privacidad simplificado",
  "politicas-comerciales": "Políticas comerciales",
  "anexo-ia": "Anexo de inteligencia artificial y uso de comparables",
  "informacion-disociada": "Política de información disociada",
};

/** Casilla 1: the simplified notice shown in the form and the integral one it links to. */
export const PRIVACY_DOCUMENTS = ["privacidad-simplificado", "privacidad-integral"] as const satisfies readonly LegalDocumentKey[];

/** Casilla T: the Terms with their chapter 17 (the License), the commercial policies and the AI annex, in one act. */
export const TERMS_DOCUMENTS = ["terminos", "licencia", "politicas-comerciales", "anexo-ia"] as const satisfies readonly LegalDocumentKey[];

/** What an account accepts; the dissociated-information policy is only published (matrix, section 0). */
export const ACCEPTANCE_DOCUMENTS: readonly LegalDocumentKey[] = [...PRIVACY_DOCUMENTS, ...TERMS_DOCUMENTS];

/**
 * Matrix rule 1: nothing is published until the lawyer releases it, except the
 * two privacy notices, which must be available as soon as personal data is
 * collected. Only their drafts are ever shown publicly (marked); any other
 * unpublished document shows «Se publicará próximamente», without its text.
 */
export const canShowDraftPublicly = (key: LegalDocumentKey) => (PRIVACY_DOCUMENTS as readonly LegalDocumentKey[]).includes(key);

export function isLegalDocumentKey(value: string): value is LegalDocumentKey {
  return (LEGAL_DOCUMENT_KEYS as readonly string[]).includes(value);
}

export const legalDocumentHref = (key: LegalDocumentKey, version?: number) =>
  version === undefined ? `/legal/${key}` : `/legal/${key}/v/${version}`;

/** The lawyer's blanks: data the owner fills before publishing (domicilio, correos, CLABE…). */
export const LEGAL_BLANK = "______";

export const hasLegalBlanks = (text: string) => text.includes(LEGAL_BLANK);

export type LegalSource = { title: string | null; version: number | null; date: string | null; document: string | null; body: string };

/**
 * A document's markdown source (docs/legal/<documento>.md or the file given to
 * `pnpm legal:publish`): optional front matter between `---` lines, then the
 * body. The body is stored and hashed exactly as written.
 */
export function parseLegalSource(raw: string): LegalSource {
  const text = raw.replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return { title: null, version: null, date: null, document: null, body: text };
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) return { title: null, version: null, date: null, document: null, body: text };
  const fields = new Map<string, string>();
  for (const line of text.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator > 0) fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  const version = Number(fields.get("version"));
  return {
    title: fields.get("titulo") || null,
    version: Number.isInteger(version) && version > 0 ? version : null,
    date: fields.get("fecha") || null,
    document: fields.get("documento") || null,
    body: text.slice(end + 5),
  };
}

/** «15 de noviembre de 2026», as the documents write dates. */
export function formatLegalDate(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/**
 * The texts of the simplified notice the sign-up form needs: Part I in full
 * (shown above the button, matrix 1.1) and the four boxes of Part II, quoted
 * literally from the version shown. Null when the text does not have them.
 */
export function splitSimplifiedNotice(text: string): { partOne: string; boxes: Record<1 | 2 | 3 | 4, string> } | null {
  const partTwo = text.search(/^#+ PARTE II\b/m);
  if (partTwo < 0) return null;
  const boxes: Partial<Record<1 | 2 | 3 | 4, string>> = {};
  for (const line of text.slice(partTwo).split("\n")) {
    const match = /^([1-4])\.\s.*?«([^»]+)»/.exec(line);
    if (match) boxes[Number(match[1]) as 1 | 2 | 3 | 4] = match[2].trim();
  }
  if (!boxes[1] || !boxes[2] || !boxes[3] || !boxes[4]) return null;
  return { partOne: text.slice(0, partTwo).trimEnd() + "\n", boxes: boxes as Record<1 | 2 | 3 | 4, string> };
}

/** Where an account accepts the published versions it owes (matrix 1.2). */
export const LEGAL_ACCEPTANCE_PATH = "/aceptar-documentos";
