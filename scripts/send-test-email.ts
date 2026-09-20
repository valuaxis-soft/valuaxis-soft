import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { emailService } = await import("../src/infrastructure/email/email.service");
  const to = process.env.TEST_EMAIL_TO;
  const appUrl = process.env.APP_URL;

  if (!to) {
    throw new Error("Define TEST_EMAIL_TO para enviar un correo de prueba.");
  }

  if (!appUrl) {
    throw new Error("Define APP_URL para construir el enlace de prueba.");
  }

  const verificationUrl = new URL(`/verificar-correo?token=${encodeURIComponent(randomUUID())}`, appUrl).toString();

  await emailService.sendVerificationEmail({
    to,
    name: "Prueba Valuo",
    verificationUrl,
  });

  console.info("Correo de prueba solicitado al proveedor configurado.", {
    provider: process.env.EMAIL_PROVIDER,
    to,
  });
}

main().catch((error) => {
  console.error("No se pudo enviar el correo de prueba.", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorMessage: error instanceof Error ? error.message : "Unknown error",
  });
  process.exitCode = 1;
});
