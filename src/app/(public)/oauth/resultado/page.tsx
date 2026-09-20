import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const oauthMessages: Record<string, { title: string; description: string; severity: "warning" | "error" }> = {
  oauth_cancelled: {
    title: "Inicio con Google cancelado",
    description: "No se completo la autorizacion con Google. Puedes intentarlo nuevamente cuando quieras.",
    severity: "warning",
  },
  oauth_invalid_state: {
    title: "Solicitud no valida",
    description: "No pudimos validar la solicitud de Google. Vuelve a iniciar sesion.",
    severity: "warning",
  },
  oauth_expired: {
    title: "Solicitud expirada",
    description: "El enlace de autenticacion expiro. Inicia el flujo otra vez.",
    severity: "warning",
  },
  oauth_provider_error: {
    title: "Google no pudo autenticarte",
    description: "No pudimos completar la validacion con Google. Intenta nuevamente.",
    severity: "error",
  },
  oauth_email_unverified: {
    title: "Correo no verificado",
    description: "Google no confirmo que ese correo este verificado, por seguridad no se creo una sesion.",
    severity: "warning",
  },
  oauth_account_blocked: {
    title: "Cuenta sin acceso",
    description: "La cuenta existe, pero no puede acceder al sistema en este momento.",
    severity: "warning",
  },
  oauth_account_conflict: {
    title: "Cuenta en conflicto",
    description: "No pudimos vincular esta cuenta de Google porque existe una configuracion incompatible.",
    severity: "warning",
  },
  oauth_session_error: {
    title: "No pudimos crear la sesion",
    description: "La autenticacion fue valida, pero no pudimos abrir una sesion local.",
    severity: "error",
  },
  oauth_unknown_error: {
    title: "No pudimos iniciar sesion",
    description: "Ocurrio un problema inesperado durante el inicio con Google.",
    severity: "error",
  },
};

export default async function OAuthResultadoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const message = params.error ? oauthMessages[params.error] ?? oauthMessages.oauth_unknown_error : null;

  return (
    <AuthShell>
      <AuthCard title="Google" description="Resultado de autenticacion externa.">
        <Alert
          variant={message?.severity === "error" ? "destructive" : "default"}
          className={message?.severity === "warning" ? "border-amber-500/50 text-amber-700 *:data-[slot=alert-description]:text-amber-700/90" : undefined}
        >
          <AlertTitle>{message ? message.title : "Autenticacion completada"}</AlertTitle>
          <AlertDescription>
            {message ? message.description : "Tu cuenta fue autenticada. Puedes continuar al dashboard."}
          </AlertDescription>
        </Alert>
        <Button className="mt-4 w-full" render={<Link href={message ? "/iniciar-sesion" : "/dashboard"} />}>
          {message ? "Volver a iniciar sesion" : "Ir al dashboard"}
        </Button>
      </AuthCard>
    </AuthShell>
  );
}
