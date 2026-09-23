import { normalizeEmail, validateEmail } from "./login.schema";

export function parseForgotPasswordInput(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const fieldErrors: Record<string, string[]> = {};
  if (!email) fieldErrors.email = ["Escribe tu correo electrónico."];
  else if (!validateEmail(email)) fieldErrors.email = ["Escribe un correo electrónico válido."];
  return { ok: Object.keys(fieldErrors).length === 0, data: { email }, fieldErrors };
}
