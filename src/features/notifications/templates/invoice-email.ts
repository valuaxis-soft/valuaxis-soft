import { escapeHtml } from "./escape-html";

/** The CFDI of a package purchase, sent to the organization's invoice email with its PDF and XML. */
export type InvoiceEmailContent = {
  organizationName: string;
  /** "A-123" or the fiscal folio when there is no series and folio. */
  invoiceLabel: string;
  uuid: string;
  /** Formatted, IVA included ("$170.00"). */
  total: string;
  billingUrl: string;
};

export const buildInvoiceEmailSubject = (input: InvoiceEmailContent) => `Tu factura ${input.invoiceLabel} de Valuaxis Soft`;

export function buildInvoiceEmailText(input: InvoiceEmailContent) {
  return [
    `Hola, ${input.organizationName}:`,
    "",
    `Adjuntamos la factura ${input.invoiceLabel} de tu compra en Valuaxis Soft por ${input.total} (IVA incluido), en PDF y XML.`,
    `Folio fiscal (UUID): ${input.uuid}`,
    "",
    "También puedes descargarla en Plan y facturación:",
    input.billingUrl,
  ].join("\n");
}

export function buildInvoiceEmailHtml(input: InvoiceEmailContent) {
  return [
    "<!doctype html>",
    '<html lang="es">',
    "<body>",
    `<p>Hola, ${escapeHtml(input.organizationName)}:</p>`,
    `<p>Adjuntamos la factura <strong>${escapeHtml(input.invoiceLabel)}</strong> de tu compra en Valuaxis Soft por ${escapeHtml(input.total)} (IVA incluido), en PDF y XML.</p>`,
    `<p>Folio fiscal (UUID): ${escapeHtml(input.uuid)}</p>`,
    `<p><a href="${escapeHtml(input.billingUrl)}">Ver en Plan y facturación</a></p>`,
    "</body>",
    "</html>",
  ].join("");
}
