import { escapeHtml, textToHtml } from "./escape-html";

export type DictamenEmailContent = {
  /** What the appraiser wrote to the client. */
  message: string;
  firm: { name: string; phone: string | null; email: string | null };
  folio: string;
};

export const defaultDictamenSubject = (folio: string, firmName: string) => `Dictamen de avalúo ${folio} · ${firmName}`;

export const defaultDictamenMessage = (firmName: string) =>
  `Buen día,\n\nLe compartimos el dictamen de avalúo adjunto en PDF.\n\nQuedamos atentos a cualquier duda.\n\n${firmName}`;

const contactLine = (firm: DictamenEmailContent["firm"]) => [firm.phone, firm.email].filter(Boolean).join(" · ");

export function buildDictamenEmailText(input: DictamenEmailContent) {
  const contact = contactLine(input.firm);
  return [input.message.trim(), "", `Adjunto: dictamen ${input.folio} (PDF).`, ...(contact ? ["", contact] : [])].join("\n");
}

export function buildDictamenEmailHtml(input: DictamenEmailContent) {
  const contact = contactLine(input.firm);
  return [
    "<!doctype html>",
    '<html lang="es">',
    "<body>",
    textToHtml(input.message),
    `<p style="color:#555">Adjunto: dictamen ${escapeHtml(input.folio)} (PDF).</p>`,
    contact ? `<p style="color:#555">${escapeHtml(contact)}</p>` : "",
    "</body>",
    "</html>",
  ].join("");
}
