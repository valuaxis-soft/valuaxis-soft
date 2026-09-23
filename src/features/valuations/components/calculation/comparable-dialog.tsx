"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ComparableFormValues } from "@/lib/api-client";
import type { ComparableDto, ComparableFactorDto, FactorSlotConfig } from "@/features/valuations/calculation/market-types";

/** "1,260,000.50" or "$ 9000" → number; empty → null. */
export function parseDecimal(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

type FactorDraft = { subject: string; comparable: string };
type Draft = Record<"location" | "area" | "price" | "sourceName" | "contactName" | "contactPhone" | "url" | "offerDate"
  | "landUse" | "shape" | "zone" | "frontage" | "depth" | "topography" | "services" | "notes", string>;

function initialDraft(comparable: ComparableDto | null): Draft {
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
    shape: comparable?.shape ?? "",
    zone: comparable?.zone ?? "",
    frontage: text(comparable?.frontage),
    depth: text(comparable?.depth),
    topography: comparable?.topography ?? "",
    services: comparable?.services ?? "",
    notes: comparable?.notes ?? "",
  };
}

/** A factor is captured as subject rating / comparable rating; a direct value is its own subject rating. */
function initialFactors(comparable: ComparableDto | null, slots: FactorSlotConfig[]): Record<string, FactorDraft> {
  return Object.fromEntries(slots.filter((slot) => slot.type !== "SUPERFICIE").map((slot) => {
    const factor = comparable?.factors.find((item) => item.type === slot.type);
    if (factor?.subjectRating && factor.comparableRating) {
      return [slot.type, { subject: String(factor.subjectRating), comparable: String(factor.comparableRating) }];
    }
    return [slot.type, { subject: text(factor?.value), comparable: factor?.value ? "1" : "" }];
  }));
}

function factorValue(draft: FactorDraft) {
  const subject = parseDecimal(draft.subject);
  const comparable = parseDecimal(draft.comparable);
  if (subject === null && comparable === null) return 1;
  return (subject ?? 1) / (comparable ?? 1);
}

export function ComparableDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comparable: ComparableDto | null;
  factorSlots: FactorSlotConfig[];
  unitLabel: string;
  readOnly: boolean;
  onSubmit: (values: ComparableFormValues) => Promise<boolean>;
  onUploadPhoto: (file: File) => Promise<void>;
  onRemovePhoto: (photoId: string) => Promise<void>;
}) {
  const { comparable, factorSlots, readOnly } = props;
  const [draft, setDraft] = useState<Draft>(() => initialDraft(comparable));
  const [factors, setFactors] = useState(() => initialFactors(comparable, factorSlots));
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
    setError(null);
    setSaving(true);
    const capturedFactors: ComparableFactorDto[] = Object.entries(factors).map(([type, value]) => {
      const subject = parseDecimal(value.subject);
      const comparableRating = parseDecimal(value.comparable);
      return {
        type: type as ComparableFactorDto["type"],
        value: factorValue(value),
        subjectRating: subject && comparableRating ? subject : null,
        comparableRating: subject && comparableRating ? comparableRating : null,
        justification: null,
      };
    });
    const ok = await props.onSubmit({
      location: draft.location.trim(),
      area: parseDecimal(draft.area),
      price: parseDecimal(draft.price),
      sourceName: draft.sourceName.trim() || null,
      contactName: draft.contactName.trim() || null,
      contactPhone: draft.contactPhone.trim() || null,
      url: draft.url.trim() || null,
      offerDate: draft.offerDate || null,
      landUse: draft.landUse.trim() || null,
      shape: draft.shape.trim() || null,
      zone: draft.zone.trim() || null,
      frontage: parseDecimal(draft.frontage),
      depth: parseDecimal(draft.depth),
      topography: draft.topography.trim() || null,
      services: draft.services.trim() || null,
      notes: draft.notes.trim() || null,
      factors: capturedFactors,
    });
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
            Los factores se capturan como calificación del sujeto entre calificación del comparable, igual que en el Excel (=1/1.15).
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

            <FieldGroup className="grid gap-3 sm:grid-cols-4">
              {([
                ["landUse", "Uso de suelo"], ["zone", "Zona"], ["shape", "Forma"], ["topography", "Topografía"],
                ["frontage", "Frente (m)"], ["depth", "Fondo (m)"], ["services", "Servicios"],
              ] as const).map(([key, label]) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`comparable-${key}`}>{label}</FieldLabel>
                  <Input id={`comparable-${key}`} value={draft[key]} onChange={set(key)} />
                </Field>
              ))}
              <Field className="sm:col-span-4">
                <FieldLabel htmlFor="comparable-notes">Observaciones</FieldLabel>
                <Textarea id="comparable-notes" rows={2} value={draft.notes} onChange={set("notes")} />
              </Field>
            </FieldGroup>

            <section className="grid gap-2">
              <h3 className="text-sm font-medium">Factores de homologación</h3>
              <div className="grid gap-2">
                {factorSlots.filter((slot) => slot.type !== "SUPERFICIE").map((slot) => {
                  const value = factors[slot.type] ?? { subject: "", comparable: "" };
                  const update = (key: keyof FactorDraft) => (event: ChangeEvent<HTMLInputElement>) =>
                    setFactors((current) => ({ ...current, [slot.type]: { ...value, [key]: event.target.value } }));
                  return (
                    <div key={slot.type} className="grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_4.5rem] items-center gap-2 text-sm">
                      <span className="truncate">{slot.label}</span>
                      <Input aria-label={`${slot.label}: calificación del sujeto`} inputMode="decimal" placeholder="Sujeto" value={value.subject} onChange={update("subject")} />
                      <Input aria-label={`${slot.label}: calificación del comparable`} inputMode="decimal" placeholder="Comp." value={value.comparable} onChange={update("comparable")} />
                      <span className="text-right tabular-nums text-muted-foreground">{factorValue(value).toFixed(4)}</span>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">El factor de superficie lo calcula el sistema con la potencia n.</p>
              </div>
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
