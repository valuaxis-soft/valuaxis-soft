"use client";

import { RotateCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  HIGHLIGHT_TITLES,
  STREET_CATEGORIES,
  WEIGHT_RANGE,
  weightFromInput,
  type CategoryKey,
  type HighlightKey,
  type HighlightStyle,
  type PaintedStreet,
  type StreetHighlights,
} from "../highlights";

export interface StreetHighlightsPanelProps {
  value: StreetHighlights;
  /** The category the next touched street is painted with. */
  category: CategoryKey;
  onCategoryChange: (category: CategoryKey) => void;
  onChange: (patch: Partial<StreetHighlights>) => void;
  /** Takes a painted street off the list. */
  onRemove: (name: string) => void;
  /** Whether the streets around the pin are known: "cargando", "listo" or the problem. */
  status: string | null;
  /** Present when the streets could not be fetched: asks the server again. */
  onRetry?: () => void;
  disabled: boolean;
  /** The ODbL credit, shown with the list. */
  attribution: string;
}

/**
 * Etapa 2 in the croquis panel: the palette (the front street and the four
 * categories side by side, each with its color and its width as a number,
 * the selected one being what the next touched street is painted with),
 * "Mostrar nombres" and the list of painted streets with a button to take
 * each one off. When the streets could not be fetched, «Reintentar».
 */
export function StreetHighlightsPanel({ value, category, onCategoryChange, onChange, onRemove, status, onRetry, disabled, attribution }: StreetHighlightsPanelProps) {
  const updateStyle = (key: HighlightKey, patch: Partial<HighlightStyle>) => onChange({ styles: { ...value.styles, [key]: { ...value.styles[key], ...patch } } });
  const byCategory = (key: CategoryKey) => value.streets.filter((street) => street.category === key);

  return (
    <div className="@container grid gap-2">
      <div>
        <span className="text-xs font-semibold text-muted-foreground">Calles resaltadas</span>
        <p className="text-xs text-muted-foreground">
          Elige una categoría y toca las calles del mapa para pintarlas con ella; tócalas de nuevo para quitarlas. Con el encuadre macro solo se tocan las
          avenidas, y en el croquis macro solo salen ellas.
        </p>
      </div>
      {status ? (
        <div className="flex flex-wrap items-center gap-2" role="status">
          <p className={cn("text-xs", onRetry ? "text-destructive" : "text-muted-foreground")}>{status}</p>
          {onRetry ? (
            <Button type="button" size="xs" variant="outline" onClick={onRetry}>
              <RotateCw aria-hidden="true" />
              Reintentar
            </Button>
          ) : null}
        </div>
      ) : null}
      <StyleCard title={HIGHLIGHT_TITLES.front} names={value.front ?? "Se detecta al ubicar el inmueble"} style={value.styles.front} disabled={disabled} onChange={(patch) => updateStyle("front", patch)} />
      <div role="radiogroup" aria-label="Categoría para pintar" className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
        {STREET_CATEGORIES.map((item) => (
          <StyleCard
            key={item.key}
            title={item.title}
            names={summarize(byCategory(item.key))}
            style={value.styles[item.key]}
            disabled={disabled}
            onChange={(patch) => updateStyle(item.key, patch)}
            selected={category === item.key}
            onSelect={() => onCategoryChange(item.key)}
          />
        ))}
      </div>
      <Label className="text-[13px] font-normal">
        <Checkbox checked={value.names} disabled={disabled} onCheckedChange={(on) => onChange({ names: on === true })} /> Mostrar nombres
      </Label>
      {value.streets.length ? (
        <ul className="grid gap-0.5 text-xs" aria-label="Calles pintadas">
          {value.streets.map((street) => (
            <li key={street.name} className="flex items-center gap-1.5">
              <span className="inline-block h-1 w-5 shrink-0 rounded-sm" style={{ background: value.styles[street.category].color }} />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold text-foreground">{street.name}</span> <span className="text-muted-foreground">· {HIGHLIGHT_TITLES[street.category]}</span>
              </span>
              <Button type="button" size="xs" variant="ghost" disabled={disabled} onClick={() => onRemove(street.name)} aria-label={`Quitar ${street.name}`}>
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-[11px] text-muted-foreground">{attribution}</p>
    </div>
  );
}

/** "A, B, C, D y 2 más", or "Ninguna". */
function summarize(streets: readonly PaintedStreet[], max = 4) {
  if (!streets.length) return "Ninguna";
  const names = streets.map((street) => street.name);
  return names.slice(0, max).join(", ") + (names.length > max ? ` y ${names.length - max} más` : "");
}

interface StyleCardProps {
  title: string;
  /** The streets drawn with this style. */
  names: string;
  style: HighlightStyle;
  disabled: boolean;
  onChange: (patch: Partial<HighlightStyle>) => void;
  /** Categories of the palette: the card is also the option to paint with. */
  selected?: boolean;
  onSelect?: () => void;
}

/** One highlight style: on/off, color and width (a number, V5.7-13); for a category, also whether it is the one to paint with. */
function StyleCard({ title, names, style, disabled, onChange, selected, onSelect }: StyleCardProps) {
  const lower = title.toLowerCase();
  const text = (
    <>
      <strong className="block text-[13px] leading-tight">{title}</strong>
      <small className="line-clamp-2 block text-[11.5px] text-muted-foreground">{names}</small>
    </>
  );
  return (
    <div className={cn("grid min-w-0 gap-1.5 rounded-lg border bg-background/60 p-2", selected && "border-primary ring-2 ring-primary/30")}>
      <div className="flex min-w-0 items-start gap-2">
        <Checkbox className="mt-0.5" checked={style.on} disabled={disabled} onCheckedChange={(on) => onChange({ on: on === true })} aria-label={`Mostrar ${lower}`} />
        {onSelect ? (
          <button
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={onSelect}
            className="min-w-0 flex-1 cursor-pointer rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
          >
            {text}
            {selected && !disabled && <span className="block text-[11px] font-semibold text-primary">Toca calles para pintarlas así</span>}
          </button>
        ) : (
          <div className="min-w-0 flex-1">{text}</div>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="color"
          value={style.color}
          disabled={disabled}
          onChange={(event) => onChange({ color: event.target.value })}
          aria-label={`Color de ${lower}`}
          className="h-7 w-8 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0"
        />
        <WeightInput label={`Grosor de ${lower}`} value={style.weight} disabled={disabled} onChange={(weight) => onChange({ weight })} />
      </div>
    </div>
  );
}

/** «Grosor» as a small number box; what is typed applies once it is a valid width, and the box shows the stored one when it loses focus. */
function WeightInput({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (weight: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1">
      Grosor
      <Input
        type="number"
        inputMode="numeric"
        min={WEIGHT_RANGE.min}
        max={WEIGHT_RANGE.max}
        step={1}
        value={draft ?? String(value)}
        disabled={disabled}
        aria-label={label}
        className="h-7 w-14 px-1.5 text-center text-xs tabular-nums"
        onChange={(event) => {
          setDraft(event.target.value);
          const weight = weightFromInput(event.target.value);
          if (weight !== null && weight !== value) onChange(weight);
        }}
        onBlur={() => setDraft(null)}
      />
    </span>
  );
}
