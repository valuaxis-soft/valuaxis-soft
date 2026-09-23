"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { verifyEmailAction, type VerifyEmailActionState } from "../actions/verify-email.action";

export function VerifyEmailForm({ token }: { token: string }) {
  const [result, formAction, pending] = useActionState<VerifyEmailActionState, FormData>(verifyEmailAction, null);

  if (result) {
    return (
      <div className="grid gap-4">
        <Alert variant={result.ok ? "default" : "destructive"}>
          {result.ok ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}
          <AlertTitle>{result.ok ? "Correo verificado" : "No pudimos verificar el correo"}</AlertTitle>
          <AlertDescription>
            {result.ok ? "Tu cuenta ya puede continuar el flujo de acceso." : result.message}
          </AlertDescription>
        </Alert>
        <Button render={<Link href="/iniciar-sesion" />}>Ir a iniciar sesión</Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-muted-foreground">Confirma que este correo te pertenece para activar tu cuenta.</p>
      <Button type="submit" disabled={pending}>
        {pending ? "Verificando..." : "Confirmar mi correo"}
      </Button>
    </form>
  );
}
