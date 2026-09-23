import type { Metadata } from "next";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { VerifyEmailStatus } from "@/features/auth/components/verify-email-status";

export const metadata: Metadata = {
  title: "Verificar correo",
  robots: { index: false, follow: false },
};

export default async function VerificarCorreoPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; sent?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthShell>
      <AuthCard title="Verificación de correo" description="Confirma que este correo te pertenece.">
        <VerifyEmailStatus token={params.token} sent={params.sent} />
      </AuthCard>
    </AuthShell>
  );
}
