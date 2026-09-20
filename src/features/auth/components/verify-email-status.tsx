import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { verifyEmailAction } from "../actions/verify-email.action";

export async function VerifyEmailStatus({ token, sent }: { token?: string; sent?: string }) {
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
        <AlertDescription>Abre esta pantalla desde el enlace de verificacion.</AlertDescription>
      </Alert>
    );
  }

  const result = await verifyEmailAction(token);
  return (
    <div className="grid gap-4">
      <Alert variant={result.ok ? "default" : "destructive"}>
        {result.ok ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}
        <AlertTitle>{result.ok ? "Correo verificado" : "No pudimos verificar el correo"}</AlertTitle>
        <AlertDescription>{result.ok ? "Tu cuenta ya puede continuar el flujo de acceso." : result.message}</AlertDescription>
      </Alert>
      <Button render={<Link href="/iniciar-sesion" />}>Ir a iniciar sesion</Button>
    </div>
  );
}
