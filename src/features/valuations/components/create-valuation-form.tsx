"use client";

import { FormEvent, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { ValuaxisLogo } from "@/components/brand/valuaxis-logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import type { ValuationCreationCatalogs } from "@/features/valuations/services/valuation-catalogs.service";

type CatalogMissing = {
  code: string;
  label: string;
};

type TemplateOption = ValuationCreationCatalogs["templates"][number];

/** The templates offered for an appraisal type: the firm's documents serve any type. */
function templatesFor(templates: TemplateOption[], appraisalTypeId: string) {
  return templates.filter((template) => template.document || template.appraisalTypeId === Number(appraisalTypeId));
}

/** "Plantilla base" starts on the system's template of the type, when there is one. */
function defaultTemplateId(templates: TemplateOption[], appraisalTypeId: string) {
  return templatesFor(templates, appraisalTypeId).find((template) => template.system)?.id.toString() ?? "";
}

/** The firm's template the "Plantillas" page sent (by its public id), when it is one of the offered documents. */
function preselectedTemplateId(templates: TemplateOption[], publicId: string | null) {
  return templates.find((template) => template.document && template.publicId === publicId)?.id.toString() ?? null;
}

/** The kind of valuation and, when it says, of property a firm's template is meant for, as the form's values. */
export function typesOfTemplate(templates: TemplateOption[], templateId: string): { appraisalTypeId?: string; propertyTypeId?: string } {
  const template = templates.find((item) => item.document && item.id.toString() === templateId);
  if (!template) return {};
  return {
    ...(template.appraisalTypeId ? { appraisalTypeId: String(template.appraisalTypeId) } : {}),
    ...(template.propertyTypeId ? { propertyTypeId: String(template.propertyTypeId) } : {}),
  };
}

export function CreateValuationForm({
  catalogs,
  preselectedTemplate = null,
}: {
  catalogs: ValuationCreationCatalogs;
  /** "Crear avalúo con esta plantilla": the public id of the firm's template to start on. */
  preselectedTemplate?: string | null;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingCatalog, setMissingCatalog] = useState<string | null>(null);
  const [form, setForm] = useState(() => {
    const preselected = preselectedTemplateId(catalogs.templates, preselectedTemplate);
    return {
      title: "",
      clientName: "",
      appraisalTypeId: catalogs.appraisalTypes[0]?.id?.toString() ?? "",
      propertyTypeId: catalogs.propertyTypes[0]?.id?.toString() ?? "",
      operationTypeId: catalogs.operationTypes[0]?.id?.toString() ?? "",
      templateId: preselected ?? defaultTemplateId(catalogs.templates, catalogs.appraisalTypes[0]?.id?.toString() ?? ""),
      responsibleUserId: catalogs.responsibleUsers[0]?.id?.toString() ?? "",
      ...(preselected ? typesOfTemplate(catalogs.templates, preselected) : null),
    };
  });

  const missing = useMemo<CatalogMissing | null>(() => {
    if (!catalogs.appraisalTypes.length) return { code: "CATALOG_TYPE_APPRAISAL_MISSING", label: "Tipo de avalúo" };
    if (!catalogs.propertyTypes.length) return { code: "CATALOG_PROPERTY_TYPE_MISSING", label: "Tipo de bien" };
    if (!catalogs.operationTypes.length) return { code: "CATALOG_OPERATION_TYPE_MISSING", label: "Tipo de operación" };
    if (!catalogs.responsibleUsers.length) return { code: "RESPONSIBLE_USER_MISSING", label: "Usuario responsable" };
    return null;
  }, [catalogs]);

  const templatesForType = templatesFor(catalogs.templates, form.appraisalTypeId);
  const systemTemplates = templatesForType.filter((template) => template.system);
  const firmTemplates = templatesForType.filter((template) => !template.system);
  const chosenTemplate = catalogs.templates.find((template) => template.id.toString() === form.templateId);

  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => {
      // A firm's document serves any type, so changing the type keeps it chosen.
      const keepsTemplate = catalogs.templates.some((template) => template.document && template.id.toString() === current.templateId);
      return {
        ...current,
        [key]: value,
        ...(key === "appraisalTypeId" && !keepsTemplate ? { templateId: defaultTemplateId(catalogs.templates, value) } : null),
        // Choosing a firm's template sets the kinds of valuation and property it is meant for; they still change.
        ...(key === "templateId" ? typesOfTemplate(catalogs.templates, value) : null),
      };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMissingCatalog(null);

    if (missing) {
      setError("No podemos crear el avalúo porque falta configuración del sistema. Avísale a quien administra tu despacho.");
      setMissingCatalog(missing.label);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/avaluos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          clientName: form.clientName,
          appraisalTypeId: Number(form.appraisalTypeId),
          propertyTypeId: Number(form.propertyTypeId),
          operationTypeId: Number(form.operationTypeId),
          templateId: form.templateId ? Number(form.templateId) : null,
          responsibleUserId: form.responsibleUserId ? Number(form.responsibleUserId) : null,
        }),
      });
      const json = await response.json();

      if (!response.ok || !json?.data?.workspaceUrl) {
        setError(json?.error ?? "No pudimos crear el avalúo. Revisa los datos e inténtalo de nuevo.");
        setMissingCatalog(json?.missingCatalog ?? null);
        return;
      }

      toast.success("Listo, tu avalúo está creado.");
      router.replace(json.data.workspaceUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear el avalúo. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <div className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4">
          <Link href="/dashboard" aria-label="Valuaxis, ir al inicio" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <ValuaxisLogo markClassName="size-8" className="text-base" />
          </Link>
          <Link href="/avaluos" className={cn(buttonVariants({ variant: "ghost" }), "h-11 gap-1.5 px-3 sm:h-9")}>
            <ArrowLeft aria-hidden="true" />
            Volver a avalúos
          </Link>
        </div>
      </div>
      <main id="contenido" className="mx-auto max-w-3xl px-4 pt-8 pb-16">
        <p className="text-sm font-medium text-primary">Nuevo avalúo</p>
        <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight sm:text-3xl">¿Qué vas a valuar?</h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Con estos datos se crea el avalúo y abres el editor. El folio se asigna solo y todo lo puedes cambiar después.
        </p>

        {error ? (
          <div role="alert" className="mt-6 flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <div>
              <p className="font-medium text-foreground">{error}</p>
              {missingCatalog ? <p className="mt-1 text-muted-foreground">Catálogo faltante: {missingCatalog}</p> : null}
            </div>
          </div>
        ) : null}

        <form className="mt-6 grid gap-6" onSubmit={handleSubmit}>
          <fieldset className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <legend className="px-1 text-sm font-semibold">El trabajo</legend>
            <FieldGroup className="mt-2">
              <div className="grid gap-4 md:grid-cols-2">
                <TextField label="Título del avalúo" placeholder="Ej. Casa en Providencia" value={form.title} onChange={(value) => update("title", value)} />
                <TextField
                  label="Nombre del cliente"
                  placeholder="Persona o empresa que lo solicita"
                  value={form.clientName}
                  onChange={(value) => update("clientName", value)}
                />
                <SelectField
                  label="Usuario responsable"
                  value={form.responsibleUserId}
                  onChange={(value) => update("responsibleUserId", value)}
                  options={catalogs.responsibleUsers}
                />
              </div>
            </FieldGroup>
          </fieldset>

          <fieldset className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <legend className="px-1 text-sm font-semibold">El bien y el propósito</legend>
            <FieldGroup className="mt-2">
              <div className="grid gap-4 md:grid-cols-3">
                <SelectField
                  label="Tipo de avalúo"
                  value={form.appraisalTypeId}
                  onChange={(value) => update("appraisalTypeId", value)}
                  options={catalogs.appraisalTypes}
                />
                <SelectField
                  label="Tipo de bien"
                  value={form.propertyTypeId}
                  onChange={(value) => update("propertyTypeId", value)}
                  options={catalogs.propertyTypes}
                />
                <SelectField
                  label="Tipo de operación"
                  value={form.operationTypeId}
                  onChange={(value) => update("operationTypeId", value)}
                  options={catalogs.operationTypes}
                />
              </div>
            </FieldGroup>
          </fieldset>

          <fieldset className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <legend className="px-1 text-sm font-semibold">Cómo empieza</legend>
            <FieldGroup className="mt-2">
              <Field>
                <FieldLabel htmlFor="create-valuation-template">Plantilla base</FieldLabel>
                <NativeSelect
                  id="create-valuation-template"
                  className="w-full [&_select]:h-11 sm:[&_select]:h-9"
                  value={form.templateId}
                  onChange={(event) => update("templateId", event.target.value)}
                >
                  <NativeSelectOption value="">Estructura del sistema</NativeSelectOption>
                  {systemTemplates.map((template) => (
                    <NativeSelectOption key={template.id} value={template.id}>
                      {template.label}
                    </NativeSelectOption>
                  ))}
                  {firmTemplates.length ? (
                    <NativeSelectOptGroup label="Plantillas del despacho">
                      {firmTemplates.map((template) => (
                        <NativeSelectOption key={template.id} value={template.id}>
                          {template.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelectOptGroup>
                  ) : null}
                </NativeSelect>
                {chosenTemplate?.description ? (
                  <FieldDescription data-template-description>{chosenTemplate.description}</FieldDescription>
                ) : null}
                <FieldDescription>
                  Una plantilla del despacho trae las secciones, bloques y apartados con que se guardó; los valores, solo si se guardaron con ella.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </fieldset>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="h-11 px-4 sm:h-10" onClick={() => router.push("/avaluos")}>
              Cancelar
            </Button>
            <Button type="submit" className="h-11 gap-2 px-5 sm:h-10" disabled={submitting || Boolean(missing)}>
              {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
              {submitting ? "Creando…" : "Crear y abrir el editor"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

function TextField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} required placeholder={placeholder} className="h-11 text-base sm:h-9 sm:text-sm" value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function SelectField({
  label,
  onChange,
  options,
  placeholder = "Selecciona una opción",
  required = true,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: { id: number; label: string }[];
  placeholder?: string;
  required?: boolean;
  value: string;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        className="w-full [&_select]:h-11 sm:[&_select]:h-9"
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <NativeSelectOption value="">{placeholder}</NativeSelectOption>
        {options.map((option) => (
          <NativeSelectOption key={option.id} value={option.id}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}
