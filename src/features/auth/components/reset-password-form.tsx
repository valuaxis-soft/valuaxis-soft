"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { resetPasswordAction, type ResetPasswordActionState } from "../actions/reset-password.action";
import { AuthFeedback } from "./auth-feedback";
import { PasswordField } from "./password-field";
import { PasswordStrength } from "./password-strength";

const initialState: ResetPasswordActionState = { ok: true, data: undefined };

export function ResetPasswordForm({ token }: { token?: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="token" value={token ?? ""} />
      {!state.ok ? <AuthFeedback message={state.message} severity={state.severity} /> : null}
      <FieldGroup>
        <Field data-invalid={!state.ok && Boolean(state.fieldErrors?.password)}>
          <FieldLabel htmlFor="password">Nueva contrasena</FieldLabel>
          <PasswordField
            id="password"
            name="password"
            placeholder="Nueva contrasena"
            autoComplete="new-password"
            disabled={pending}
            invalid={!state.ok && Boolean(state.fieldErrors?.password)}
            onValueChange={setPassword}
          />
          <PasswordStrength password={password} />
          <FieldError>{!state.ok ? state.fieldErrors?.password?.[0] : undefined}</FieldError>
        </Field>
        <Field data-invalid={!state.ok && Boolean(state.fieldErrors?.confirmPassword)}>
          <FieldLabel htmlFor="confirmPassword">Confirmar contrasena</FieldLabel>
          <PasswordField
            id="confirmPassword"
            name="confirmPassword"
            placeholder="Repite tu contrasena"
            autoComplete="new-password"
            disabled={pending}
            invalid={!state.ok && Boolean(state.fieldErrors?.confirmPassword)}
          />
          <FieldError>{!state.ok ? state.fieldErrors?.confirmPassword?.[0] : undefined}</FieldError>
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Spinner className="size-4" /> : null}
        Guardar nueva contrasena
      </Button>
    </form>
  );
}
