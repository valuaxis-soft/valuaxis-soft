import assert from "node:assert/strict";
import { test } from "node:test";
import { authErrorMessages, authErrorSeverity } from "../src/features/auth/constants/auth-errors";
import { parseForgotPasswordInput } from "../src/features/auth/validations/forgot-password.schema";
import { parseLoginInput } from "../src/features/auth/validations/login.schema";
import { parseRegisterInput } from "../src/features/auth/validations/register.schema";
import { parseResetPasswordInput } from "../src/features/auth/validations/reset-password.schema";

function form(values: Record<string, string | boolean>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "boolean") {
      if (value) formData.set(key, "on");
      continue;
    }
    formData.set(key, value);
  }
  return formData;
}

test("login validation reports each required field", () => {
  const parsed = parseLoginInput(form({}));

  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.fieldErrors.email, ["Escribe tu correo electronico."]);
  assert.deepEqual(parsed.fieldErrors.password, ["Escribe tu contrasena."]);
});

test("login validation reports invalid email format", () => {
  const parsed = parseLoginInput(form({ email: "correo", password: "secret" }));

  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.fieldErrors.email, ["Escribe un correo electronico valido."]);
});

test("register validation reports required fields, password policy and mismatched confirmation", () => {
  const parsed = parseRegisterInput(
    form({
      email: "bad",
      password: "short",
      confirmPassword: "different",
      acceptedTerms: false,
    }),
  );

  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.fieldErrors.name, ["Escribe tu nombre."]);
  assert.deepEqual(parsed.fieldErrors.paternalLastName, ["Escribe tu apellido."]);
  assert.deepEqual(parsed.fieldErrors.email, ["Escribe un correo electronico valido."]);
  assert.match(parsed.fieldErrors.password?.join(" "), /10 caracteres/);
  assert.deepEqual(parsed.fieldErrors.confirmPassword, ["Las contrasenas no coinciden."]);
  assert.deepEqual(parsed.fieldErrors.acceptedTerms, ["Debes aceptar los terminos para continuar."]);
});

test("forgot password validation distinguishes missing and invalid email", () => {
  assert.deepEqual(parseForgotPasswordInput(form({})).fieldErrors.email, ["Escribe tu correo electronico."]);
  assert.deepEqual(parseForgotPasswordInput(form({ email: "bad" })).fieldErrors.email, [
    "Escribe un correo electronico valido.",
  ]);
});

test("reset password validation reports missing token and mismatched passwords", () => {
  const parsed = parseResetPasswordInput(
    form({
      password: "Valid-password-1",
      confirmPassword: "Valid-password-2",
    }),
  );

  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.fieldErrors.token, ["El enlace no es valido."]);
  assert.deepEqual(parsed.fieldErrors.confirmPassword, ["Las contrasenas no coinciden."]);
});

test("auth domain messages classify recoverable conflicts as warnings", () => {
  assert.equal(
    authErrorMessages.EMAIL_ALREADY_REGISTERED,
    "Ya existe una cuenta asociada a este correo. Inicia sesion o recupera tu contrasena.",
  );
  assert.equal(authErrorSeverity.EMAIL_ALREADY_REGISTERED, "warning");
  assert.equal(authErrorMessages.INVALID_CREDENTIALS, "El correo o la contrasena son incorrectos.");
  assert.equal(authErrorSeverity.INVALID_CREDENTIALS, "error");
  assert.equal(authErrorMessages.EMAIL_NOT_VERIFIED, "Tu correo todavia no ha sido verificado. Revisa tu bandeja o solicita un nuevo enlace.");
  assert.equal(authErrorSeverity.ACCOUNT_USES_GOOGLE, "warning");
  assert.equal(authErrorSeverity.OAUTH_ACCOUNT_CONFLICT, "warning");
});
