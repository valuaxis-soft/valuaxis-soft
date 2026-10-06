"use client";

import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, X } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { UploadButton } from "./image-upload-control";
import {
  emptySignature,
  MAX_SIGNATURES,
  signatureErrors,
  type ValuationSignature,
} from "@/features/valuations/services/valuation-signatures";

/**
 * Who signs: one row per signature with name, cédula profesional, an optional
 * title and an optional scanned signature that prints over the line. Rows are
 * added, removed and reordered; they print in this order.
 */
export function SignaturesEditor({
  description,
  idPrefix,
  onChange,
  readOnly,
  signatures,
  title = "Firmas",
}: {
  description: string;
  idPrefix: string;
  onChange: (signatures: ValuationSignature[]) => void;
  readOnly: boolean;
  signatures: ValuationSignature[];
  title?: string;
}) {
  const update = (index: number, patch: Partial<ValuationSignature>) =>
    onChange(signatures.map((signature, position) => (position === index ? { ...signature, ...patch } : signature)));
  const move = (index: number, offset: -1 | 1) => {
    const next = [...signatures];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };
  const full = signatures.length >= MAX_SIGNATURES;
  const [uploading, setUploading] = useState<number | null>(null);
  const uploadImage = async (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(index);
    try {
      const uploaded = await api.uploads.create(file);
      if (!uploaded.url) throw new Error("No se recibió la imagen.");
      update(index, { image: uploaded.url });
    } catch (error) {
      toast.error(`No se pudo subir la firma: ${error instanceof Error ? error.message : "Error desconocido"}`);
    } finally {
      setUploading(null);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div>
        <FieldTitle>{title}</FieldTitle>
        <FieldDescription>{description}</FieldDescription>
      </div>
      {signatures.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Sin firmas. Agrega a quien firma con su cédula profesional; la cédula se exige para concluir el avalúo.</p>
      ) : null}
      {signatures.map((signature, index) => {
        const errors = signatureErrors(signature);
        const id = `${idPrefix}-${index}`;
        return (
          // Rows have no identity of their own: the position is the key.
          <div className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] md:items-start" key={index}>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor={`${id}-name`}>Nombre de quien firma</FieldLabel>
              <Input id={`${id}-name`} aria-invalid={Boolean(errors.name)} disabled={readOnly} value={signature.name} maxLength={180}
                placeholder="Ing. Nombre Apellido" onChange={(event) => update(index, { name: event.target.value })} />
              {errors.name ? <FieldError>{errors.name}</FieldError> : null}
            </Field>
            <Field data-invalid={Boolean(errors.cedula)}>
              <FieldLabel htmlFor={`${id}-cedula`}>Cédula profesional</FieldLabel>
              <Input id={`${id}-cedula`} aria-invalid={Boolean(errors.cedula)} disabled={readOnly} value={signature.cedula} maxLength={60}
                onChange={(event) => update(index, { cedula: event.target.value })} />
              {errors.cedula ? <FieldError>{errors.cedula}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-role`}>Cargo (opcional)</FieldLabel>
              <Input id={`${id}-role`} disabled={readOnly} value={signature.role} maxLength={120} placeholder="Perito valuador"
                onChange={(event) => update(index, { role: event.target.value })} />
            </Field>
            <div className="flex gap-1 md:pt-6">
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Mover la firma ${index + 1} arriba`} title="Mover arriba"
                disabled={readOnly || index === 0} onClick={() => move(index, -1)}>
                <ArrowUp />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Mover la firma ${index + 1} abajo`} title="Mover abajo"
                disabled={readOnly || index === signatures.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Quitar firma ${index + 1}`} title="Quitar"
                disabled={readOnly} onClick={() => onChange(signatures.filter((_, position) => position !== index))}>
                <Trash2 />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 md:col-span-4">
              {signature.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signature.image} alt={`Firma de ${signature.name || `la firma ${index + 1}`}`} className="h-12 max-w-48 rounded border bg-white object-contain p-1" />
              ) : null}
              {uploading === index ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Subiendo la firma" /> : null}
              <UploadButton
                accept="image/png,image/jpeg,image/webp"
                disabled={readOnly || uploading !== null}
                label={signature.image ? "Cambiar imagen de la firma" : "Subir imagen de la firma"}
                onChange={(event) => void uploadImage(index, event)}
              />
              {signature.image && !readOnly ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => update(index, { image: undefined })}>
                  <X /> Quitar imagen
                </Button>
              ) : null}
              {!signature.image ? (
                <FieldDescription>Opcional. Foto o escaneo de la firma sobre fondo blanco; se imprime sobre la línea.</FieldDescription>
              ) : null}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="outline" disabled={readOnly || full} onClick={() => onChange([...signatures, emptySignature()])}>
          <Plus /> Agregar firma
        </Button>
        {full ? <FieldDescription>Máximo {MAX_SIGNATURES} firmas.</FieldDescription> : null}
      </div>
    </section>
  );
}
