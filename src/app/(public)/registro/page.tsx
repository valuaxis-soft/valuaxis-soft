import { redirect } from "next/navigation";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { RegisterForm } from "@/features/auth/components/register-form";
import { getCurrentSession } from "@/features/auth/services/session.service";

export default async function RegistroPage() {
  const session = await getCurrentSession();
  if (session) redirect("/dashboard");

  return (
    <AuthShell>
      <AuthCard title="Crear cuenta" description="Registra tu usuario y organizacion inicial.">
        <RegisterForm />
      </AuthCard>
    </AuthShell>
  );
}
