"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authErrorMessages, authErrorSeverity } from "../constants/auth-errors";
import { requestPasswordResetAction, type ForgotPasswordActionState } from "../actions/request-password-reset.action";
import { AuthFeedback } from "./auth-feedback";

const initialState: ForgotPasswordActionState = { ok: true, data: undefined };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  return (
    <form action={formAction} className="grid gap-5">
      {!state.ok ? <AuthFeedback message={state.message} severity={state.severity} /> : null}
      {state.ok && state !== initialState ? <PasswordResetSentNotice /> : null}

      <FieldGroup>
        <Field data-invalid={!state.ok && Boolean(state.fieldErrors?.email)}>
          <FieldLabel htmlFor="email">Correo electrónico</FieldLabel>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="email" name="email" type="email" autoComplete="email" disabled={pending} className="pl-10" />
          </div>
          <FieldError>{!state.ok ? state.fieldErrors?.email?.[0] : undefined}</FieldError>
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Spinner className="size-4" /> : null}
        Enviar instrucciones
      </Button>

      <Link className="text-center text-sm text-muted-foreground hover:text-foreground" href="/iniciar-sesion">
        Volver a iniciar sesión
      </Link>
    </form>
  );
}

export function PasswordResetSentNotice() {
  return (
    <AuthFeedback message={authErrorMessages.PASSWORD_RESET_SENT} severity={authErrorSeverity.PASSWORD_RESET_SENT}>
      <Link className="font-medium text-foreground underline underline-offset-4" href="/iniciar-sesion">
        Volver a iniciar sesión
      </Link>
    </AuthFeedback>
  );
}
