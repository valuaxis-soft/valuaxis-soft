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

import { ImagePlus, Plus, Trash2 } from "lucide-react";

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

import { isMachineryPropertyKind } from "@/features/valuations/calculation/machinery-types";
import { formatDateValue } from "@/features/valuations/services/concept-value-format";
import {
  DEFAULT_COVER_IMAGE_SIZE,
  coverImagePannableAxes,
  coverImageStyle,
  normalizeCoverImageFocus,
  normalizeCoverImageSize,
  type CoverImageFocus,
  type CoverImageSize,
} from "@/features/valuations/services/cover-image-focus";
import {
  formatValidityMonths,
  MAX_VALIDITY_MONTHS,
  validUntilDate,
} from "@/features/valuations/services/valuation-signatures";

import { cn } from "@/lib/utils";

import { ValuationDateField } from "./valuation-date-field";
import {
  HEADER_EXTRA_LABEL_MAX,
  HEADER_EXTRA_VALUE_MAX,
  MAX_HEADER_EXTRA_FIELDS,
} from "@/features/valuations/services/caratula-company-header";
import type { HeaderExtraField } from "@/features/valuations/model";
import { UploadButton } from "./image-upload-control";
import { ImageFramingControl } from "./image-framing-control";

/** 1 to 12 whole months, at the appraiser's discretion. */
const VALIDITY_MONTH_OPTIONS = Array.from({ length: MAX_VALIDITY_MONTHS }, (_, index) => index + 1);

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
  const validUntil = validUntilDate(caratula.fechaAvaluo, caratula.mesesVigencia);

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
          <div className="min-w-0 md:col-span-6 xl:col-span-12">
            <HeaderExtraFieldsEditor
              fields={caratula.camposEncabezado ?? []}
              readOnly={readOnly}
              onChange={(camposEncabezado) => onUpdate({ camposEncabezado })}
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
            <Field>
              <FieldLabel htmlFor="caratula-vigencia">Vigencia</FieldLabel>
              <NativeSelect
                id="caratula-vigencia"
                className="w-full"
                disabled={readOnly}
                value={caratula.mesesVigencia === null ? "" : String(caratula.mesesVigencia)}
                onChange={(event) => onUpdate({ mesesVigencia: event.target.value ? Number(event.target.value) : null })}
              >
                {caratula.mesesVigencia === null ? <NativeSelectOption value="">Elige los meses</NativeSelectOption> : null}
                {VALIDITY_MONTH_OPTIONS.map((months) => (
                  <NativeSelectOption key={months} value={String(months)}>{formatValidityMonths(months)}</NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                {validUntil ? `Vigente hasta: ${formatDateValue(validUntil, "long")}.` : "Se cuenta desde la fecha del avalúo."}
              </FieldDescription>
            </Field>
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
            {isMachineryPropertyKind(meta.propertyKind) ? (
              // Machinery is chosen when the valuation is created: its panels and wordings depend on it.
              <NativeSelect className="w-full" disabled value={meta.propertyKind}>
                <NativeSelectOption value={meta.propertyKind}>Maquinaria y equipo</NativeSelectOption>
              </NativeSelect>
            ) : (
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
            )}
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
          focus={normalizeCoverImageFocus(caratula.enfoqueImagenPrincipal)}
          size={normalizeCoverImageSize(caratula.tamanoImagenPrincipal)}
          image={principalImage}
          onFocusChange={(enfoqueImagenPrincipal) => onUpdate({ enfoqueImagenPrincipal })}
          onSizeChange={(tamanoImagenPrincipal) => onUpdate({ tamanoImagenPrincipal })}
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
  focus,
  image,
  onFocusChange,
  onSizeChange,
  onUpload,
  readOnly,
  size,
  uploadAvailable,
  uploading,
}: {
  focus: CoverImageFocus;
  image: PrincipalCoverImage | null;
  onFocusChange: (focus: CoverImageFocus) => void;
  onSizeChange: (size: CoverImageSize) => void;
  size: CoverImageSize;
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
            <img
              className="h-full w-full object-cover"
              style={coverImageStyle(focus, size)}
              src={image.url}
              alt="Imagen principal del bien"
            />
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
      {image?.url ? (
        <div className="mt-3 border-t pt-3">
          <ImageFramingControl
            idPrefix="caratula-imagen"
            title="Encuadre en la carátula"
            description="Mueve la imagen dentro del recuadro de la portada."
            fitHint="Imagen completa muestra todo un vehículo o una máquina aunque la foto sea muy ancha o muy alta, sin fondo alrededor."
            focus={focus}
            size={size}
            defaultSize={DEFAULT_COVER_IMAGE_SIZE}
            imageUrl={image.url}
            pannableFor={coverImagePannableAxes}
            readOnly={readOnly}
            onFocusChange={onFocusChange}
            onSizeChange={onSizeChange}
          />
        </div>
      ) : null}
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

/**
 * Up to three short data of the appraiser's choice (RFC, cédula, sitio web…)
 * printed in the page header after the address, phone and email.
 */
function HeaderExtraFieldsEditor({
  fields,
  readOnly,
  onChange,
}: {
  fields: HeaderExtraField[];
  readOnly: boolean;
  onChange: (fields: HeaderExtraField[]) => void;
}) {
  const update = (index: number, patch: Partial<HeaderExtraField>) =>
    onChange(fields.map((field, position) => (position === index ? { ...field, ...patch } : field)));
  return (
    <div className="space-y-2" data-testid="header-extra-fields">
      <p className="text-xs text-muted-foreground">
        Datos adicionales del encabezado (hasta {MAX_HEADER_EXTRA_FIELDS}): un nombre corto y su valor, por ejemplo RFC, cédula o sitio web.
      </p>
      {fields.map((field, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-2">
          <Input
            aria-label={`Nombre del dato ${index + 1}`}
            maxLength={HEADER_EXTRA_LABEL_MAX}
            placeholder="Nombre (RFC, cédula…)"
            readOnly={readOnly}
            value={field.label}
            onChange={(event) => update(index, { label: event.target.value })}
          />
          <Input
            aria-label={`Valor del dato ${index + 1}`}
            maxLength={HEADER_EXTRA_VALUE_MAX}
            placeholder="Valor"
            readOnly={readOnly}
            value={field.value}
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Quitar el dato ${index + 1}`}
            disabled={readOnly}
            onClick={() => onChange(fields.filter((_, position) => position !== index))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {!readOnly && fields.length < MAX_HEADER_EXTRA_FIELDS ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...fields, { label: "", value: "" }])}>
          <Plus data-icon="inline-start" />
          Dato del encabezado
        </Button>
      ) : null}
    </div>
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