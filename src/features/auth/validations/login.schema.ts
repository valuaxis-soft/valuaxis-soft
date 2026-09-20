export type LoginInput = {
  email: string;
  password: string;
  redirectTo?: string;
};

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

  if (!email) fieldErrors.email = ["Escribe tu correo electronico."];
  else if (!validateEmail(email)) fieldErrors.email = ["Escribe un correo electronico valido."];
  if (!password) fieldErrors.password = ["Escribe tu contrasena."];

  return {
    ok: Object.keys(fieldErrors).length === 0,
    data: { email, password, redirectTo: redirectTo || undefined },
    fieldErrors,
  };
}
