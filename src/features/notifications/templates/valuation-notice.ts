import { escapeHtml } from "./escape-html";

export type ValuationNoticeKind = "asignado" | "concluido";

export type ValuationNoticeContent = {
  kind: ValuationNoticeKind;
  recipientName: string;
  actorName: string;
  folio: string;
  title: string;
  organizationName: string;
  valuationUrl: string;
};

const HEADLINES: Record<ValuationNoticeKind, (input: ValuationNoticeContent) => string> = {
  asignado: (input) => `${input.actorName} te asignó el avalúo ${input.folio}`,
  concluido: (input) => `${input.actorName} concluyó el avalúo ${input.folio}`,
};

export const buildValuationNoticeSubject = (input: ValuationNoticeContent) => `${HEADLINES[input.kind](input)} · Valuaxis`;

export function buildValuationNoticeText(input: ValuationNoticeContent) {
  return [
    `Hola ${input.recipientName},`,
    "",
    `${HEADLINES[input.kind](input)} (${input.title}) en ${input.organizationName}.`,
    "",
    "Ábrelo aquí:",
    input.valuationUrl,
  ].join("\n");
}

export function buildValuationNoticeHtml(input: ValuationNoticeContent) {
  return [
    "<!doctype html>",
    '<html lang="es">',
    "<body>",
    `<p>Hola ${escapeHtml(input.recipientName)},</p>`,
    `<p>${escapeHtml(HEADLINES[input.kind](input))} (<strong>${escapeHtml(input.title)}</strong>) en ${escapeHtml(input.organizationName)}.</p>`,
    `<p><a href="${escapeHtml(input.valuationUrl)}">Abrir el avalúo</a></p>`,
    "</body>",
    "</html>",
  ].join("");
}
