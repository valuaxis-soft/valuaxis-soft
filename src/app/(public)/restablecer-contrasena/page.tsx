import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export default async function RestablecerContrasenaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthShell>
      <AuthCard title="Nueva contrasena" description="Define una contrasena segura para tu cuenta.">
        <ResetPasswordForm token={params.token} />
      </AuthCard>
    </AuthShell>
  );
}
