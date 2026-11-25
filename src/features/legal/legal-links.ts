import { legalDocumentHref } from "./legal-documents";

/** The legal links of every footer (matrix rule 3; Terms 1.5). */
export const LEGAL_FOOTER_LINKS = [
  { href: legalDocumentHref("terminos"), label: "Términos y condiciones" },
  { href: legalDocumentHref("privacidad-integral"), label: "Aviso de privacidad" },
  { href: legalDocumentHref("politicas-comerciales"), label: "Políticas comerciales" },
  { href: legalDocumentHref("anexo-ia"), label: "Anexo de IA" },
  { href: legalDocumentHref("informacion-disociada"), label: "Información disociada" },
  { href: "/legal/avisos-de-terceros", label: "Avisos de terceros" },
] as const;
