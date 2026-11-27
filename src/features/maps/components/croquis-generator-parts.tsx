"use client";

import { CheckCircle2, Crosshair, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ComparableType } from "@/features/valuations/calculation/market-types";

import { COMPARABLE_MARKETS, DEFAULT_SUBJECT_LEGEND, pinsByMarketText, MAX_SUBJECT_LEGEND, croquisKind, type ComparablePin, type CroquisKind, type CroquisSettings } from "../croquis";
import { SATELLITE_NOTICE, ZOOM_STEP, formatZoom, isScreenOnlyMapType, type CroquisFrame, type MapType } from "../map-styles";

/**
 * The frame a croquis is generated with (video 8.5, 11:03): the one the map
 * frames is exactly what the screen shows when «Generar» is pressed, even
 * if the map has not stopped yet; the others keep the frame they were left with.
 */
export function generationFrame(kind: CroquisKind, active: CroquisKind, onScreen: CroquisFrame | null, stored: CroquisFrame): CroquisFrame {
  return kind === active && onScreen ? onScreen : stored;
}

/** One croquis of the opening, as «Encuadres» lists it. */
export interface FrameRow {
  kind: CroquisKind;
  zoom: number;
  /** FAL-10: the comparables this frame leaves out. */
  outside: readonly ComparablePin[];
}

/**
 * «Encuadres» (video 8.5, 7:00: «Ver encuadre» and «Tomar del mapa» did not
 * say what they did). The map frames one croquis at a time and the dashed
 * box over it is that croquis' image: moving or zooming the map moves its
 * frame. The other croquis of the opening has «Encuadrar en el mapa», which
 * takes the map to its frame and makes it the one the map moves.
 */
export function CroquisFramesSection({
  rows,
  active,
  placed,
  mapReady,
  comparables,
  canEdit,
  alikeZoom,
  onFrameOnMap,
  onFitComparables,
  onNudgeZoom,
}: {
  rows: readonly FrameRow[];
  active: CroquisKind;
  /** The subject is on the map. */
  placed: boolean;
  /** The interactive map is showing. */
  mapReady: boolean;
  /** How many comparables have coordinates. */
  comparables: number;
  canEdit: boolean;
  /** V5.7-06: the zoom macro and micro share when they would come out the same; null when they differ. */
  alikeZoom: number | null;
  onFrameOnMap: (kind: CroquisKind) => void;
  onFitComparables: (kind: CroquisKind) => void;
  /** Video 8.14: a quarter of a zoom closer (+) or farther (−). */
  onNudgeZoom?: (kind: CroquisKind, delta: number) => void;
}) {
  return (
    <div className="grid gap-2" data-croquis-frames="">
      <span className="text-xs font-semibold text-muted-foreground">Encuadres</span>
      <p className="text-xs text-muted-foreground">
        {placed
          ? `El recuadro punteado del mapa es la imagen de ${croquisKind(active).title.toLowerCase()}: lo que queda dentro es exactamente lo que sale en el croquis. Acerca, aleja o mueve el mapa y el encuadre lo sigue; con − y + el zoom cambia de a un cuarto.`
          : "Ubica el inmueble para encuadrar los croquis."}
        {rows.length > 1 && placed ? " Para ajustar el otro croquis, pulsa su «Encuadrar en el mapa»; cada uno guarda su encuadre." : ""}
      </p>
      {rows.map(({ kind, zoom, outside }) => (
        <div key={kind} className="grid gap-1.5" data-croquis-frame={kind}>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="min-w-36 font-medium">{croquisKind(kind).title}</span>
            <span className="text-xs text-muted-foreground tabular-nums">zoom {formatZoom(zoom)}</span>
            {onNudgeZoom ? (
              <span className="inline-flex items-center gap-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-7"
                  disabled={!placed || !canEdit}
                  aria-label={`Alejar un cuarto de zoom (${croquisKind(kind).title})`}
                  title="Alejar un cuarto de zoom"
                  onClick={() => onNudgeZoom(kind, -ZOOM_STEP)}
                >
                  <Minus />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-7"
                  disabled={!placed || !canEdit}
                  aria-label={`Acercar un cuarto de zoom (${croquisKind(kind).title})`}
                  title="Acercar un cuarto de zoom"
                  onClick={() => onNudgeZoom(kind, ZOOM_STEP)}
                >
                  <Plus />
                </Button>
              </span>
            ) : null}
            {kind === active ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary" role="status" data-croquis-frame-active="">
                <Crosshair className="size-3.5" aria-hidden="true" />
                En el mapa: muévelo para encuadrarlo
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!placed || !mapReady}
                title="Lleva el mapa a este croquis; desde ahí, mover o acercar el mapa cambia su encuadre"
                onClick={() => onFrameOnMap(kind)}
              >
                <Crosshair data-icon="inline-start" />
                Encuadrar en el mapa
              </Button>
            )}
          </div>
          {outside.length ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-highlight/45 bg-highlight/15 px-2 py-1.5 text-xs text-foreground" role="status" data-comparables-outside={kind}>
              <span className="min-w-0 flex-1">
                {outside.length === comparables
                  ? `Ningún comparable cabe en este encuadre (zoom ${formatZoom(zoom)}); la imagen saldría sin ellos.`
                  : `${outside.length} de ${comparables} comparables quedan fuera de este encuadre: ${pinsByMarketText(outside)}.`}
              </span>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={!canEdit} onClick={() => onFitComparables(kind)}>
                Encuadrar los comparables
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      {alikeZoom !== null ? (
        <p className="rounded-md border border-highlight/45 bg-highlight/15 px-2 py-1.5 text-xs text-foreground" role="status">
          Macrolocalización y microlocalización tienen el mismo encuadre (zoom {formatZoom(alikeZoom)}), así que los dos croquis saldrán iguales. Pulsa «Encuadrar en el
          mapa» en uno de ellos y acerca o aleja el mapa si quieres que sean distintos.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Video 8.14 (27 nov 2026): which comparables each croquis carries, by
 * market («Terrenos en venta», «Inmuebles en venta»…), so a map can show
 * one market or several; a map per market is «Generar otro croquis» with
 * another choice. And the subject's name in the legend («Bien sujeto»,
 * «Bien valuado»…). Only the markets the valuation has are offered; none
 * ticked is every market.
 */
export function ComparableMarketsChoice({
  kinds,
  comparables,
  markets,
  subjectLegend,
  disabled,
  onMarketsChange,
  onSubjectLegendChange,
}: {
  kinds: readonly CroquisKind[];
  comparables: readonly ComparablePin[];
  markets: CroquisSettings["markets"];
  subjectLegend: string;
  disabled: boolean;
  onMarketsChange: (kind: CroquisKind, markets: ComparableType[]) => void;
  onSubjectLegendChange: (value: string) => void;
}) {
  const present = COMPARABLE_MARKETS.map((market) => ({ ...market, count: comparables.filter((pin) => pin.type === market.type).length })).filter((market) => market.count);
  return (
    <div className="grid w-full gap-2 rounded-md border bg-background/70 p-2" data-comparable-markets="">
      <span className="text-xs font-semibold text-muted-foreground">Comparables en cada mapa</span>
      {kinds.map((kind) => {
        const chosen = markets[kind] ?? [];
        const toggle = (type: ComparableType, on: boolean) => {
          // «All» is no choice: the first box unticked leaves the others.
          const current = chosen.length ? chosen : present.map((market) => market.type);
          const next = on ? [...new Set([...current, type])] : current.filter((item) => item !== type);
          onMarketsChange(kind, next.length === present.length ? [] : next);
        };
        return (
          <fieldset key={kind} className="grid gap-1" data-comparable-markets-kind={kind}>
            <legend className="text-[13px] font-medium">{croquisKind(kind).title}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {present.map((market) => (
                <Label key={market.type} className="text-[13px] font-normal">
                  <Checkbox
                    checked={!chosen.length || chosen.includes(market.type)}
                    disabled={disabled}
                    onCheckedChange={(on) => toggle(market.type, on === true)}
                  />
                  {market.title} <span className="text-muted-foreground tabular-nums">({market.count})</span>
                </Label>
              ))}
            </div>
          </fieldset>
        );
      })}
      <div className="grid gap-1">
        <Label htmlFor="croquis-subject-legend" className="text-xs text-muted-foreground">
          Nombre del inmueble en la simbología
        </Label>
        <Input
          id="croquis-subject-legend"
          className="h-8 text-[13px]"
          maxLength={MAX_SUBJECT_LEGEND}
          placeholder={DEFAULT_SUBJECT_LEGEND}
          autoComplete="off"
          value={subjectLegend}
          disabled={disabled}
          onChange={(event) => onSubjectLegendChange(event.target.value)}
        />
      </div>
    </div>
  );
}

/** Video 8.7, 0:00: with the satellite photo on screen, what the stored croquis is drawn with. */
export function ScreenOnlyMapNotice({ mapType }: { mapType: MapType }) {
  if (!isScreenOnlyMapType(mapType)) return null;
  return (
    <p className="w-full rounded-md border border-highlight/45 bg-highlight/15 px-2 py-1.5 text-xs text-foreground" role="status" data-satellite-notice="">
      {SATELLITE_NOTICE}
    </p>
  );
}

/**
 * After «Generar» (video 8.5, 7:35: the generator closed and he could not
 * make another view from the same setup): what went where, and the
 * generator stays open with «Generar otro croquis» and «Cerrar el generador».
 */
export function CroquisDoneNotice({ message, onAnother, onClose }: { message: string; onAnother?: () => void; onClose: () => void }) {
  return (
    <div className="grid gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-[13px]" role="status" data-croquis-done="">
      <p className="flex items-start gap-1.5">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>
          {message} El generador sigue abierto con tus calles, trazos y encuadres: cambia lo que quieras y genera otro, o ciérralo. Guarda el avalúo para
          conservarlo.
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {onAnother ? (
          <Button type="button" size="sm" variant="outline" onClick={onAnother} data-croquis-another="">
            Generar otro croquis
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cerrar el generador
        </Button>
      </div>
    </div>
  );
}
