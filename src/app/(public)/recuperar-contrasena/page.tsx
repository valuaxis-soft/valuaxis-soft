import type { Metadata } from "next";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  robots: { index: false, follow: false },
};

export default function RecuperarContrasenaPage() {
  return (
    <AuthShell>
      <AuthCard title="Recuperar contraseña" description="Te enviaremos instrucciones si la cuenta existe.">
        <ForgotPasswordForm />
      </AuthCard>
    </AuthShell>
  );
}
