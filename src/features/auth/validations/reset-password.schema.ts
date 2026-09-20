import { validatePasswordPolicy } from "./password-policy";

export function parseResetPasswordInput(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const fieldErrors: Record<string, string[]> = {};
  const passwordResult = validatePasswordPolicy(password);

  if (!token) fieldErrors.token = ["El enlace no es valido."];
  if (!passwordResult.valid) fieldErrors.password = passwordResult.errors;
  if (password !== confirmPassword) fieldErrors.confirmPassword = ["Las contrasenas no coinciden."];

  return { ok: Object.keys(fieldErrors).length === 0, data: { token, password }, fieldErrors };
}
