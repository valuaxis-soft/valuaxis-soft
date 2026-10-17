"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ComparableFormValues } from "@/lib/api-client";
import type { ComparablePrefill } from "@/features/ai/listing-prefill";
import { parseDecimal } from "@/features/valuations/calculation/free-formula";
import {
  NUMERIC_CHARACTERISTICS,
  characteristicText,
  isBuiltinCharacteristic,
  withCharacteristic,
  type CharacteristicField,
  type ComparableDto,
  type ComparableType,
} from "@/features/valuations/calculation/market-types";

const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

type Draft = Record<"location" | "area" | "price" | "sourceName" | "contactName" | "contactPhone" | "url" | "offerDate" | "landUse", string>;

/** Area and price are captured at the top of the form; the list of characteristics shows the rest. */
const TOP_FIELDS = new Set(["area", "price"]);

function initialDraft(comparable: ComparableDto | null, prefill: ComparablePrefill = {}): Draft {
  return {
    location: comparable?.location ?? "",
    area: text(comparable?.area),
    price: text(comparable?.price),
    sourceName: comparable?.sourceName ?? "",
    contactName: comparable?.contactName ?? "",
    contactPhone: comparable?.contactPhone ?? "",
    url: comparable?.url ?? "",
    offerDate: comparable?.offerDate ?? "",
    landUse: comparable?.landUse ?? "",
    // A new comparable may start from the data read from a pasted listing.
    ...(comparable ? {} : pick(prefill, ["location", "area", "price", "sourceName", "contactName", "contactPhone", "url", "offerDate", "landUse"])),
  };
}

function pick(prefill: ComparablePrefill, keys: Array<keyof Draft>): Partial<Draft> {
  return Object.fromEntries(keys.flatMap((key) => (key in prefill ? [[key, prefill[key as keyof ComparablePrefill] ?? ""]] : [])));
}

/** The characteristics as the form shows them, by field key; a pasted listing may fill some. */
function initialCharacteristics(comparable: ComparableDto | null, fields: CharacteristicField[], prefill: ComparablePrefill = {}) {
  const values = Object.fromEntries(fields.map((field) => [field.key, comparable ? characteristicText(comparable, field.key) : ""]));
  if (comparable) return values;
  for (const key of ["frontage", "depth", "topography", "services"] as const) {
    if (prefill[key] !== undefined && key in values) values[key] = prefill[key] ?? "";
  }
  return values;
}

const EMPTY_VALUES: ComparableFormValues = {
  location: "", area: null, price: null, landUse: null, landUseKey: null, shape: null, zone: null, frontCount: null, frontage: null,
  depth: null, topography: null, services: null, conservation: null, quality: null, notes: null, extra: {}, characteristicsText: null,
  sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null, factors: [],
};

/**
 * The data of one comparable: where it is, its offer, its characteristics
 * (the fields of the market's list) and its photos. Its homologation factors
 * are captured in the homologation table of the panel, and kept here as they are.
 */
export function ComparableDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comparable: ComparableDto | null;
  /** Values a new comparable opens with; nothing is saved until the appraiser saves. */
  prefill?: ComparablePrefill;
  characteristicFields: CharacteristicField[];
  comparableType: ComparableType;
  unitLabel: string;
  readOnly: boolean;
  onSubmit: (values: ComparableFormValues) => Promise<boolean>;
  onUploadPhoto: (file: File) => Promise<void>;
  onRemovePhoto: (photoId: string) => Promise<void>;
}) {
  const { comparable, readOnly } = props;
  const fields = props.characteristicFields.filter((field) => !TOP_FIELDS.has(field.key));
  const [draft, setDraft] = useState<Draft>(() => initialDraft(comparable, props.prefill));
  const [characteristics, setCharacteristics] = useState<Record<string, string>>(() =>
    initialCharacteristics(comparable, fields, props.prefill));
  const [freeText, setFreeText] = useState(comparable?.characteristicsText ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof Draft) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.location.trim()) {
      setError("Captura la ubicación del comparable.");
      return;
    }
    const frontCount = characteristics.frontCount?.trim() ? parseDecimal(characteristics.frontCount) : null;
    if (frontCount !== null && (!Number.isInteger(frontCount) || frontCount < 1)) {
      setError("El número de frentes debe ser un entero de 1 en adelante, o quedar vacío.");
      return;
    }
    setError(null);
    setSaving(true);
    // What is not in the form (the factors, characteristics out of the list) stays as stored.
    const { id: _id, reference: _reference, photos: _photos, ...stored } = comparable ?? { ...EMPTY_VALUES, id: "", reference: 0, photos: [] };
    let values: ComparableFormValues = {
      ...stored,
      location: draft.location.trim(),
      area: parseDecimal(draft.area),
      price: parseDecimal(draft.price),
      sourceName: draft.sourceName.trim() || null,
      contactName: draft.contactName.trim() || null,
      contactPhone: draft.contactPhone.trim() || null,
      url: draft.url.trim() || null,
      offerDate: draft.offerDate || null,
      landUse: draft.landUse.trim() || null,
      characteristicsText: freeText.trim() || null,
    };
    for (const field of fields) {
      const typed = characteristics[field.key] ?? "";
      values = withCharacteristic(values, field.key, typed, NUMERIC_CHARACTERISTICS.has(field.key) ? parseDecimal(typed) : null);
    }
    const ok = await props.onSubmit(values);
    setSaving(false);
    if (ok) props.onOpenChange(false);
  };

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    await props.onUploadPhoto(file);
    setUploading(false);
  };

  const area = parseDecimal(draft.area);
  const price = parseDecimal(draft.price);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{comparable ? `Comparable ${comparable.reference}` : "Nuevo comparable"}</DialogTitle>
          <DialogDescription>
            En cualquier campo numérico puedes escribir un cálculo empezando con el signo igual, por ejemplo =5*10000. Los factores de
            homologación se capturan en la tabla de homologación del panel.
            {!comparable && props.prefill ? " Los datos vienen del anuncio que pegaste: revísalos antes de guardar." : null}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-5" onSubmit={submit}>
          <fieldset disabled={readOnly || saving} className="grid gap-5">
            <FieldGroup className="grid gap-3 sm:grid-cols-6">
              <Field className="sm:col-span-6">
                <FieldLabel htmlFor="comparable-location">Ubicación</FieldLabel>
                <Input id="comparable-location" value={draft.location} onChange={set("location")} required />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="comparable-area">Superficie (m²)</FieldLabel>
                <Input id="comparable-area" inputMode="decimal" value={draft.area} onChange={set("area")} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="comparable-price">{props.unitLabel}</FieldLabel>
                <Input id="comparable-price" inputMode="decimal" value={draft.price} onChange={set("price")} />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel>Valor unitario</FieldLabel>
                <p className="flex h-8 items-center text-sm text-muted-foreground">
                  {area && price ? `${(price / area).toLocaleString("es-MX", { style: "currency", currency: "MXN" })} /m²` : "—"}
                </p>
              </Field>
            </FieldGroup>

            <FieldGroup className="grid gap-3 sm:grid-cols-4">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="comparable-source">Fuente</FieldLabel>
                <Input id="comparable-source" placeholder="Inmobiliaria, portal o anuncio" value={draft.sourceName} onChange={set("sourceName")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="comparable-contact">Contacto</FieldLabel>
                <Input id="comparable-contact" value={draft.contactName} onChange={set("contactName")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="comparable-phone">Teléfono</FieldLabel>
                <Input id="comparable-phone" inputMode="tel" value={draft.contactPhone} onChange={set("contactPhone")} />
              </Field>
              <Field className="sm:col-span-3">
                <FieldLabel htmlFor="comparable-url">Liga del anuncio</FieldLabel>
                <Input id="comparable-url" type="url" placeholder="https://" value={draft.url} onChange={set("url")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="comparable-date">Fecha de la oferta</FieldLabel>
                <Input id="comparable-date" type="date" value={draft.offerDate} onChange={set("offerDate")} />
              </Field>
            </FieldGroup>

            <section className="grid gap-3">
              <h3 className="text-sm font-medium">Características</h3>
              <FieldGroup className="grid gap-3 sm:grid-cols-4">
                <Field className="sm:col-span-4">
                  <FieldLabel htmlFor="comparable-landUse">Uso de suelo (descripción, columna del dictamen)</FieldLabel>
                  <Input id="comparable-landUse" value={draft.landUse} onChange={set("landUse")} />
                </Field>
                {fields.map((field) => {
                  const id = `comparable-${field.key.replace(":", "-")}`;
                  const long = field.key === "notes" || field.key === "services" || !isBuiltinCharacteristic(field.key);
                  return (
                    <Field key={field.key} className={long ? "sm:col-span-2" : undefined}>
                      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
                      <Input
                        id={id}
                        inputMode={NUMERIC_CHARACTERISTICS.has(field.key) ? "decimal" : undefined}
                        value={characteristics[field.key] ?? ""}
                        onChange={(event) => setCharacteristics((current) => ({ ...current, [field.key]: event.target.value }))}
                      />
                    </Field>
                  );
                })}
                <Field className="sm:col-span-4">
                  <FieldLabel htmlFor="comparable-characteristics-text">Texto libre de características (opcional)</FieldLabel>
                  <Textarea
                    id="comparable-characteristics-text"
                    rows={2}
                    placeholder="Si lo escribes, el dictamen lo imprime en lugar de la línea de características."
                    value={freeText}
                    onChange={(event) => setFreeText(event.target.value)}
                  />
                </Field>
              </FieldGroup>
            </section>
          </fieldset>

          {comparable ? (
            <section className="grid gap-2">
              <h3 className="text-sm font-medium">Fotografías</h3>
              <div className="flex flex-wrap gap-2">
                {comparable.photos.map((photo) => (
                  <figure key={photo.id} className="relative size-24 overflow-hidden rounded-md border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={photo.title} className="size-full object-cover" />
                    {!readOnly ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="secondary"
                        className="absolute top-1 right-1"
                        aria-label={`Quitar ${photo.title}`}
                        onClick={() => void props.onRemovePhoto(photo.id)}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </figure>
                ))}
                {!readOnly ? (
                  <label className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted">
                    {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                    Agregar
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={uploadPhoto} disabled={uploading} />
                  </label>
                ) : null}
              </div>
            </section>
          ) : (
            <p className="text-xs text-muted-foreground">Guarda el comparable para agregar fotografías.</p>
          )}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              {readOnly ? "Cerrar" : "Cancelar"}
            </Button>
            {!readOnly ? (
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                Guardar comparable
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
