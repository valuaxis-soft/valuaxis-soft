import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export default function RecuperarContrasenaPage() {
  return (
    <AuthShell>
      <AuthCard title="Recuperar contrasena" description="Te enviaremos instrucciones si la cuenta existe.">
        <ForgotPasswordForm />
      </AuthCard>
    </AuthShell>
  );
}
