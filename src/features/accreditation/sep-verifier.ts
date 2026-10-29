import type { SepCheck, SepVerificationLink } from "./accreditation-rules";

/**
 * Reads, from the SEP, whether a constancia is valid and whose it is.
 *
 * There is no reliable way to do it today (checked 28 Oct 2026, with made-up
 * parameters only): `validar-folio` is an Angular page that returns the same
 * empty HTML shell whatever the folio, and fills itself in the browser by
 * calling an API that requires a bearer token and a reCAPTCHA v3 token on
 * every query (`validarConstanciaByFolio`, header `X-Recaptcha-Token`). Getting
 * past a captcha is out of the question, so the check is reported as not
 * available and every upload goes to manual review, with the SEP link for the
 * administrator to open. If the SEP ever publishes an open endpoint, a
 * verifier that reads it replaces this one and nothing else changes.
 */
export type SepVerifier = (link: SepVerificationLink) => Promise<SepCheck>;

export const SEP_CHECK_UNAVAILABLE_REASON =
  "La página de la SEP solo muestra el resultado en el navegador, tras un reCAPTCHA: no se puede consultar desde el servidor.";

export const unavailableSepVerifier: SepVerifier = async () => ({ kind: "unavailable", reason: SEP_CHECK_UNAVAILABLE_REASON });
