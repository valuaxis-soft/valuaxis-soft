import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { LoginForm } from "@/features/auth/components/login-form";
import { SessionExpiredAlert } from "@/features/auth/components/session-expired-alert";
import { ContinueWhenSignedIn } from "@/features/auth/components/session-sign-in-channel";
import { getCurrentSession } from "@/features/auth/services/session.service";
import { safeRedirectPath } from "@/security/validation/redirect-safety";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Accede a Valuaxis para capturar, organizar y emitir tus avalúos inmobiliarios en línea.",
  alternates: { canonical: "/iniciar-sesion" },
};

export default async function IniciarSesionPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; redirectTo?: string; reset?: string }>;
}) {
  const params = await searchParams;
  // Signed in already (in another tab, say): straight to where the page was going.
  const destination = safeRedirectPath(params.redirectTo);
  const session = await getCurrentSession();
  if (session) redirect(destination);

  return (
    <AuthShell>
      <ContinueWhenSignedIn destination={destination} />
      <SessionExpiredAlert reason={params.reason} />
      <AuthCard
        title="Iniciar sesión"
        description={params.reset ? "Tu contraseña se actualizó correctamente." : "Accede con tu correo y contraseña."}
      >
        <LoginForm redirectTo={params.redirectTo} />
      </AuthCard>
    </AuthShell>
  );
}
