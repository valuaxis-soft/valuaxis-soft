"use client";

/**
 * «Datos de la máquina o equipo» of the comparable's sheet: what the MEH book
 * captures of each offer (comparable-machinery.ts), in the cells of the same
 * sheet the card shows. The valuer says whether the machine has a horómetro
 * (hours) or an odómetro (km).
 */
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  METER_KINDS,
  METER_KIND_LABELS,
  machineryDetailsOf,
  type ComparableMachineryDetails,
  type MeterKind,
} from "@/features/valuations/calculation/comparable-machinery";
import { SheetFieldTable, SheetSection, type SheetField } from "./comparable-sheet";

const TEXT_FIELDS = ["brand", "model", "serial", "capacity", "condition", "operatingState", "maintenance", "attachments", "origin"] as const;
type TextField = (typeof TEXT_FIELDS)[number];

export type MachineryDraft = Record<TextField | "year" | "meterReading" | "freight", string> & { meterKind: MeterKind | "" };

export function machineryDraftOf(details: ComparableMachineryDetails | null | undefined): MachineryDraft {
  const data = details ?? {};
  return {
    ...Object.fromEntries(TEXT_FIELDS.map((key) => [key, data[key] ?? ""])) as Record<TextField, string>,
    year: data.year ? String(data.year) : "",
    meterKind: data.meterKind ?? "",
    meterReading: data.meterReading === null || data.meterReading === undefined ? "" : String(data.meterReading),
    freight: data.freight === null || data.freight === undefined ? "" : String(data.freight),
  };
}

const numberOf = (text: string) => {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : Number.NaN;
};

/** The machine's data to save, or which field to correct. */
export function machineryDetailsFromDraft(draft: MachineryDraft): { details: ComparableMachineryDetails | null } | { error: string; field: string } {
  const year = numberOf(draft.year);
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) return { field: "machinery-year", error: `El año «${draft.year}» va en cuatro dígitos, como 2018.` };
  const meterReading = numberOf(draft.meterReading);
  if (meterReading !== null && (Number.isNaN(meterReading) || meterReading < 0)) return { field: "machinery-meter", error: `La lectura «${draft.meterReading}» es un número de horas o de km.` };
  const freight = numberOf(draft.freight);
  if (freight !== null && (Number.isNaN(freight) || freight < 0)) return { field: "machinery-freight", error: `El flete «${draft.freight}» es un importe, como 25000.` };
  return {
    details: machineryDetailsOf({
      ...Object.fromEntries(TEXT_FIELDS.map((key) => [key, draft[key].trim() || null])),
      year,
      meterKind: draft.meterKind || null,
      meterReading,
      freight,
    }),
  };
}

const LABELS: Record<TextField, { label: string; placeholder: string }> = {
  brand: { label: "Marca", placeholder: "Caterpillar" },
  model: { label: "Modelo", placeholder: "420F" },
  serial: { label: "Número de serie", placeholder: "Del chasis o de la placa" },
  capacity: { label: "Capacidad / potencia", placeholder: "101 HP (75 kW)" },
  condition: { label: "Conservación", placeholder: "Bueno, excelente, regular…" },
  operatingState: { label: "Estado operativo", placeholder: "Activo, inactivo" },
  maintenance: { label: "Mantenimiento", placeholder: "Preventivo, correctivo…" },
  attachments: { label: "Aditamentos", placeholder: "Cucharón frontal, rotomartillo…" },
  origin: { label: "Procedencia", placeholder: "Estados Unidos" },
};

export function MachineryDetailsFields({
  draft,
  onChange,
  invalidField,
  autoComplete,
}: {
  /** The form's `autocomplete` that keeps Chrome's suggestions out (comparable-dialog.tsx). */
  autoComplete: string;
  draft: MachineryDraft;
  onChange: (next: MachineryDraft) => void;
  /** The field the last error points to. */
  invalidField?: string;
}) {
  const set = (key: keyof MachineryDraft, value: string) => onChange({ ...draft, [key]: value });
  const text = (key: TextField): SheetField => ({
    key: `machinery-${key}`,
    label: LABELS[key].label,
    htmlFor: `machinery-${key}`,
    control: (
      <Input id={`machinery-${key}`} autoComplete={autoComplete} maxLength={key === "attachments" ? 500 : 120} placeholder={LABELS[key].placeholder} value={draft[key]} onChange={(event) => set(key, event.target.value)} />
    ),
  });
  const items: SheetField[] = [
    text("brand"),
    text("model"),
    {
      key: "machinery-year", label: "Año", htmlFor: "machinery-year",
      control: <Input id="machinery-year" data-field="machinery-year" aria-invalid={invalidField === "machinery-year"} autoComplete={autoComplete} inputMode="numeric" maxLength={4} placeholder="2018" value={draft.year} onChange={(event) => set("year", event.target.value)} />,
    },
    text("serial"),
    text("capacity"),
    {
      key: "machinery-meter-kind", label: "Se mide con", htmlFor: "machinery-meter-kind",
      control: (
        <NativeSelect id="machinery-meter-kind" className="w-full" value={draft.meterKind} onChange={(event) => set("meterKind", event.target.value)}>
          <NativeSelectOption value="">Elige horómetro u odómetro</NativeSelectOption>
          {METER_KINDS.map((kind) => <NativeSelectOption key={kind} value={kind}>{METER_KIND_LABELS[kind]}</NativeSelectOption>)}
        </NativeSelect>
      ),
    },
    {
      key: "machinery-meter", label: draft.meterKind === "ODOMETRO" ? "Kilometraje (km)" : draft.meterKind === "HOROMETRO" ? "Horas de uso" : "Lectura", htmlFor: "machinery-meter",
      control: <Input id="machinery-meter" data-field="machinery-meter" aria-invalid={invalidField === "machinery-meter"} autoComplete={autoComplete} inputMode="decimal" placeholder={draft.meterKind === "ODOMETRO" ? "2145" : "8498"} value={draft.meterReading} onChange={(event) => set("meterReading", event.target.value)} />,
    },
    text("condition"),
    text("operatingState"),
    text("maintenance"),
    text("origin"),
    {
      key: "machinery-freight", label: "Flete / costo de envío", htmlFor: "machinery-freight",
      control: <Input id="machinery-freight" data-field="machinery-freight" aria-invalid={invalidField === "machinery-freight"} autoComplete={autoComplete} inputMode="decimal" placeholder="25000" value={draft.freight} onChange={(event) => set("freight", event.target.value)} />,
    },
    { ...text("attachments"), wide: true },
  ];
  return (
    <SheetSection title="Datos de la máquina o equipo">
      <div data-machinery-fields>
        <SheetFieldTable items={items} />
        <p className="border-t px-2 py-1 text-[11px] text-muted-foreground">
          Sirven para comparar y buscar en la base del despacho; la homologación de maquinaria se captura en su panel.
        </p>
      </div>
    </SheetSection>
  );
}
