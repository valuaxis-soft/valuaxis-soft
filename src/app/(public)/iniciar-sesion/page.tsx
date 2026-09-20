import { redirect } from "next/navigation";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { LoginForm } from "@/features/auth/components/login-form";
import { SessionExpiredAlert } from "@/features/auth/components/session-expired-alert";
import { getCurrentSession } from "@/features/auth/services/session.service";

export default async function IniciarSesionPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; redirectTo?: string; reset?: string }>;
}) {
  const session = await getCurrentSession();
  if (session) redirect("/dashboard");

  const params = await searchParams;

  return (
    <AuthShell>
      <SessionExpiredAlert reason={params.reason} />
      <AuthCard
        title="Iniciar sesion"
        description={params.reset ? "Tu contrasena se actualizo correctamente." : "Accede con tu correo y contrasena."}
      >
        <LoginForm redirectTo={params.redirectTo} />
      </AuthCard>
    </AuthShell>
  );
}
