import type { AccreditationStatus } from "./accreditation-rules";

/**
 * The notice every document of an unaccredited issuer prints, word for word
 * as the owner agreed it with his lawyer. Not stored with the valuation: it is
 * added when the document is drawn, so nobody can edit or hide it.
 */
export const UNACCREDITED_NOTICE_TITLE = "AVISO: DOCUMENTO SIN VALIDEZ OFICIAL";
export const UNACCREDITED_NOTICE_BODY =
  "El presente documento constituye únicamente una estimación u opinión de valor, debido a que no se ha acreditado una cédula profesional o registro oficial vigente que respalde la facultad de su emisor para realizar avalúos. Por lo tanto, carece de validez oficial y no deberá considerarse como un avalúo certificado ni como una determinación acreditada del valor de mercado del inmueble.";

/**
 * Who issues a valuation: its responsible user (the appraiser in charge) or,
 * when it has none, the user who created it. The signatures typed in the
 * carátula are free text, not accounts, so they do not count.
 */
export function valuationIssuerUserId(valuation: { IdUsuarioResponsable: number | null; IdUsuarioCreador: number }) {
  return valuation.IdUsuarioResponsable ?? valuation.IdUsuarioCreador;
}

/** The notice prints whenever the issuer is not ACREDITADO (no row, in review, rejected or revoked). */
export function requiresUnaccreditedNotice(issuerStatus: AccreditationStatus | null | undefined) {
  return issuerStatus !== "ACREDITADO";
}

/** The sections, besides the carátula, that always carry the notice. */
export const NOTICE_SECTION_KEYS = ["CONSIDERACIONES", "CONCLUSIONES"] as const;
