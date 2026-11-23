"use client";

import { CheckCircle2, Info, Loader2, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { api, SessionExpiredError } from "@/lib/api-client";
import { CFDI_USES, FISCAL_REGIMES, fiscalDataSchema } from "../invoice-rules";
import type { FiscalDataDto, InvoicingOverviewDto } from "../invoicing.service";

type FormState = Omit<FiscalDataDto, "complete">;
type FieldName = keyof FormState;

const toForm = ({ complete: _complete, ...fields }: FiscalDataDto): FormState => fields;

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : fallback;

/**
 * «Datos fiscales»: what every CFDI of the organization's purchases is issued
 * to. It saves even while automatic invoicing is off; without them, purchases
 * go in the monthly global invoice to the general public.
 */
export function FiscalDataCard({ invoicing, canManage }: { invoicing: InvoicingOverviewDto; canManage: boolean }) {
  const [saved, setSaved] = useState(invoicing.fiscalData);
  const [form, setForm] = useState<FormState>(() => toForm(invoicing.fiscalData));
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [busy, setBusy] = useState(false);

  const set = (key: FieldName) => (event: { target: { value: string } }) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = fiscalDataSchema.safeParse(form);
    if (!parsed.success) {
      const next: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldName;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setBusy(true);
    try {
      const next = await api.billing.saveFiscalData(parsed.data);
      setSaved(next);
      setForm(toForm(next));
      toast.success("Datos fiscales guardados.");
    } catch (error) {
      toast.error(errorMessage(error, "No se pudieron guardar los datos fiscales."));
    } finally {
      setBusy(false);
    }
  };

  const field = (name: FieldName) => ({ "aria-invalid": errors[name] ? true : undefined, disabled: !canManage || busy });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Datos fiscales
          {saved.complete ? (
            <Badge variant="secondary">
              <CheckCircle2 /> Completos
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          A estos datos se emite la factura (CFDI) de cada compra, y se envía en PDF y XML al correo para facturas. Deben coincidir
          exactamente con tu Constancia de Situación Fiscal.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!invoicing.enabled ? (
          <Alert>
            <Info />
            <AlertTitle>La facturación automática todavía no está habilitada</AlertTitle>
            <AlertDescription>
              Puedes guardar tus datos fiscales desde ahora. Cuando se habilite, tus compras se facturarán con ellos.
            </AlertDescription>
          </Alert>
        ) : !saved.complete ? (
          <Alert>
            <Info />
            <AlertTitle>Sin datos fiscales, tus compras no se facturan a tu RFC</AlertTitle>
            <AlertDescription>Mientras no los captures, tus pagos se incluyen en la factura global al público en general de cada mes.</AlertDescription>
          </Alert>
        ) : null}
        <form onSubmit={save} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="fiscal-rfc">RFC</FieldLabel>
              <Input id="fiscal-rfc" value={form.rfc} maxLength={14} onChange={set("rfc")} className="uppercase" autoComplete="off" {...field("rfc")} />
              <FieldError>{errors.rfc}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="fiscal-zip">Código postal del domicilio fiscal</FieldLabel>
              <Input id="fiscal-zip" value={form.zip} maxLength={5} inputMode="numeric" onChange={set("zip")} className="tabular-nums" {...field("zip")} />
              <FieldError>{errors.zip}</FieldError>
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="fiscal-legal-name">Razón social o nombre</FieldLabel>
              <Input id="fiscal-legal-name" value={form.legalName} maxLength={220} onChange={set("legalName")} {...field("legalName")} />
              <FieldDescription>
                Tal como aparece en la Constancia. Es la misma razón social de «Datos del despacho»; en la factura se omite el régimen
                societario (por ejemplo, «S.A. de C.V.»), como pide el SAT.
              </FieldDescription>
              <FieldError>{errors.legalName}</FieldError>
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="fiscal-regime">Régimen fiscal</FieldLabel>
              <NativeSelect id="fiscal-regime" className="w-full" value={form.taxSystem} onChange={set("taxSystem")} {...field("taxSystem")}>
                <NativeSelectOption value="">Elige el régimen…</NativeSelectOption>
                {FISCAL_REGIMES.map((regime) => (
                  <NativeSelectOption key={regime.key} value={regime.key}>
                    {regime.key} · {regime.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError>{errors.taxSystem}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="fiscal-use">Uso del CFDI</FieldLabel>
              <NativeSelect id="fiscal-use" className="w-full" value={form.cfdiUse} onChange={set("cfdiUse")} {...field("cfdiUse")}>
                <NativeSelectOption value="">Elige el uso…</NativeSelectOption>
                {CFDI_USES.map((use) => (
                  <NativeSelectOption key={use.key} value={use.key}>
                    {use.key} · {use.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError>{errors.cfdiUse}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="fiscal-email">Correo para facturas</FieldLabel>
              <Input id="fiscal-email" type="email" value={form.email} maxLength={180} onChange={set("email")} {...field("email")} />
              <FieldError>{errors.email}</FieldError>
            </Field>
          </div>
          {canManage ? (
            <Button type="submit" className="w-fit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Save />}
              Guardar datos fiscales
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Solo un administrador puede cambiar los datos fiscales.</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
