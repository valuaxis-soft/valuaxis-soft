import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcceptInvitationButton } from "@/features/team/components/accept-invitation-button";
import { describeInvitation } from "@/features/team/team.service";
import { requireSession } from "@/security/guards/require-session";

export const metadata: Metadata = { title: "Invitación" };

export default async function InvitationPage({ params }: PageProps<"/organizacion/invitaciones/[token]">) {
  const { token } = await params;
  const user = await requireSession(`/organizacion/invitaciones/${encodeURIComponent(token)}`);
  const invitation = token.length >= 20 && token.length <= 200 ? await describeInvitation(token, user) : { state: "invalida" as const };

  const body = (() => {
    if (invitation.state === "invalida") {
      return { title: "Invitación no válida", text: "El enlace no es correcto o el equipo ya no existe. Pide que te la envíen de nuevo." };
    }
    if (invitation.state === "vencida") {
      return { title: "La invitación venció", text: `Pídele a ${invitation.invitedBy} que te la reenvíe.` };
    }
    if (invitation.state === "cancelada") {
      return { title: "La invitación fue cancelada", text: `Si fue un error, pídele a ${invitation.invitedBy} que te invite otra vez.` };
    }
    if (!invitation.matchesUser) {
      return {
        title: "Esta invitación es para otro correo",
        text: `Es para ${invitation.email} y entraste como ${user.email}. Cierra sesión y entra con una cuenta de ${invitation.email}.`,
      };
    }
    return null;
  })();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        {body ? (
          <>
            <CardHeader>
              <CardTitle>{body.title}</CardTitle>
              <CardDescription>{body.text}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Ir a mi tablero</Link>
            </CardContent>
          </>
        ) : invitation.state !== "invalida" ? (
          <>
            <CardHeader>
              <CardTitle>Te invitaron a {invitation.organizationName}</CardTitle>
              <CardDescription>
                {invitation.invitedBy} te invitó con el rol de {invitation.roleLabel}. Al aceptar verás los avalúos del equipo.
                Tus otros espacios se conservan y puedes cambiar entre ellos desde el encabezado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AcceptInvitationButton selector={{ token }} alreadyAccepted={invitation.state === "aceptada"} />
            </CardContent>
          </>
        ) : null}
      </Card>
    </main>
  );
}
