import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { RegisterForm } from "@/features/auth/components/register-form";
import { getCurrentSession } from "@/features/auth/services/session.service";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description:
    "Crea tu cuenta y la de tu despacho en Valuaxis, la plataforma web para peritos valuadores y despachos de avalúos en México.",
  alternates: { canonical: "/registro" },
};

export default async function RegistroPage() {
  const session = await getCurrentSession();
  if (session) redirect("/dashboard");

  return (
    <AuthShell>
      <AuthCard title="Crear cuenta" description="Registra tu usuario y organización inicial.">
        <RegisterForm />
      </AuthCard>
    </AuthShell>
  );
}
