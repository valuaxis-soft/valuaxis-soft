"use client";

import { Check, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  DOCUMENT_PALETTE_PRESETS,
  documentPalettePreset,
  documentPaletteSample,
  documentPaletteSchema,
  documentPaletteWarnings,
  type DocumentPalette,
} from "@/features/valuations/services/document-palette";
import { cn } from "@/lib/utils";

/** The two colours of a palette side by side: the swatch of its option. The colours are the document's, not the interface's. */
function Swatch({ palette }: { palette: DocumentPalette }) {
  return (
    <span className="flex h-6 w-10 shrink-0 overflow-hidden rounded-sm border border-border" aria-hidden="true">
      <span className="flex-1" style={{ backgroundColor: palette.strong }} />
      <span className="flex-1" style={{ backgroundColor: palette.pastel }} />
    </span>
  );
}

/** One colour of a palette of the appraiser's own: the system's colour picker and its "#RRGGBB" to type or paste. */
function ColorField({
  label,
  description,
  value,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  // What is being typed; it follows the colour whenever it changes from outside (the picker, a preset).
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const typed = documentPaletteSchema.shape.strong.safeParse(draft);
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label}: elegir`}
          className="h-8 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          value={value.toLowerCase()}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        <Input
          id={id}
          className="w-28 font-mono uppercase"
          autoComplete="off"
          spellCheck={false}
          maxLength={7}
          value={draft}
          disabled={disabled}
          aria-invalid={!typed.success}
          onChange={(event) => {
            const next = event.target.value.trim();
            setDraft(next);
            const parsed = documentPaletteSchema.shape.strong.safeParse(next);
            if (parsed.success && parsed.data !== value) onChange(parsed.data);
          }}
          onBlur={() => setDraft(value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">{typed.success ? description : "Escribe el color como #RRGGBB, por ejemplo #1E5631."}</p>
    </div>
  );
}

/** How the palette prints: a title bar, the header of a table and the box of the concluded value. */
function Sample({ palette }: { palette: DocumentPalette }) {
  const colors = documentPaletteSample(palette);
  return (
    <div className="grid gap-1 rounded-md border bg-white p-2 text-[10px] leading-tight text-[#333333]" data-palette-sample="" aria-label="Muestra de los colores en el dictamen">
      <div className="px-2 py-0.5 text-center font-bold uppercase" style={{ backgroundColor: colors.strong, color: colors.onStrong }}>Título de sección</div>
      <div className="w-1/2 border-b-2 pb-0.5 font-bold uppercase" style={{ color: colors.strong, borderColor: colors.strong }}>Título de subbloque</div>
      <div className="grid grid-cols-3 text-center">
        {["Concepto", "Superficie", "Valor"].map((heading) => (
          <span key={heading} className="border-r-2 border-white px-1 py-0.5 font-bold last:border-r-0" style={{ backgroundColor: colors.pastel, color: colors.onPastel }}>{heading}</span>
        ))}
        {["Terreno", "300.00", "$1,230,000.00"].map((cell) => (
          <span key={cell} className="bg-slate-100 px-1 py-0.5 tabular-nums">{cell}</span>
        ))}
      </div>
      <div className="mx-auto flex w-4/5 border font-bold" style={{ borderColor: colors.strong }}>
        <span className="flex-1 px-2 py-0.5 text-right uppercase" style={{ backgroundColor: colors.strong, color: colors.onStrong }}>Valor concluido:</span>
        <span className="bg-slate-200 px-2 py-0.5 tabular-nums text-slate-900">$2,610,000.00</span>
      </div>
    </div>
  );
}

/**
 * The colours of the dictamen: the palettes offered, or two colours of the
 * appraiser's own. A palette that reads poorly is told, never refused: the
 * system warns, the appraiser decides.
 */
export function DocumentPalettePicker({
  value,
  disabled = false,
  onChange,
}: {
  value: DocumentPalette;
  disabled?: boolean;
  onChange: (palette: DocumentPalette) => void;
}) {
  const preset = documentPalettePreset(value);
  // «Personalizada» stays open while its colours happen to match a preset.
  const [customOpen, setCustomOpen] = useState(false);
  const custom = customOpen || !preset;
  const warnings = documentPaletteWarnings(value);
  const option = (selected: boolean) =>
    cn(
      "flex min-h-11 items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50",
      selected ? "border-brand ring-2 ring-brand/25" : "border-border",
    );
  return (
    <div className="grid gap-3" data-document-palette="">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" role="radiogroup" aria-label="Paleta de colores del dictamen">
        {DOCUMENT_PALETTE_PRESETS.map((item) => {
          const selected = !custom && preset?.key === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              className={option(selected)}
              data-palette-option={item.key}
              onClick={() => {
                setCustomOpen(false);
                onChange({ strong: item.strong, pastel: item.pastel });
              }}
            >
              <Swatch palette={item} />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {selected ? <Check className="size-4 shrink-0 text-brand" aria-hidden="true" /> : null}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          disabled={disabled}
          className={option(custom)}
          data-palette-option="personalizada"
          onClick={() => setCustomOpen(true)}
        >
          <Swatch palette={value} />
          <span className="min-w-0 flex-1 truncate">Personalizada</span>
          {custom ? <Check className="size-4 shrink-0 text-brand" aria-hidden="true" /> : null}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] sm:items-start">
        {custom ? (
          <div className="grid gap-3 sm:grid-cols-2" data-palette-custom="">
            <ColorField
              label="Color fuerte"
              description="Títulos, barras, marcos y el recuadro del valor."
              value={value.strong}
              disabled={disabled}
              onChange={(strong) => onChange({ ...value, strong })}
            />
            <ColorField
              label="Color pastel"
              description="Encabezados y renglones sombreados de las tablas."
              value={value.pastel}
              disabled={disabled}
              onChange={(pastel) => onChange({ ...value, pastel })}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            El color fuerte va en títulos, barras, marcos y el recuadro del valor; el pastel, en los encabezados y renglones sombreados de las tablas.
            Con «Personalizada» eliges tus dos colores.
          </p>
        )}
        <Sample palette={value} />
      </div>
      {warnings.length ? (
        <ul className="grid gap-1 rounded-md border border-highlight/40 bg-highlight/10 p-2 text-xs text-highlight-strong" role="status" data-palette-warnings="">
          {warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5">
              <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
