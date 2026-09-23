import { normalizeEmail, validateEmail } from "./login.schema";
import { validatePasswordPolicy } from "./password-policy";

export type RegisterInput = {
  name: string;
  paternalLastName: string;
  maternalLastName?: string;
  email: string;
  password: string;
  organizationName?: string;
};

export function parseRegisterInput(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const paternalLastName = String(formData.get("paternalLastName") ?? "").trim();
  const maternalLastName = String(formData.get("maternalLastName") ?? "").trim();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  const acceptedTerms = formData.get("acceptedTerms") === "on";
  const fieldErrors: Record<string, string[]> = {};

  if (!name) fieldErrors.name = ["Escribe tu nombre."];
  if (!paternalLastName) fieldErrors.paternalLastName = ["Escribe tu apellido."];
  if (!email) fieldErrors.email = ["Escribe tu correo electrónico."];
  else if (!validateEmail(email)) fieldErrors.email = ["Escribe un correo electrónico válido."];
  const passwordResult = validatePasswordPolicy(password);
  if (!passwordResult.valid) fieldErrors.password = passwordResult.errors;
  if (password !== confirmPassword) fieldErrors.confirmPassword = ["Las contraseñas no coinciden."];
  if (!acceptedTerms) fieldErrors.acceptedTerms = ["Debes aceptar los terminos para continuar."];

  return {
    ok: Object.keys(fieldErrors).length === 0,
    data: {
      name,
      paternalLastName,
      maternalLastName: maternalLastName || undefined,
      email,
      password,
      organizationName: organizationName || undefined,
    },
    fieldErrors,
  };
}
