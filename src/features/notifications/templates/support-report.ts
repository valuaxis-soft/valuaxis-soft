import { escapeHtml } from "./escape-html";

/** A failure report, for the operator (OPERATOR_EMAILS) to review and answer from /operador/fallas. */
export type SupportReportContent = {
  reporterName: string;
  reporterEmail: string;
  organizationName: string;
  /** «VAL-0012 · Casa en Bugambilias»; empty when the report is not about a valuation. */
  valuation: string;
  /** The day the failure happened, as the user wrote it (YYYY-MM-DD). */
  happenedOn: string;
  description: string;
  hasScreenshot: boolean;
  reportsUrl: string;
};

export const buildSupportReportSubject = (input: SupportReportContent) =>
  `Reporte de falla de ${input.reporterName}${input.valuation ? ` · ${input.valuation}` : ""} · Valuaxis Soft`;

const lines = (input: SupportReportContent) => [
  `${input.reporterName} (${input.reporterEmail}), de ${input.organizationName}, reportó una falla.`,
  `Avalúo: ${input.valuation || "ninguno en particular"}`,
  `Fecha de la falla: ${input.happenedOn}`,
  `Captura de pantalla: ${input.hasScreenshot ? "sí, en el registro" : "no"}`,
];

export function buildSupportReportText(input: SupportReportContent) {
  return [...lines(input), "", "Descripción:", input.description, "", "Revísalo y registra la respuesta aquí:", input.reportsUrl].join("\n");
}

export function buildSupportReportHtml(input: SupportReportContent) {
  return [
    "<!doctype html>",
    '<html lang="es">',
    "<body>",
    ...lines(input).map((line) => `<p>${escapeHtml(line)}</p>`),
    `<p><strong>Descripción:</strong></p><p style="white-space:pre-wrap">${escapeHtml(input.description)}</p>`,
    `<p><a href="${escapeHtml(input.reportsUrl)}">Revisar y registrar la respuesta</a></p>`,
    "</body>",
    "</html>",
  ].join("");
}
