"use client";

import Link from "next/link";
import { useActionState, useState, useEffect } from "react";
import { Mail, UserRound, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { registerAction, type RegisterActionState } from "../actions/register.action";
import { AuthDivider } from "./auth-divider";
import { AuthFeedback } from "./auth-feedback";
import { GoogleAuthButton } from "./google-auth-button";
import { PasswordField } from "./password-field";
import { PasswordStrength } from "./password-strength";

const initialState: RegisterActionState = { ok: true, data: undefined };
const STORAGE_KEY = "valuo_register_form_data";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);
  const [password, setPassword] = useState("");
  
  // Estado para mantener valores del formulario
  const [formValues, setFormValues] = useState(() => {
    const emptyValues = {
      name: "",
      paternalLastName: "",
      maternalLastName: "",
      email: "",
      organizationName: "",
      acceptedTerms: false,
    };

    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          return { ...emptyValues, ...JSON.parse(saved) };
        } catch (e) {
          console.log("[REGISTER] Error parsing saved form data:", e);
        }
      }
    }

    return emptyValues;
  });

  // Guardar cambios en localStorage
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const updated = { ...formValues, [name]: value };
    setFormValues(updated);
    
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  };

  const handleCheckboxChange = (checked: boolean) => {
    const updated = { ...formValues, acceptedTerms: Boolean(checked) };
    setFormValues(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  };

  // Limpiar al éxito (redirige automáticamente, pero por seguridad)
  useEffect(() => {
    if (state.ok && !pending) {
      // El redirect ocurre en registerAction, así que esto es backup
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [state.ok, pending]);

  return (
    <form action={formAction} className="grid gap-5">
      {!state.ok ? (
        <AuthFeedback message={state.message} severity={state.severity}>
          {state.code === "EMAIL_ALREADY_REGISTERED" ? (
            <>
              <Link className="font-medium text-foreground underline underline-offset-4" href="/iniciar-sesion">
                Iniciar sesion
              </Link>
              <Link className="font-medium text-foreground underline underline-offset-4" href="/recuperar-contrasena">
                Recuperar contrasena
              </Link>
            </>
          ) : null}
          {state.code === "ACCOUNT_USES_GOOGLE" ? (
            <Link className="font-medium text-foreground underline underline-offset-4" href="/api/auth/google">
              Continuar con Google
            </Link>
          ) : null}
        </AuthFeedback>
      ) : null}
      <FieldGroup>
        <Field data-invalid={!state.ok && Boolean(state.fieldErrors?.name)}>
          <FieldLabel htmlFor="name">Nombre</FieldLabel>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input 
              id="name" 
              name="name" 
              disabled={pending} 
              className="pl-10"
              value={formValues.name}
              onChange={handleInputChange}
            />
          </div>
          <FieldError>{!state.ok ? state.fieldErrors?.name?.[0] : undefined}</FieldError>
        </Field>

        <Field data-invalid={!state.ok && Boolean(state.fieldErrors?.paternalLastName)}>
          <FieldLabel htmlFor="paternalLastName">Apellido paterno</FieldLabel>
          <Input 
            id="paternalLastName" 
            name="paternalLastName" 
            disabled={pending}
            value={formValues.paternalLastName}
            onChange={handleInputChange}
          />
          <FieldError>{!state.ok ? state.fieldErrors?.paternalLastName?.[0] : undefined}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="maternalLastName">Apellido materno</FieldLabel>
          <Input 
            id="maternalLastName" 
            name="maternalLastName" 
            disabled={pending}
            value={formValues.maternalLastName}
            onChange={handleInputChange}
          />
        </Field>

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
              className="pl-10"
              value={formValues.email}
              onChange={handleInputChange}
            />
          </div>
          <FieldError>{!state.ok ? state.fieldErrors?.email?.[0] : undefined}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="organizationName">Organizacion</FieldLabel>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input 
              id="organizationName" 
              name="organizationName" 
              disabled={pending} 
              className="pl-10"
              value={formValues.organizationName}
              onChange={handleInputChange}
            />
          </div>
        </Field>

        <Field data-invalid={!state.ok && Boolean(state.fieldErrors?.password)}>
          <FieldLabel htmlFor="password">Contrasena</FieldLabel>
          <PasswordField
            id="password"
            name="password"
            placeholder="Crea una contrasena segura"
            autoComplete="new-password"
            disabled={pending}
            invalid={!state.ok && Boolean(state.fieldErrors?.password)}
            onValueChange={setPassword}
            value={password}
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

        <Field data-invalid={!state.ok && Boolean(state.fieldErrors?.acceptedTerms)} orientation="horizontal">
          <Checkbox
            id="acceptedTerms"
            name="acceptedTerms"
            disabled={pending}
            checked={Boolean(formValues.acceptedTerms)}
            onCheckedChange={handleCheckboxChange}
          />
          <FieldLabel htmlFor="acceptedTerms">Acepto los terminos y condiciones</FieldLabel>
          <FieldError>{!state.ok ? state.fieldErrors?.acceptedTerms?.[0] : undefined}</FieldError>
        </Field>
      </FieldGroup>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Spinner className="size-4" /> : null}
        Crear cuenta
      </Button>

      <AuthDivider />
      <GoogleAuthButton />

      <p className="text-center text-sm text-muted-foreground">
        Ya tienes cuenta?{" "}
        <Link className="text-foreground" href="/iniciar-sesion">
          Inicia sesion
        </Link>
      </p>
    </form>
  );
}
