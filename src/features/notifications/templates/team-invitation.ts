export type TeamInvitationEmailContent = {
  organizationName: string;
  inviterName: string;
  roleLabel: string;
  inviteUrl: string;
  expiresAt: Date;
};

const formatDate = (date: Date) =>
  date.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" });

export function buildTeamInvitationEmailSubject(input: Pick<TeamInvitationEmailContent, "organizationName">) {
  return `Te invitaron a ${input.organizationName} en Valuaxis`;
}

export function buildTeamInvitationEmailText(input: TeamInvitationEmailContent) {
  return [
    "Hola,",
    "",
    `${input.inviterName} te invitó a trabajar en ${input.organizationName} en Valuaxis con el rol de ${input.roleLabel}.`,
    "",
    "Acepta la invitación abriendo este enlace:",
    input.inviteUrl,
    "",
    "Entra con una cuenta de este mismo correo. Si todavía no tienes una, créala con este correo y vuelve a abrir el enlace.",
    `La invitación vence el ${formatDate(input.expiresAt)}.`,
  ].join("\n");
}

export function buildTeamInvitationEmailHtml(input: TeamInvitationEmailContent) {
  const inviter = escapeHtml(input.inviterName);
  const organization = escapeHtml(input.organizationName);
  const role = escapeHtml(input.roleLabel);
  const url = escapeHtml(input.inviteUrl);

  return [
    "<!doctype html>",
    '<html lang="es">',
    "<body>",
    "<p>Hola,</p>",
    `<p>${inviter} te invitó a trabajar en <strong>${organization}</strong> en Valuaxis con el rol de <strong>${role}</strong>.</p>`,
    `<p><a href="${url}">Aceptar la invitación</a></p>`,
    `<p>Si el botón no funciona, copia y pega este enlace en tu navegador:<br>${url}</p>`,
    "<p>Entra con una cuenta de este mismo correo. Si todavía no tienes una, créala con este correo y vuelve a abrir el enlace.</p>",
    `<p>La invitación vence el ${escapeHtml(formatDate(input.expiresAt))}.</p>`,
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
