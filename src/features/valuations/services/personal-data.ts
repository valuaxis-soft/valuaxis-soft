/**
 * The personal data that never travel with «Importar» or a template «con
 * datos»: names of people, phones and emails (Álvaro, video 8.5, 1:16: «nombres
 * de personas, pues no, ni teléfonos de contacto, ni correos»). Everything
 * else (the address, the land use, the boundaries, the characteristics, the
 * tables) does.
 *
 * A concept is personal by its title (Solicitante, Propietario, Teléfono…);
 * in any other text, an email or a phone number written inside is taken out.
 *
 * Pure: no side effects.
 */

const normalized = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Words of a title that name a person or a way to reach one. */
const PERSONAL_TITLE = new RegExp(
  [
    "solicitante", "propietari[oa]s?", "cliente", "contacto", "telefonos?", "tel", "cel", "celular", "movil",
    "whatsapp", "correos?", "email", "e mail", "mail", "curp", "rfc", "representante", "apoderad[oa]", "atencion",
    "anunciante", "vendedor", "arrendatari[oa]", "inquilin[oa]", "ocupante", "acreditad[oa]", "deudor",
  ].map((word) => `(?:^| )${word}(?: |$)`).join("|"),
);

/** The concept or column holds a person's name, phone or email, by its title. */
export function isPersonalDataTitle(title: string): boolean {
  const words = normalized(title);
  // «Nombre» alone is a person's; «Nombre del fraccionamiento» is not.
  return PERSONAL_TITLE.test(words) || words === "nombre" || words === "nombre completo";
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
/** A run of digits with the separators phones are written with: a phone when it holds 10 to 13 digits. */
const PHONE_CANDIDATE = /\+?\(?\d[\d\s().-]{8,}\d/g;

const isPhone = (candidate: string) => {
  const digits = candidate.replace(/\D/g, "").length;
  return digits >= 10 && digits <= 13;
};

/** The text without the emails and phone numbers written in it. */
export function withoutContactData(text: string): string {
  if (!text) return text;
  const cleaned = text.replace(EMAIL, "").replace(PHONE_CANDIDATE, (candidate) => (isPhone(candidate) ? "" : candidate));
  if (cleaned === text) return text;
  return cleaned.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}
