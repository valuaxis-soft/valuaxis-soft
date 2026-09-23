export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function parseLoginInput(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "");
  const fieldErrors: Record<string, string[]> = {};

  if (!email) fieldErrors.email = ["Escribe tu correo electrónico."];
  else if (!validateEmail(email)) fieldErrors.email = ["Escribe un correo electrónico válido."];
  if (!password) fieldErrors.password = ["Escribe tu contraseña."];

  return {
    ok: Object.keys(fieldErrors).length === 0,
    data: { email, password, redirectTo: redirectTo || undefined },
    fieldErrors,
  };
}
