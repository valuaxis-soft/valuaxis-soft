import { escapeHtml } from "./escape-html";

/**
 * A billing notice of Valuaxis Soft (commercial policies): the confirmation
 * of a purchase with the resulting balance (section 1.2) and the notice of a
 * future price (section 7.1). The billing feature writes the lines; this only
 * lays them out, the same in every provider.
 */
export type BillingNoticeContent = {
  subject: string;
  greeting: string;
  /** Paragraphs, in order. */
  lines: string[];
  /** Label and value pairs shown as a list (amount, method, reference…). */
  details: Array<{ label: string; value: string }>;
  link: { label: string; url: string };
};

export function buildBillingNoticeText(input: BillingNoticeContent) {
  return [
    input.greeting,
    "",
    ...input.lines.flatMap((line) => [line, ""]),
    ...input.details.map((detail) => `${detail.label}: ${detail.value}`),
    ...(input.details.length ? [""] : []),
    `${input.link.label}:`,
    input.link.url,
  ].join("\n");
}

export function buildBillingNoticeHtml(input: BillingNoticeContent) {
  return [
    "<!doctype html>",
    '<html lang="es">',
    "<body>",
    `<p>${escapeHtml(input.greeting)}</p>`,
    ...input.lines.map((line) => `<p>${escapeHtml(line)}</p>`),
    input.details.length
      ? `<ul>${input.details.map((detail) => `<li>${escapeHtml(detail.label)}: <strong>${escapeHtml(detail.value)}</strong></li>`).join("")}</ul>`
      : "",
    `<p><a href="${escapeHtml(input.link.url)}">${escapeHtml(input.link.label)}</a></p>`,
    "</body>",
    "</html>",
  ].join("");
}
