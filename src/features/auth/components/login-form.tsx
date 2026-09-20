"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { loginAction, type LoginActionState } from "../actions/login.action";
import { AuthFeedback } from "./auth-feedback";
import { AuthDivider } from "./auth-divider";
import { GoogleAuthButton } from "./google-auth-button";
import { PasswordField } from "./password-field";

const initialState: LoginActionState = { ok: true, data: undefined };

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />
      {!state.ok ? (
        <AuthFeedback message={state.message} severity={state.severity}>
          {state.code === "INVALID_CREDENTIALS" ? (
            <Link className="font-medium text-foreground underline underline-offset-4" href="/recuperar-contrasena">
              Recuperar contrasena
            </Link>
          ) : null}
          {state.code === "ACCOUNT_USES_GOOGLE" ? (
            <Link className="font-medium text-foreground underline underline-offset-4" href="/api/auth/google">
              Continuar con Google
            </Link>
          ) : null}
        </AuthFeedback>
      ) : null}

      <FieldGroup>
        <Field data-invalid={!state.ok && Boolean(state.fieldErrors?.email)}>
          <FieldLabel htmlFor="email">Correo electronico</FieldLabel>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              disabled={pending}
              aria-invalid={!state.ok && Boolean(state.fieldErrors?.email)}
              className="pl-10"
            />
          </div>
          <FieldError>{!state.ok ? state.fieldErrors?.email?.[0] : undefined}</FieldError>
        </Field>

        <Field data-invalid={!state.ok && Boolean(state.fieldErrors?.password)}>
          <FieldLabel htmlFor="password">Contrasena</FieldLabel>
          <PasswordField
            id="password"
            name="password"
            placeholder="Ingresa tu contrasena"
            autoComplete="current-password"
            disabled={pending}
            invalid={!state.ok && Boolean(state.fieldErrors?.password)}
          />
          <FieldError>{!state.ok ? state.fieldErrors?.password?.[0] : undefined}</FieldError>
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Spinner className="size-4" /> : null}
        Iniciar sesion
      </Button>

      <div className="flex justify-between text-sm">
        <Link className="text-muted-foreground hover:text-foreground" href="/recuperar-contrasena">
          Olvide mi contrasena
        </Link>
        <Link className="text-muted-foreground hover:text-foreground" href="/registro">
          Crear cuenta
        </Link>
      </div>

      <AuthDivider />
      <GoogleAuthButton />
    </form>
  );
}
