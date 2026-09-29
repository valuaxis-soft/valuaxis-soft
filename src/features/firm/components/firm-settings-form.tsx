"use client";

import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, SessionExpiredError } from "@/lib/api-client";
import { formatValuationFolio, normalizeFolioPrefix } from "../firm-rules";
import type { FirmSettingsDto } from "../firm.service";

type FormState = {
  legalName: string;
  rfc: string;
  address: string;
  phone: string;
  email: string;
  appraiserName: string;
  appraiserRegistration: string;
  validityMonths: string;
  folioPrefix: string;
};

const toForm = (settings: FirmSettingsDto): FormState => ({
  legalName: settings.legalName ?? "",
  rfc: settings.rfc ?? "",
  address: settings.address ?? "",
  phone: settings.phone ?? "",
  email: settings.email ?? "",
  appraiserName: settings.appraiserName ?? "",
  appraiserRegistration: settings.appraiserRegistration ?? "",
  validityMonths: String(settings.validityMonths),
  folioPrefix: settings.folioPrefix,
});

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof SessionExpiredError ? "Tu sesión expiró. Vuelve a iniciar sesión." : error instanceof Error ? error.message : fallback;

/** Datos del despacho: letterhead, logo and the defaults of new valuations. */
export function FirmSettingsForm() {
  const [settings, setSettings] = useState<FirmSettingsDto | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "logo" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    api.firm.get()
      .then((next) => { if (active) { setSettings(next); setForm(toForm(next)); } })
      .catch((error: unknown) => { if (active) setLoadError(errorMessage(error, "No se pudieron cargar los datos del despacho.")); });
    return () => { active = false; };
  }, []);

  if (loadError) return <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{loadError}</p>;
  if (!settings || !form) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando los datos del despacho…
      </div>
    );
  }

  const set = (key: keyof FormState) => (event: { target: { value: string } }) =>
    setForm((current) => (current ? { ...current, [key]: event.target.value } : current));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("save");
    try {
      const next = await api.firm.save({
        legalName: form.legalName,
        rfc: form.rfc,
        address: form.address,
        phone: form.phone,
        email: form.email,
        appraiserName: form.appraiserName,
        appraiserRegistration: form.appraiserRegistration,
        validityMonths: Number(form.validityMonths),
        folioPrefix: form.folioPrefix,
      });
      setSettings(next);
      setForm(toForm(next));
      toast.success("Datos del despacho guardados.");
    } catch (error) {
      toast.error(errorMessage(error, "No se pudieron guardar los datos."));
    } finally {
      setBusy(null);
    }
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setBusy("logo");
    try {
      const { logoUrl } = await api.firm.uploadLogo(file);
      setSettings({ ...settings, logoUrl });
      toast.success("Logotipo actualizado.");
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo subir el logotipo."));
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const removeLogo = async () => {
    setBusy("logo");
    try {
      await api.firm.deleteLogo();
      setSettings({ ...settings, logoUrl: null });
      toast.success("Logotipo quitado.");
    } catch (error) {
      toast.error(errorMessage(error, "No se pudo quitar el logotipo."));
    } finally {
      setBusy(null);
    }
  };

  const prefixPreview = normalizeFolioPrefix(form.folioPrefix) || "VLO";

  return (
    <form onSubmit={save} className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Membrete</CardTitle>
          <CardDescription>
            Aparece en el encabezado de cada página del dictamen. Si un avalúo tiene su propia imagen o datos en la carátula, esos
            tienen prioridad.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-24 w-48 items-center justify-center overflow-hidden rounded-md border bg-white">
              {settings.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.logoUrl} alt="Logotipo del despacho" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">Sin logotipo</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => void uploadLogo(event.target.files?.[0])}
              />
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
                {busy === "logo" ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
                {settings.logoUrl ? "Cambiar logotipo" : "Subir logotipo"}
              </Button>
              {settings.logoUrl ? (
                <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void removeLogo()}>
                  <Trash2 className="size-4" /> Quitar
                </Button>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            El nombre del membrete es el del equipo, <span className="font-medium text-foreground">{settings.name}</span>; se cambia en Equipo.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="firm-legal-name">Razón social</FieldLabel>
              <Input id="firm-legal-name" value={form.legalName} maxLength={220} onChange={set("legalName")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="firm-rfc">RFC</FieldLabel>
              <Input id="firm-rfc" value={form.rfc} maxLength={13} onChange={set("rfc")} className="uppercase" />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="firm-address">Dirección</FieldLabel>
              <Textarea id="firm-address" rows={2} value={form.address} maxLength={500} onChange={set("address")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="firm-phone">Teléfono</FieldLabel>
              <Input id="firm-phone" type="tel" value={form.phone} maxLength={30} onChange={set("phone")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="firm-email">Correo</FieldLabel>
              <Input id="firm-email" type="email" value={form.email} maxLength={180} onChange={set("email")} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Avalúos nuevos</CardTitle>
          <CardDescription>Con qué datos nace cada avalúo. En cada uno se pueden cambiar desde la carátula.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="firm-appraiser">Perito que firma</FieldLabel>
            <Input id="firm-appraiser" value={form.appraiserName} maxLength={180} placeholder="Ing. Nombre Apellido" onChange={set("appraiserName")} />
            <FieldDescription>Si lo dejas vacío, firma el responsable del avalúo.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="firm-registration">Registro o cédula del perito</FieldLabel>
            <Input id="firm-registration" value={form.appraiserRegistration} maxLength={120} onChange={set("appraiserRegistration")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="firm-validity">Vigencia (meses)</FieldLabel>
            <Input id="firm-validity" type="number" min={1} max={24} value={form.validityMonths} onChange={set("validityMonths")} />
            <FieldDescription>La vigencia se cuenta desde la fecha del avalúo.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="firm-prefix">Prefijo del folio</FieldLabel>
            <Input id="firm-prefix" value={form.folioPrefix} maxLength={10} className="uppercase" onChange={set("folioPrefix")} />
            <FieldDescription>
              Los folios se verán como {formatValuationFolio(prefixPreview, 1)}. Un prefijo nuevo empieza en 0001; uno que ya usaste sigue su consecutivo.
            </FieldDescription>
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={busy !== null}>
          {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : null}
          Guardar
        </Button>
      </div>
    </form>
  );
}
