export type PasswordPolicyResult = {
  valid: boolean;
  errors: string[];
  score: number;
};

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const errors: string[] = [];
  if (!password) {
    return {
      valid: false,
      errors: ["Escribe tu contraseña."],
      score: 0,
    };
  }

  if (password.length < 10) errors.push("Usa al menos 10 caracteres.");
  if (!/[a-z]/.test(password)) errors.push("Incluye una minúscula.");
  if (!/[A-Z]/.test(password)) errors.push("Incluye una mayúscula.");
  if (!/[0-9]/.test(password)) errors.push("Incluye un número.");
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push("Incluye un símbolo.");

  return {
    valid: errors.length === 0,
    errors,
    score: 5 - errors.length,
  };
}

export function passwordRequirements() {
  return [
    "Minimo 10 caracteres",
    "Una mayúscula y una minúscula",
    "Un número",
    "Un símbolo",
  ];
}
