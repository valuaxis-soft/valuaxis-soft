"use client";

import React, { type ChangeEvent } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

import { ImagePlus, Trash2 } from "lucide-react";

import type {
  CaratulaFormData,
  ImageContent,
  PrincipalCoverImage,
  ValuationMeta,
} from "@/features/valuations/model";

import {
  formatMexicanPhone,
  sanitizePostalCode,
  validateCaratula,
} from "@/features/valuations/services/caratula-validation";

import { cn } from "@/lib/utils";

import { ValuationDateField } from "./valuation-date-field";
import { UploadButton } from "./image-upload-control";

export function CaratulaEditor({
  caratula,
  meta,
  onUpdate,
  onUpdateMeta,
  readOnly,
  headerImage,
  headerImageUploading,
  onHeaderImageRemove,
  onHeaderImageUpload,
  principalImage,
  imageUploadAvailable,
  imageUploading,
  onImageUpload,
}: {
  caratula: CaratulaFormData;
  meta: ValuationMeta;
  onUpdate: (patch: Partial<CaratulaFormData>) => void;
  onUpdateMeta: (patch: Partial<ValuationMeta>) => void;
  readOnly: boolean;
  headerImage: ImageContent | null;
  headerImageUploading: boolean;
  onHeaderImageRemove?: () => void;
  onHeaderImageUpload?: (event: ChangeEvent<HTMLInputElement>) => void;
  principalImage: PrincipalCoverImage | null;
  imageUploadAvailable: boolean;
  imageUploading: boolean;
  onImageUpload?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const errors = validateCaratula(caratula, meta);

  return (
    <div className="mb-5 space-y-4">
      <section className="rounded-lg border bg-muted/20 p-4">
        <FieldTitle>Encabezado del documento</FieldTitle>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-6 xl:grid-cols-12">
          <div className="min-w-0 md:col-span-6 xl:col-span-6">
            <CaratulaField
              label="Dirección del encabezado"
            value={caratula.direccionEmpresa}
            readOnly={readOnly}
              onChange={(direccionEmpresa) => onUpdate({ direccionEmpresa })}
            />
          </div>
          <div className="min-w-0 md:col-span-3 xl:col-span-2">
            <CaratulaField
              error={errors.telefonoEmpresa}
            inputMode="numeric"
            label="Teléfono"
            type="tel"
            value={formatMexicanPhone(caratula.telefonoEmpresa)}
            readOnly={readOnly}
            onChange={(telefonoEmpresa) => onUpdate({ telefonoEmpresa: formatMexicanPhone(telefonoEmpresa) })}
              onBlur={(telefonoEmpresa) => onUpdate({ telefonoEmpresa: formatMexicanPhone(telefonoEmpresa) })}
            />
          </div>
          <div className="min-w-0 md:col-span-3 xl:col-span-4">
            <CaratulaField
              error={errors.correoEmpresa}
            label="Correo"
            type="email"
            value={caratula.correoEmpresa}
            readOnly={readOnly}
              onChange={(correoEmpresa) => onUpdate({ correoEmpresa })}
            />
          </div>
          <div className="min-w-0 md:col-span-3 xl:col-span-4">
            <ValuationDateField
              label="Fecha del avalúo"
            value={caratula.fechaAvaluo}
            readOnly={readOnly}
              onChange={(fechaAvaluo) => onUpdate({ fechaAvaluo })}
            />
          </div>
          <div className="min-w-0 md:col-span-3 xl:col-span-4">
            <ValuationDateField
              label="Vigencia"
            value={caratula.fechaVigencia}
            readOnly={readOnly}
              onChange={(fechaVigencia) => onUpdate({ fechaVigencia })}
            />
          </div>
          <div className="min-w-0 md:col-span-3 xl:col-span-4">
            <CaratulaField
              error={errors.folio}
            label="Folio"
            value={caratula.folio}
            readOnly={readOnly}
              onChange={(folio) => onUpdate({ folio })}
            />
          </div>
          <div className="min-w-0 md:col-span-6 xl:col-span-12">
            <DocumentHeaderImageEditor
              image={headerImage}
              readOnly={readOnly}
              uploading={headerImageUploading}
              onRemove={onHeaderImageRemove}
              onUpload={onHeaderImageUpload}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-muted/20 p-4">
        <FieldTitle>Datos del avalúo / Carátula</FieldTitle>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-6 xl:grid-cols-12">
          <div className="min-w-0 md:col-span-6 xl:col-span-6">
            <CaratulaField
              error={errors.tituloInmueble}
            label="Título del bien"
            value={caratula.tituloInmueble}
            readOnly={readOnly}
              onChange={(tituloInmueble) => onUpdate({ tituloInmueble })}
            />
          </div>
          <div className="min-w-0 md:col-span-6 xl:col-span-6">
            <CaratulaField
              error={errors.location}
            label="Ubicación del bien"
            value={meta.location}
            readOnly={readOnly}
              onChange={(location) => onUpdateMeta({ location })}
            />
          </div>
          <div className="min-w-0 md:col-span-3 xl:col-span-2">
            <CaratulaField
              error={errors.postalCode}
            inputMode="numeric"
            label="Código postal"
            value={meta.postalCode}
            readOnly={readOnly}
              onChange={(postalCode) => onUpdateMeta({ postalCode: sanitizePostalCode(postalCode) })}
            />
          </div>
          <div className="min-w-0 md:col-span-3 xl:col-span-3">
            <Field>
              <FieldLabel>Tipo de bien</FieldLabel>
            <NativeSelect
              className="w-full"
              disabled={readOnly}
              value={meta.propertyKind}
              onChange={(event) => onUpdateMeta({ propertyKind: event.target.value as ValuationMeta["propertyKind"] })}
            >
              <NativeSelectOption value="casa">Casa</NativeSelectOption>
              <NativeSelectOption value="departamento">Departamento</NativeSelectOption>
              <NativeSelectOption value="oficina">Oficina</NativeSelectOption>
                <NativeSelectOption value="terreno">Terreno</NativeSelectOption>
              </NativeSelect>
            </Field>
          </div>
          <div className="min-w-0 md:col-span-3 xl:col-span-3">
            <Field>
              <FieldLabel>Tipo de avalúo</FieldLabel>
            <NativeSelect
              className="w-full"
              disabled={readOnly}
              value={meta.valuationKind}
              onChange={(event) => onUpdateMeta({ valuationKind: event.target.value as ValuationMeta["valuationKind"] })}
            >
              <NativeSelectOption value="venta">Venta</NativeSelectOption>
              <NativeSelectOption value="renta">Renta</NativeSelectOption>
                <NativeSelectOption value="ambos">Venta y renta</NativeSelectOption>
              </NativeSelect>
            </Field>
          </div>
        </div>
        <PrincipalImageEditor
          image={principalImage}
          readOnly={readOnly}
          uploadAvailable={imageUploadAvailable}
          uploading={imageUploading}
          onUpload={onImageUpload}
        />
      </section>

    </div>
  );
}

function PrincipalImageEditor({
  image,
  onUpload,
  readOnly,
  uploadAvailable,
  uploading,
}: {
  image: PrincipalCoverImage | null;
  onUpload?: (event: ChangeEvent<HTMLInputElement>) => void;
  readOnly: boolean;
  uploadAvailable: boolean;
  uploading: boolean;
}) {
  const disabled = readOnly || !uploadAvailable || uploading || !onUpload;
  return (
    <div className="mt-4 rounded-lg border bg-background p-3">
      <div className="grid gap-3 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-center">
        <div className="flex h-24 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
          {image?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="h-full w-full object-cover" src={image.url} alt="Imagen principal del bien" />
          ) : (
            <ImagePlus className="size-7" />
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <div>
            <FieldTitle>Imagen principal</FieldTitle>
            <FieldDescription>
              {image
                ? image.filename
                : uploadAvailable
                  ? "Selecciona la imagen que aparecerá en la Carátula."
                  : "Guarda primero el avalúo para subir su imagen principal."}
            </FieldDescription>
          </div>
          <label
            aria-disabled={disabled}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              disabled && "pointer-events-none opacity-50",
            )}
          >
            <ImagePlus />
            {uploading ? "Subiendo…" : image ? "Reemplazar imagen" : "Subir imagen principal"}
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={disabled}
              onChange={onUpload}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function DocumentHeaderImageEditor({
  image,
  onRemove,
  onUpload,
  readOnly,
  uploading,
}: {
  image: ImageContent | null;
  onRemove?: () => void;
  onUpload?: (event: ChangeEvent<HTMLInputElement>) => void;
  readOnly: boolean;
  uploading: boolean;
}) {
  const uploadDisabled = readOnly || uploading || !onUpload;

  return (
    <div className="rounded-lg border border-muted-foreground/20 bg-muted/50 p-3">
      <div className="grid gap-3 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center">
        <div className="flex h-14 w-18 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
          {image?.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="max-h-full max-w-full object-contain" src={image.src} alt={image.title || "Imagen del encabezado"} />
          ) : (
            <ImagePlus className="size-5" />
          )}
        </div>
        <div className="min-w-0">
          <FieldLabel>Imagen del encabezado</FieldLabel>
          <FieldDescription className="truncate">
            {image?.title || "Imagen opcional para el encabezado del documento."}
          </FieldDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <UploadButton
            accept="image/png,image/jpeg,image/webp"
            disabled={uploadDisabled}
            label={uploading ? "Subiendo…" : image ? "Reemplazar imagen" : "Agregar imagen"}
            onChange={onUpload ?? (() => undefined)}
          />
          {image ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Quitar imagen del encabezado"
              title="Quitar imagen del encabezado"
              disabled={readOnly || !onRemove}
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CalculatedValuesEditor({
  caratula,
  onUpdate,
  readOnly,
}: {
  caratula: CaratulaFormData;
  onUpdate: (patch: Partial<CaratulaFormData>) => void;
  readOnly: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <CaratulaField
          description="Este valor será calculado automáticamente por el sistema."
          inputReadOnly
          label="Valor total"
          value={caratula.valorTotal}
          readOnly={readOnly}
          onChange={(valorTotal) => onUpdate({ valorTotal })}
        />
        <CaratulaField
          description="Este valor será calculado automáticamente por el sistema."
          inputReadOnly
          label="Valor con letra"
          value={caratula.valorConLetra}
          readOnly={readOnly}
          onChange={(valorConLetra) => onUpdate({ valorConLetra })}
        />
      </div>
    </div>
  );
}

export function ValuerCompanyEditor({
  caratula,
  onUpdate,
  readOnly,
}: {
  caratula: CaratulaFormData;
  onUpdate: (patch: Partial<CaratulaFormData>) => void;
  readOnly: boolean;
}) {
  return (
    <section className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <FieldTitle>Datos de empresa valuadora</FieldTitle>
      <div className="grid gap-3 md:grid-cols-2">
        <CaratulaField
          label="Valuador"
          value={caratula.valuador}
          readOnly={readOnly}
          onChange={(valuador) => onUpdate({ valuador })}
        />
        <CaratulaField
          label="Registro valuador"
          value={caratula.registroValuador}
          readOnly={readOnly}
          onChange={(registroValuador) => onUpdate({ registroValuador })}
        />
      </div>
    </section>
  );
}

function CaratulaField({
  description,
  error,
  inputMode,
  inputReadOnly = false,
  label,
  onBlur,
  onChange,
  readOnly,
  type = "text",
  value,
}: {
  description?: string;
  error?: string;
  inputMode?: React.ComponentProps<"input">["inputMode"];
  inputReadOnly?: boolean;
  label: string;
  onBlur?: (value: string) => void;
  onChange: (value: string) => void;
  readOnly: boolean;
  type?: string;
  value: string;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel>{label}</FieldLabel>
      <Input
        aria-invalid={Boolean(error)}
        disabled={readOnly}
        inputMode={inputMode}
        readOnly={inputReadOnly}
        type={type}
        value={value}
        onBlur={() => onBlur?.(value)}
        onChange={(event) => onChange(event.target.value)}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}