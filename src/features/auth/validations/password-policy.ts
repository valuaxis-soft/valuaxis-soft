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
      errors: ["Escribe tu contrasena."],
      score: 0,
    };
  }

  if (password.length < 10) errors.push("Usa al menos 10 caracteres.");
  if (!/[a-z]/.test(password)) errors.push("Incluye una minuscula.");
  if (!/[A-Z]/.test(password)) errors.push("Incluye una mayuscula.");
  if (!/[0-9]/.test(password)) errors.push("Incluye un numero.");
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push("Incluye un simbolo.");

  return {
    valid: errors.length === 0,
    errors,
    score: 5 - errors.length,
  };
}

export function passwordRequirements() {
  return [
    "Minimo 10 caracteres",
    "Una mayuscula y una minuscula",
    "Un numero",
    "Un simbolo",
  ];
}
