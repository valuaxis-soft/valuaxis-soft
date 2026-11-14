"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { CatalogOption } from "../services/valuation-catalogs.service";

export type TemplateDetails = {
  name: string;
  description: string | null;
  appraisalTypeId: number;
  /** Null: any kind of property. */
  propertyTypeId: number | null;
};

/** «Comercial · Casa habitación», or «Comercial · cualquier tipo de bien». */
export const appliesToLabel = (appraisalType: string, propertyType: string | null | undefined) =>
  `${appraisalType} · ${propertyType ?? "cualquier tipo de bien"}`;

/**
 * Name, notes and what a template is meant for: «Nueva plantilla», «Datos de
 * la plantilla» in its editor and «Editar datos» in Plantillas. Mounted only
 * while open, so it starts from `initial` every time.
 */
export function TemplateDetailsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  intro: string;
  submitLabel: string;
  initial: TemplateDetails;
  appraisalTypes: CatalogOption[];
  propertyTypes: CatalogOption[];
  /** Answers whether it saved; the dialog closes then. */
  onSubmit: (details: TemplateDetails) => Promise<boolean>;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        {props.open ? <DetailsForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DetailsForm(props: Parameters<typeof TemplateDetailsDialog>[0]) {
  const [name, setName] = useState(props.initial.name);
  const [description, setDescription] = useState(props.initial.description ?? "");
  const [appraisalTypeId, setAppraisalTypeId] = useState(String(props.initial.appraisalTypeId));
  const [propertyTypeId, setPropertyTypeId] = useState(props.initial.propertyTypeId === null ? "" : String(props.initial.propertyTypeId));
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !appraisalTypeId) return;
    setBusy(true);
    const saved = await props.onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      appraisalTypeId: Number(appraisalTypeId),
      propertyTypeId: propertyTypeId ? Number(propertyTypeId) : null,
    });
    setBusy(false);
    if (saved) props.onOpenChange(false);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
        <DialogDescription>{props.intro}</DialogDescription>
      </DialogHeader>
      <form className="grid gap-4" onSubmit={(event) => void submit(event)} data-template-details-form>
        <Field>
          <FieldLabel htmlFor="template-details-name">Nombre</FieldLabel>
          <Input id="template-details-name" value={name} maxLength={120} autoFocus required onChange={(event) => setName(event.target.value)} />
          <FieldDescription>No se repite en el despacho, sin importar mayúsculas ni acentos.</FieldDescription>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="template-details-appraisal-type">Tipo de avalúo</FieldLabel>
            <NativeSelect id="template-details-appraisal-type" className="w-full" value={appraisalTypeId} onChange={(event) => setAppraisalTypeId(event.target.value)}>
              {props.appraisalTypes.map((option) => <NativeSelectOption key={option.id} value={String(option.id)}>{option.label}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="template-details-property-type">Tipo de bien</FieldLabel>
            <NativeSelect id="template-details-property-type" className="w-full" value={propertyTypeId} onChange={(event) => setPropertyTypeId(event.target.value)}>
              <NativeSelectOption value="">Cualquier tipo de bien</NativeSelectOption>
              {props.propertyTypes.map((option) => <NativeSelectOption key={option.id} value={String(option.id)}>{option.label}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="template-details-description">Notas o descripción (opcional)</FieldLabel>
          <Textarea
            id="template-details-description"
            value={description}
            maxLength={500}
            rows={3}
            placeholder="Para qué avalúos es, qué secciones trae, qué falta completar…"
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => props.onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {props.submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
