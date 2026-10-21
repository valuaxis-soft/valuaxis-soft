"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
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
  const [form, setForm] = useState({
    title: "",
    clientName: "",
    appraisalTypeId: catalogs.appraisalTypes[0]?.id?.toString() ?? "",
    propertyTypeId: catalogs.propertyTypes[0]?.id?.toString() ?? "",
    operationTypeId: catalogs.operationTypes[0]?.id?.toString() ?? "",
    templateId: preselectedTemplateId(catalogs.templates, preselectedTemplate)
      ?? defaultTemplateId(catalogs.templates, catalogs.appraisalTypes[0]?.id?.toString() ?? ""),
    responsibleUserId: catalogs.responsibleUsers[0]?.id?.toString() ?? "",
  });

  const missing = useMemo<CatalogMissing | null>(() => {
    if (!catalogs.appraisalTypes.length) return { code: "CATALOG_TYPE_APPRAISAL_MISSING", label: "Tipo de avaluo" };
    if (!catalogs.propertyTypes.length) return { code: "CATALOG_PROPERTY_TYPE_MISSING", label: "Tipo de bien" };
    if (!catalogs.operationTypes.length) return { code: "CATALOG_OPERATION_TYPE_MISSING", label: "Tipo de operacion" };
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
      };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMissingCatalog(null);

    if (missing) {
      setError("No se puede crear el avaluo porque falta configuracion del sistema.");
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
        setError(json?.error ?? "No se pudo crear el avaluo.");
        setMissingCatalog(json?.missingCatalog ?? null);
        return;
      }

      toast.success("Avaluo creado correctamente");
      router.replace(json.data.workspaceUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el avaluo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-muted/40 p-4 text-foreground lg:p-6">
      <section className="mx-auto max-w-3xl">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Crear avaluo</CardTitle>
            <CardDescription>Captura los datos iniciales para crear el registro real.</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <p>{error}</p>
                {missingCatalog ? <p className="mt-1">Catalogo faltante: {missingCatalog}</p> : null}
              </div>
            ) : null}

            <form className="space-y-5" onSubmit={handleSubmit}>
              <FieldGroup>
                <p className="text-sm text-muted-foreground">El folio se generará automáticamente.</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <TextField label="Titulo del avaluo" value={form.title} onChange={(value) => update("title", value)} />
                  <TextField
                    label="Nombre del cliente"
                    value={form.clientName}
                    onChange={(value) => update("clientName", value)}
                  />
                  <SelectField
                    label="Usuario responsable"
                    value={form.responsibleUserId}
                    onChange={(value) => update("responsibleUserId", value)}
                    options={catalogs.responsibleUsers}
                  />
                  <SelectField
                    label="Tipo de avaluo"
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
                    label="Tipo de operacion"
                    value={form.operationTypeId}
                    onChange={(value) => update("operationTypeId", value)}
                    options={catalogs.operationTypes}
                  />
                  <Field>
                    <FieldLabel htmlFor="create-valuation-template">Plantilla base</FieldLabel>
                    <NativeSelect
                      id="create-valuation-template"
                      className="w-full"
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
                </div>
              </FieldGroup>

              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => router.push("/dashboard")}>
                  <ArrowLeft />
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting || Boolean(missing)}>
                  <Plus />
                  {submitting ? "Creando..." : "Crear avaluo"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function TextField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input required value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function SelectField({
  label,
  onChange,
  options,
  placeholder = "Selecciona una opcion",
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
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <NativeSelect
        className="w-full"
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
