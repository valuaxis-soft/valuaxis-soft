export function buildVerificationEmailText(verificationUrl: string) {
  return [
    "Hola,",
    "",
    "Confirma tu correo en Valuo abriendo este enlace:",
    verificationUrl,
    "",
    "Si no creaste esta cuenta, puedes ignorar este mensaje.",
  ].join("\n");
}

export function buildVerificationEmailHtml(input: { name: string; verificationUrl: string }) {
  const name = escapeHtml(input.name || "usuario");
  const verificationUrl = escapeHtml(input.verificationUrl);

  return [
    "<!doctype html>",
    '<html lang="es">',
    "<body>",
    `<p>Hola ${name},</p>`,
    "<p>Confirma tu correo en Valuo para terminar la configuracion de tu cuenta.</p>",
    `<p><a href="${verificationUrl}">Verificar correo</a></p>`,
    `<p>Si el boton no funciona, copia y pega este enlace en tu navegador:<br>${verificationUrl}</p>`,
    "<p>Si no creaste esta cuenta, puedes ignorar este mensaje.</p>",
    "</body>",
    "</html>",
  ].join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
