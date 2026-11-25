/**
 * The support channels the platform shows (matrix 1.9; Términos y
 * condiciones 9.2 and 16.1): an email and a WhatsApp number. The owner fills
 * them here; while one is empty the help page says it is still to be
 * published instead of showing a made-up address.
 */
export const SUPPORT_CONTACT: { email: string; whatsapp: string } = {
  // Pendiente: el correo de soporte que publique el titular (por ejemplo, soporte@…).
  email: "",
  // Pendiente: el WhatsApp de soporte, a 10 dígitos o con +52.
  whatsapp: "",
};

export const SUPPORT_PENDING_TEXT = "Por publicar";

/** wa.me wants the number with its country code and digits only: 10 Mexican digits take 52 in front. */
export function whatsappLink(number: string): string | null {
  const digits = number.replace(/\D/g, "");
  if (digits.length === 10) return `https://wa.me/52${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `https://wa.me/${digits}`;
  return null;
}

export const SUPPORT_HREF = "/soporte";
export const OPERATOR_FAILURE_REPORTS_HREF = "/operador/fallas";
