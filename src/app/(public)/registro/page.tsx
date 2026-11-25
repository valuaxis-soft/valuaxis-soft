import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { RegisterForm } from "@/features/auth/components/register-form";
import { getCurrentSession } from "@/features/auth/services/session.service";
import { SimplifiedNoticePanel } from "@/features/legal/components/simplified-notice-panel";
import { getLegalAcceptanceContext } from "@/features/legal/consent.service";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description:
    "Crea tu cuenta y la de tu despacho en Valuaxis Soft, la plataforma web para peritos valuadores y despachos de avalúos en México.",
  alternates: { canonical: "/registro" },
};

// The legal documents in force are read on each visit: a new version shows at once.
export const dynamic = "force-dynamic";

export default async function RegistroPage() {
  const session = await getCurrentSession();
  if (session) redirect("/dashboard");
  const legal = await getLegalAcceptanceContext();

  return (
    <AuthShell>
      <AuthCard title="Crear cuenta" description="Registra tu usuario y organización inicial.">
        <RegisterForm
          legal={{
            notice: legal.notice ? <SimplifiedNoticePanel text={legal.notice.text} link={legal.notice.link} integral={legal.links["privacidad-integral"]} /> : null,
            boxTexts: legal.boxTexts,
            links: legal.links,
            versionIds: legal.versionIds,
          }}
        />
      </AuthCard>
    </AuthShell>
  );
}
