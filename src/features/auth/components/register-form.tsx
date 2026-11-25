"use client";

import Link from "next/link";
import { useActionState, useState, useEffect, type ReactNode } from "react";
import { Mail, UserRound, Building2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  ConsentCheckboxes,
  EMPTY_CONSENT_BOXES,
  requiredBoxesTicked,
  type ConsentBoxState,
  type ConsentLinks,
} from "@/features/legal/components/consent-checkboxes";
import { registerAction, startGoogleRegistrationAction, type RegisterActionState } from "../actions/register.action";
import { AuthDivider } from "./auth-divider";
import { AuthFeedback } from "./auth-feedback";
import { GoogleLogo } from "./google-auth-button";
import { PasswordField } from "./password-field";
import { PasswordStrength } from "./password-strength";

const initialState: RegisterActionState = { ok: true, data: undefined };
const STORAGE_KEY = "valuo_register_form_data";

/** What the page reads from the legal documents in force (or their drafts, while nothing is published). */
export type RegisterLegalProps = {
  /** Part I of the simplified notice, rendered on the server. */
  notice: ReactNode;
  boxTexts: Record<1 | 2 | 3 | 4, string>;
  links: ConsentLinks;
  versionIds: number[];
};

const TEXT_FIELDS = ["name", "paternalLastName", "maternalLastName", "email", "organizationName", "specialty"] as const;
type TextValues = Record<(typeof TEXT_FIELDS)[number], string>;

/**
 * «Crear cuenta» (matrix 1.1): the account's data, the simplified notice in
 * full, the age declaration and the boxes. The buttons accept only with
 * casillas 1 and T (and the age) ticked; pressing one is the act of acceptance.
 * Only the typed text is kept in the browser while filling it, never a box.
 */
export function RegisterForm({ legal }: { legal: RegisterLegalProps }) {
  const [state, formAction, pending] = useActionState(registerAction, initialState);
  const [googleState, googleAction, googlePending] = useActionState(startGoogleRegistrationAction, initialState);
  const [password, setPassword] = useState("");
  const [boxes, setBoxes] = useState<ConsentBoxState>(EMPTY_CONSENT_BOXES);
  // Controlled, so a rejected submit does not empty them; not kept in the browser.
  const [phone, setPhone] = useState("");
  const [cedula, setCedula] = useState("");
  const [lastButton, setLastButton] = useState<"password" | "google">("password");
  const busy = pending || googlePending;
  const canAccept = requiredBoxesTicked(boxes);
  const shown = lastButton === "google" ? googleState : state;

  const [formValues, setFormValues] = useState<TextValues>(() => {
    const emptyValues: TextValues = { name: "", paternalLastName: "", maternalLastName: "", email: "", organizationName: "", specialty: "" };
    if (typeof window === "undefined") return emptyValues;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<TextValues> | null;
      if (!saved) return emptyValues;
      return Object.fromEntries(TEXT_FIELDS.map((key) => [key, typeof saved[key] === "string" ? saved[key] : ""])) as TextValues;
    } catch {
      return emptyValues;
    }
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const updated = { ...formValues, [name]: value };
    setFormValues(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Private window or storage blocked: the form works the same.
    }
  };

  useEffect(() => {
    if (state.ok && !pending) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing to clear.
      }
    }
  }, [state.ok, pending]);

  const fieldErrors = !shown.ok ? shown.fieldErrors : undefined;
  const error = (field: string) => fieldErrors?.[field]?.[0];

  return (
    <form action={formAction} className="grid gap-5" autoComplete="on">
      {!shown.ok ? (
        <AuthFeedback message={shown.message} severity={shown.severity}>
          {shown.code === "EMAIL_ALREADY_REGISTERED" ? (
            <>
              <Link className="font-medium text-foreground underline underline-offset-4" href="/iniciar-sesion">
                Iniciar sesión
              </Link>
              <Link className="font-medium text-foreground underline underline-offset-4" href="/recuperar-contrasena">
                Recuperar contraseña
              </Link>
            </>
          ) : null}
          {shown.code === "ACCOUNT_USES_GOOGLE" ? (
            <Link className="font-medium text-foreground underline underline-offset-4" href="/api/auth/google">
              Continuar con Google
            </Link>
          ) : null}
          {shown.code === "LEGAL_DOCUMENTS_CHANGED" ? (
            <a className="font-medium text-foreground underline underline-offset-4" href="/registro">
              Ver la versión nueva
            </a>
          ) : null}
        </AuthFeedback>
      ) : null}
      <input type="hidden" name="legalVersionIds" value={legal.versionIds.join(",")} />
      <FieldGroup>
        <Field data-invalid={Boolean(error("name"))}>
          <FieldLabel htmlFor="name">Nombre</FieldLabel>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="name" name="name" autoComplete="given-name" disabled={busy} className="pl-10" value={formValues.name} onChange={handleInputChange} />
          </div>
          <FieldError>{error("name")}</FieldError>
        </Field>

        <Field data-invalid={Boolean(error("paternalLastName"))}>
          <FieldLabel htmlFor="paternalLastName">Apellido paterno</FieldLabel>
          <Input id="paternalLastName" name="paternalLastName" autoComplete="family-name" disabled={busy} value={formValues.paternalLastName} onChange={handleInputChange} />
          <FieldError>{error("paternalLastName")}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="maternalLastName">Apellido materno</FieldLabel>
          <Input id="maternalLastName" name="maternalLastName" disabled={busy} value={formValues.maternalLastName} onChange={handleInputChange} />
        </Field>

        <Field data-invalid={Boolean(error("email"))}>
          <FieldLabel htmlFor="email">Correo electrónico</FieldLabel>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="email" name="email" type="email" autoComplete="email" disabled={busy} className="pl-10" value={formValues.email} onChange={handleInputChange} />
          </div>
          <FieldError>{error("email")}</FieldError>
        </Field>

        <Field data-invalid={Boolean(error("phone"))}>
          <FieldLabel htmlFor="phone">Teléfono</FieldLabel>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="10 dígitos" disabled={busy} className="pl-10" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
          <FieldError>{error("phone")}</FieldError>
        </Field>

        <Field data-invalid={Boolean(error("cedula"))}>
          <FieldLabel htmlFor="cedula">Cédula profesional (si la tienes)</FieldLabel>
          <Input id="cedula" name="cedula" inputMode="numeric" autoComplete="off" disabled={busy} value={cedula} onChange={(event) => setCedula(event.target.value)} />
          <FieldError>{error("cedula")}</FieldError>
        </Field>

        <Field data-invalid={Boolean(error("specialty"))}>
          <FieldLabel htmlFor="specialty">Especialidad</FieldLabel>
          <Input
            id="specialty"
            name="specialty"
            placeholder="Por ejemplo: inmuebles, maquinaria y equipo"
            disabled={busy}
            value={formValues.specialty}
            onChange={handleInputChange}
          />
          <FieldError>{error("specialty")}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="organizationName">Organización</FieldLabel>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="organizationName" name="organizationName" autoComplete="organization" disabled={busy} className="pl-10" value={formValues.organizationName} onChange={handleInputChange} />
          </div>
        </Field>

        <Field data-invalid={Boolean(error("password"))}>
          <FieldLabel htmlFor="password">Contraseña</FieldLabel>
          <PasswordField
            id="password"
            name="password"
            placeholder="Crea una contraseña segura"
            autoComplete="new-password"
            disabled={busy}
            invalid={Boolean(error("password"))}
            onValueChange={setPassword}
            value={password}
          />
          <PasswordStrength password={password} />
          <FieldError>{error("password")}</FieldError>
        </Field>

        <Field data-invalid={Boolean(error("confirmPassword"))}>
          <FieldLabel htmlFor="confirmPassword">Confirmar contraseña</FieldLabel>
          <PasswordField
            id="confirmPassword"
            name="confirmPassword"
            placeholder="Repite tu contraseña"
            autoComplete="new-password"
            disabled={busy}
            invalid={Boolean(error("confirmPassword"))}
          />
          <FieldError>{error("confirmPassword")}</FieldError>
        </Field>
      </FieldGroup>

      {legal.notice}

      <ConsentCheckboxes boxTexts={legal.boxTexts} links={legal.links} state={boxes} onChange={setBoxes} disabled={busy} errors={fieldErrors} />

      <div className="grid gap-2">
        <Button type="submit" disabled={busy || !canAccept} className="w-full" data-register-submit="" onClick={() => setLastButton("password")}>
          {pending ? <Spinner className="size-4" /> : null}
          Crear cuenta
        </Button>
        {!canAccept ? (
          <FieldDescription className="text-center text-xs">
            Para continuar, declara que eres mayor de edad y marca la casilla del aviso de privacidad y la de los términos.
          </FieldDescription>
        ) : null}
      </div>

      <AuthDivider />
      <Button
        type="submit"
        formAction={googleAction}
        formNoValidate
        variant="outline"
        className="w-full"
        disabled={busy || !canAccept}
        aria-busy={googlePending}
        data-register-google=""
        onClick={() => setLastButton("google")}
      >
        <GoogleLogo />
        {googlePending ? "Conectando..." : "Continuar con Google"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link className="text-foreground" href="/iniciar-sesion">
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}
