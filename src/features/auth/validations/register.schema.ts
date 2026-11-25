import { normalizePhone } from "@/features/account/phone/phone-number";
import { parseVersionIds, type OptionalConsents } from "@/features/legal/consent-rules";
import { normalizeEmail, validateEmail } from "./login.schema";
import { validatePasswordPolicy } from "./password-policy";

/**
 * What «Crear cuenta» asks (matrix 1.1): name, email, phone, the professional
 * license when there is one and the specialty, the age declaration, casilla 1
 * (privacy) and casilla T (terms) ticked, and casillas 2 to 4 as chosen.
 */

export type RegistrationProfile = {
  /** E.164, as captured (not verified). */
  phone: string;
  cedula?: string;
  specialty: string;
};

export type RegistrationConsents = {
  optional: OptionalConsents;
  /** The ids of the document versions the form showed. */
  versionIds: number[];
};

export type RegisterInput = RegistrationProfile & {
  name: string;
  paternalLastName: string;
  maternalLastName?: string;
  email: string;
  password: string;
  organizationName?: string;
  consents: RegistrationConsents;
};

const SPECIALTY_MAX = 120;

const ticked = (formData: FormData, name: string) => formData.get(name) === "on";

/** The profile, the boxes and the versions: what both ways of signing up (password and Google) send. */
export function parseRegistrationConsentFields(formData: FormData) {
  const fieldErrors: Record<string, string[]> = {};
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  const cedula = String(formData.get("cedula") ?? "").replace(/\s/g, "");
  const specialty = String(formData.get("specialty") ?? "").trim().replace(/\s+/g, " ");

  if (!rawPhone) fieldErrors.phone = ["Escribe tu teléfono."];
  else if (!phone) fieldErrors.phone = ["Escribe un teléfono válido: 10 dígitos, o + y la clave del país."];
  if (cedula && !/^\d{5,10}$/.test(cedula)) fieldErrors.cedula = ["La cédula profesional son de 5 a 10 dígitos."];
  if (!specialty) fieldErrors.specialty = ["Escribe tu especialidad."];
  else if (specialty.length > SPECIALTY_MAX) fieldErrors.specialty = [`La especialidad admite hasta ${SPECIALTY_MAX} caracteres.`];
  if (!ticked(formData, "adultDeclaration")) fieldErrors.adultDeclaration = ["Solo pueden registrarse personas mayores de edad."];
  if (!ticked(formData, "consentPrivacy")) fieldErrors.consentPrivacy = ["Marca la casilla del aviso de privacidad para continuar."];
  if (!ticked(formData, "consentTerms")) fieldErrors.consentTerms = ["Marca la casilla de los términos y condiciones para continuar."];

  return {
    fieldErrors,
    profile: { phone: phone ?? "", cedula: cedula || undefined, specialty } satisfies RegistrationProfile,
    consents: {
      optional: {
        comercial: ticked(formData, "consentCommercial"),
        boletin: ticked(formData, "consentNewsletter"),
        estadistica: ticked(formData, "consentStatistics"),
      },
      versionIds: parseVersionIds(formData.get("legalVersionIds")),
    } satisfies RegistrationConsents,
  };
}

export function parseRegisterInput(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const paternalLastName = String(formData.get("paternalLastName") ?? "").trim();
  const maternalLastName = String(formData.get("maternalLastName") ?? "").trim();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  const fieldErrors: Record<string, string[]> = {};

  if (!name) fieldErrors.name = ["Escribe tu nombre."];
  if (!paternalLastName) fieldErrors.paternalLastName = ["Escribe tu apellido."];
  if (!email) fieldErrors.email = ["Escribe tu correo electrónico."];
  else if (!validateEmail(email)) fieldErrors.email = ["Escribe un correo electrónico válido."];
  const passwordResult = validatePasswordPolicy(password);
  if (!passwordResult.valid) fieldErrors.password = passwordResult.errors;
  if (password !== confirmPassword) fieldErrors.confirmPassword = ["Las contraseñas no coinciden."];
  const legal = parseRegistrationConsentFields(formData);
  Object.assign(fieldErrors, legal.fieldErrors);

  return {
    ok: Object.keys(fieldErrors).length === 0,
    data: {
      name,
      paternalLastName,
      maternalLastName: maternalLastName || undefined,
      email,
      password,
      organizationName: organizationName || undefined,
      ...legal.profile,
      consents: legal.consents,
    } satisfies RegisterInput,
    fieldErrors,
  };
}
