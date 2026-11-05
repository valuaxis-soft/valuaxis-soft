"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

import {
  HIGHLIGHT_TITLES,
  STREET_CATEGORIES,
  WEIGHT_RANGE,
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
  disabled: boolean;
  /** The ODbL credit, shown with the list. */
  attribution: string;
}

/**
 * Etapa 2 in the croquis panel: the palette (the front street and the four
 * categories, each with its color and width, the selected one being what the
 * next touched street is painted with), "Mostrar nombres" and the list of
 * painted streets with a button to take each one off.
 */
export function StreetHighlightsPanel({ value, category, onCategoryChange, onChange, onRemove, status, disabled, attribution }: StreetHighlightsPanelProps) {
  const updateStyle = (key: HighlightKey, patch: Partial<HighlightStyle>) => onChange({ styles: { ...value.styles, [key]: { ...value.styles[key], ...patch } } });
  const byCategory = (key: CategoryKey) => value.streets.filter((street) => street.category === key);

  return (
    <div className="grid gap-2">
      <div>
        <span className="text-xs font-semibold text-muted-foreground">Calles resaltadas</span>
        <p className="text-xs text-muted-foreground">
          Elige una categoría y toca las calles del mapa para pintarlas con ella; tócalas de nuevo para quitarlas. Con el encuadre macro solo se tocan las
          avenidas, y en el croquis macro solo salen ellas.
        </p>
      </div>
      {status ? (
        <p className="text-xs text-muted-foreground" role="status">
          {status}
        </p>
      ) : null}
      <StyleRow title={HIGHLIGHT_TITLES.front} names={value.front ?? "Se detecta al ubicar el inmueble"} style={value.styles.front} disabled={disabled} onChange={(patch) => updateStyle("front", patch)} />
      <div role="radiogroup" aria-label="Categoría para pintar" className="grid gap-2">
        {STREET_CATEGORIES.map((item) => (
          <StyleRow
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

const firstValue = (value: number | readonly number[]) => (Array.isArray(value) ? value[0] : (value as number));

/** "A, B, C, D y 2 más", or "Ninguna". */
function summarize(streets: readonly PaintedStreet[], max = 4) {
  if (!streets.length) return "Ninguna";
  const names = streets.map((street) => street.name);
  return names.slice(0, max).join(", ") + (names.length > max ? ` y ${names.length - max} más` : "");
}

interface StyleRowProps {
  title: string;
  /** The streets drawn with this style. */
  names: string;
  style: HighlightStyle;
  disabled: boolean;
  onChange: (patch: Partial<HighlightStyle>) => void;
  /** Categories of the palette: the row is also the option to paint with. */
  selected?: boolean;
  onSelect?: () => void;
}

/** One highlight style: on/off, color and width; for a category, also whether it is the one to paint with. */
function StyleRow({ title, names, style, disabled, onChange, selected, onSelect }: StyleRowProps) {
  const lower = title.toLowerCase();
  const text = (
    <>
      <strong className="text-[13px]">{title}</strong>
      <small className="block text-[11.5px] text-muted-foreground">{names}</small>
    </>
  );
  return (
    <div className={`grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border p-2 ${selected ? "border-primary ring-2 ring-primary/30" : ""}`}>
      <Checkbox checked={style.on} disabled={disabled} onCheckedChange={(on) => onChange({ on: on === true })} aria-label={`Mostrar ${lower}`} />
      {onSelect ? (
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          disabled={disabled}
          onClick={onSelect}
          className="min-w-0 cursor-pointer rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        >
          {text}
          {selected && !disabled && <span className="block text-[11px] font-semibold text-primary">Toca calles para pintarlas así</span>}
        </button>
      ) : (
        <div className="min-w-0">{text}</div>
      )}
      <input
        type="color"
        value={style.color}
        disabled={disabled}
        onChange={(event) => onChange({ color: event.target.value })}
        aria-label={`Color de ${lower}`}
        className="h-6 w-8 cursor-pointer rounded border border-input bg-transparent p-0"
      />
      <span className="col-span-3 flex items-center gap-2 text-xs text-muted-foreground">
        Grosor
        <Slider
          min={WEIGHT_RANGE.min}
          max={WEIGHT_RANGE.max}
          value={[style.weight]}
          disabled={disabled}
          onValueChange={(value) => onChange({ weight: firstValue(value) })}
          aria-label={`Grosor de ${lower}`}
        />
      </span>
    </div>
  );
}
