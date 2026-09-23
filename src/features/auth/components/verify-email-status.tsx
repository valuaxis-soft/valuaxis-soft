import { CheckCircle2, CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { VerifyEmailForm } from "./verify-email-form";

export function VerifyEmailStatus({ token, sent }: { token?: string; sent?: string }) {
  if (sent) {
    return (
      <Alert>
        <CheckCircle2 className="size-4" />
        <AlertTitle>Revisa tu correo</AlertTitle>
        <AlertDescription>Te enviamos un enlace para verificar tu cuenta.</AlertDescription>
      </Alert>
    );
  }

  if (!token) {
    return (
      <Alert>
        <CircleAlert className="size-4" />
        <AlertTitle>Enlace requerido</AlertTitle>
        <AlertDescription>Abre esta pantalla desde el enlace de verificación.</AlertDescription>
      </Alert>
    );
  }

  return <VerifyEmailForm token={token} />;
}
