"use client";

import { Check, PenLine, Undo2, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { MAX_LINE_NAME, type FreeLine, type FreeLineStyle } from "../free-lines";
import type { LatLon } from "../types";
import { WeightInput } from "./street-highlights";

export interface FreeLinesPanelProps {
  lines: readonly FreeLine[];
  /** The line being drawn; null when not drawing. */
  draft: readonly LatLon[] | null;
  /** The color and width of the next line (and of the one being drawn). */
  nextStyle: FreeLineStyle;
  selectedId: string | null;
  onStart: () => void;
  onUndoPoint: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onSelect: (id: string | null) => void;
  onNextStyleChange: (patch: Partial<FreeLineStyle>) => void;
  onLineStyleChange: (id: string, patch: Partial<FreeLineStyle>) => void;
  /** The name of the street the line stands for; empty takes it away. */
  onLineNameChange: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  disabled: boolean;
}

/**
 * «Trazo libre» in the croquis generator (23 nov 2026): a line drawn by
 * hand, one click per vertex, turning wherever the appraiser wants, until he
 * finishes it (double click, Enter or «Terminar trazo»); Esc cancels it and
 * Retroceso or «Deshacer punto» takes the last vertex back. Several lines per
 * croquis; the selected one takes the color and width of the controls (the
 * same ones the street categories have) and shows its vertices on the map to
 * drag them.
 */
export function FreeLinesPanel({
  lines,
  draft,
  nextStyle,
  selectedId,
  onStart,
  onUndoPoint,
  onFinish,
  onCancel,
  onSelect,
  onNextStyleChange,
  onLineStyleChange,
  onLineNameChange,
  onRemove,
  disabled,
}: FreeLinesPanelProps) {
  const selectedIndex = draft ? -1 : lines.findIndex((line) => line.id === selectedId);
  const selected = selectedIndex >= 0 ? lines[selectedIndex] : null;
  const style = selected ?? nextStyle;
  const styleOf = selected ? `trazo ${selectedIndex + 1}` : "próximo trazo";
  const changeStyle = (patch: Partial<FreeLineStyle>) => (selected ? onLineStyleChange(selected.id, patch) : onNextStyleChange(patch));

  return (
    <div className="grid gap-2" data-free-lines="">
      <div>
        <span className="text-xs font-semibold text-muted-foreground">Trazo libre</span>
        <p className="text-xs text-muted-foreground">
          Toca el mapa para poner cada punto: la línea da vuelta donde pongas el siguiente. Termina con doble clic, Enter o «Terminar trazo»; Esc la cancela y
          Retroceso quita el último punto. Selecciona un trazo para cambiar su color y grosor, arrastrar sus puntos o ponerle el nombre de su calle: sale en un
          letrero con el color del trazo, que se mueve y gira como los de las calles.
        </p>
      </div>

      {draft ? (
        <div className="grid gap-2 rounded-lg border border-primary bg-background/60 p-2 ring-2 ring-primary/30">
          <p className="text-[13px]" role="status" aria-live="polite">
            <span className="font-semibold">Trazo en curso</span>{" "}
            <span className="text-muted-foreground tabular-nums">
              · {draft.length === 0 ? "toca el mapa para poner el primer punto" : `${draft.length} ${draft.length === 1 ? "punto" : "puntos"}`}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={draft.length < 2} onClick={onFinish}>
              <Check data-icon="inline-start" />
              Terminar trazo
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={draft.length === 0} onClick={onUndoPoint}>
              <Undo2 data-icon="inline-start" />
              Deshacer punto
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              <X data-icon="inline-start" />
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onStart}>
            <PenLine data-icon="inline-start" />
            Trazo libre
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="min-w-28">Color y grosor del {styleOf}</span>
        <input
          type="color"
          value={style.color}
          disabled={disabled}
          onChange={(event) => changeStyle({ color: event.target.value })}
          aria-label={`Color del ${styleOf}`}
          className="h-7 w-8 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0"
        />
        <WeightInput key={selected?.id ?? "next"} label={`Grosor del ${styleOf}`} value={style.weight} disabled={disabled} onChange={(weight) => changeStyle({ weight })} />
      </div>

      {selected ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <label htmlFor={`trazo-nombre-${selected.id}`} className="min-w-28">
            Nombre de la calle
          </label>
          <LineNameInput key={selected.id} line={selected} disabled={disabled} onChange={(name) => onLineNameChange(selected.id, name)} />
        </div>
      ) : null}

      {lines.length ? (
        <ul className="grid gap-0.5 text-xs" aria-label="Trazos libres">
          {lines.map((line, index) => {
            const active = line.id === selected?.id;
            return (
              <li key={line.id} className={cn("flex items-center gap-1.5 rounded-md px-1", active && "bg-primary/10")}>
                <button
                  type="button"
                  aria-pressed={active}
                  disabled={Boolean(draft)}
                  onClick={() => onSelect(active ? null : line.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                >
                  <span className="inline-block h-1 w-5 shrink-0 rounded-sm" style={{ background: line.color }} />
                  <span className="font-semibold text-foreground">Trazo {index + 1}</span>
                  {line.name ? <span className="min-w-0 truncate text-foreground">«{line.name}»</span> : null}
                  <span className="text-muted-foreground tabular-nums">
                    · {line.points.length} puntos · grosor {line.weight}
                  </span>
                  {active ? <span className="font-semibold text-primary">seleccionado</span> : null}
                </button>
                <Button type="button" size="xs" variant="ghost" disabled={disabled || Boolean(draft)} onClick={() => onRemove(line.id)} aria-label={`Quitar trazo ${index + 1}`}>
                  Quitar
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** The name as typed: the saved one comes back trimmed, and a space at the end must not vanish while typing. */
function LineNameInput({ line, disabled, onChange }: { line: FreeLine; disabled: boolean; onChange: (name: string) => void }) {
  const [text, setText] = useState(line.name ?? "");
  return (
    <Input
      id={`trazo-nombre-${line.id}`}
      className="h-7 min-w-40 flex-1 text-xs"
      placeholder="Ej. Av. Adolfo López Mateos Sur"
      autoComplete="off"
      maxLength={MAX_LINE_NAME}
      disabled={disabled}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(event.target.value);
      }}
      data-free-line-name={line.id}
    />
  );
}
