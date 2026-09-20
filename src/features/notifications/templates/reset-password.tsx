export function buildPasswordResetEmailText(resetUrl: string) {
  return [
    "Hola,",
    "",
    "Restablece tu contrasena de Valuo abriendo este enlace:",
    resetUrl,
    "",
    "Si no solicitaste este cambio, puedes ignorar este mensaje.",
  ].join("\n");
}

export function buildPasswordResetEmailHtml(input: { name: string; resetUrl: string }) {
  const name = escapeHtml(input.name || "usuario");
  const resetUrl = escapeHtml(input.resetUrl);

  return [
    "<!doctype html>",
    '<html lang="es">',
    "<body>",
    `<p>Hola ${name},</p>`,
    "<p>Recibimos una solicitud para restablecer tu contrasena de Valuo.</p>",
    `<p><a href="${resetUrl}">Restablecer contrasena</a></p>`,
    `<p>Si el boton no funciona, copia y pega este enlace en tu navegador:<br>${resetUrl}</p>`,
    "<p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>",
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
