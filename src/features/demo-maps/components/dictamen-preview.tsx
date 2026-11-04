"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import type { DemoComparable, LatLon } from "../geo";
import { macroHighlights, streetLabels, type HighlightedWay, type StreetLabel } from "../highlights";
import { STREET_LABEL_CLASS } from "../map-content";
import { frameCenter, type CroquisFrame, type NorthArrow as NorthArrowConfig } from "@/features/maps/map-styles";
import { imagePosition, staticMapUrl } from "../static-map";
import type { Stage } from "./map-view";
import { NorthArrow } from "@/features/maps/components/north-arrow";

const LeafletMiniMap = dynamic(() => import("./leaflet-mini-map"), { ssr: false, loading: () => <Skeleton className="aspect-[8/5] w-full rounded-none" /> });

const TITLES: Record<Stage, string> = {
  "etapa-1": "II.1 UBICACIÓN DEL INMUEBLE",
  "etapa-2": "II.1 UBICACIÓN DEL INMUEBLE · VIALIDADES",
  "etapa-3": "ANEXO 1 · MAPA DE COMPARABLES",
};

/** Everything "Aplicar al croquis" fixes into the croquis of the dictamen. */
export interface CroquisSnapshot {
  subject: LatLon;
  front: string | null;
  macro: CroquisFrame;
  micro: CroquisFrame;
  highlights: readonly HighlightedWay[];
  /** Street names next to the highlighted streets. */
  names: boolean;
  clean: boolean;
  northArrow: NorthArrowConfig;
  comparables: readonly DemoComparable[];
}

interface DictamenPreviewProps {
  /** With a key, the croquis are Maps Static API images; without one, drawn mini maps. */
  apiKey: string | null;
  stage: Stage;
  snapshot: CroquisSnapshot;
}

/** How the croquis would print in the dictamen: macro (avenues only) and micro (every highlighted street). */
export function DictamenPreview({ apiKey, stage, snapshot }: DictamenPreviewProps) {
  const { subject, front, macro, micro, names, clean, northArrow } = snapshot;
  const highlights = stage === "etapa-2" ? snapshot.highlights : NO_LINES;
  const comparables = stage === "etapa-3" ? snapshot.comparables : NONE;
  const microCaption = stage === "etapa-2" ? "Microlocalización con vialidades resaltadas" : "Croquis de microlocalización";
  const macroLines = useMemo(() => macroHighlights(highlights), [highlights]);

  const figure = (frame: CroquisFrame, lines: readonly HighlightedWay[], points: readonly DemoComparable[], caption: string) => {
    const center = frameCenter(frame, subject);
    const labels = names ? streetLabels(lines, center) : NO_LABELS;
    return (
      <figure className="m-0 grid gap-1.5">
        <div className="relative aspect-[8/5] w-full overflow-hidden border-2 border-slate-500">
          {apiKey ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- external Maps Static API image, sized by the API */}
              <img
                src={staticMapUrl({ apiKey, center, zoom: frame.zoom, subject, clean, highlights: lines, comparables: points })}
                alt={caption}
                className="block size-full object-cover"
                loading="lazy"
              />
              {labels.map((label) => {
                const at = imagePosition(center, frame.zoom, label.point);
                return at ? (
                  <span
                    key={label.name}
                    className={`pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+6px)] ${STREET_LABEL_CLASS}`}
                    style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%`, borderLeft: `3px solid ${label.color}` }}
                  >
                    {label.name}
                  </span>
                ) : null;
              })}
            </>
          ) : (
            <LeafletMiniMap center={center} zoom={frame.zoom} subject={subject} baseLabels={frame.zoom <= 16} highlights={lines} labels={labels} comparables={points} />
          )}
          <NorthArrow {...northArrow} size={40} />
        </div>
        <figcaption className="text-center text-[11.5px] font-semibold">{caption}</figcaption>
      </figure>
    );
  };

  return (
    <div className="grid gap-3 rounded-sm bg-white px-6 py-5 text-[#12212f] shadow-sm ring-1 ring-black/10">
      <div className="border border-[#0b3a5b] bg-[#0b3a5b] px-2.5 py-1.5 text-center text-xs font-bold tracking-[0.06em] text-white">DICTAMEN VALUATORIO</div>
      <div className="w-1/2 border-b-2 border-[#0b3a5b] pb-0.5 text-[12.5px] font-bold text-[#0b3a5b]">{TITLES[stage]}</div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        {figure(macro, macroLines, comparables, "Croquis de macrolocalización")}
        {figure(micro, highlights, NONE, microCaption)}
      </div>
      <p className="text-[10.5px] text-[#5a6b7b]">
        Coordenadas del inmueble: {subject[0].toFixed(6)}, {subject[1].toFixed(6)} · Frente a {front ?? "—"} · Fuente cartográfica:{" "}
        {apiKey ? "Google Maps" : "OpenStreetMap (en el producto final, Google Maps)"}. Inmueble de ejemplo.
      </p>
    </div>
  );
}

const NONE: readonly DemoComparable[] = [];
const NO_LINES: readonly HighlightedWay[] = [];
const NO_LABELS: readonly StreetLabel[] = [];
