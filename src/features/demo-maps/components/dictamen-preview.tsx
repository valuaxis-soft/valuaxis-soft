"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import type { DemoComparable, LatLon, StreetDetection } from "../geo";
import { highlightedWays, staticMapUrl, type HighlightStyles } from "../static-map";
import type { Stage } from "./map-view";

const LeafletMiniMap = dynamic(() => import("./leaflet-mini-map"), { ssr: false, loading: () => <Skeleton className="h-60 rounded-none" /> });

const TITLES: Record<Stage, string> = {
  "etapa-1": "II.1 UBICACIÓN DEL INMUEBLE",
  "etapa-2": "II.1 UBICACIÓN DEL INMUEBLE · VIALIDADES",
  "etapa-3": "ANEXO 1 · MAPA DE COMPARABLES",
};

interface DictamenPreviewProps {
  /** With a key, the croquis are Maps Static API images; without one, drawn mini maps. */
  apiKey: string | null;
  stage: Stage;
  subject: LatLon;
  detection: StreetDetection;
  highlightStyles: HighlightStyles;
  comparables: readonly DemoComparable[];
}

/** How the croquis would print in the dictamen: macro (zoom 15) and micro (zoom 17). */
export function DictamenPreview({ apiKey, stage, subject, detection, highlightStyles, comparables }: DictamenPreviewProps) {
  const highlights = useMemo(() => (stage === "etapa-2" ? highlightedWays(detection, highlightStyles) : []), [stage, detection, highlightStyles]);
  const macroComparables = stage === "etapa-3" ? comparables : NONE;
  const microCaption = stage === "etapa-2" ? "Microlocalización con vialidades resaltadas" : "Croquis de microlocalización";

  const figure = (zoom: 15 | 17, caption: string) => {
    const isMacro = zoom === 15;
    const lines = isMacro ? NO_LINES : highlights;
    const points = isMacro ? macroComparables : NONE;
    return (
      <figure className="m-0 grid gap-1.5">
        {apiKey ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Maps Static API image, sized by the API
          <img
            src={staticMapUrl({ apiKey, center: subject, zoom, highlights: lines, comparables: points })}
            alt={caption}
            className="h-60 w-full border-2 border-slate-500 object-cover"
            loading="lazy"
          />
        ) : (
          <LeafletMiniMap center={subject} zoom={zoom} labels={isMacro} highlights={lines} comparables={points} />
        )}
        <figcaption className="text-center text-[11.5px] font-semibold">{caption}</figcaption>
      </figure>
    );
  };

  return (
    <div className="grid gap-3 rounded-sm bg-white px-6 py-5 text-[#12212f] shadow-sm ring-1 ring-black/10">
      <div className="border border-[#0b3a5b] bg-[#0b3a5b] px-2.5 py-1.5 text-center text-xs font-bold tracking-[0.06em] text-white">DICTAMEN VALUATORIO</div>
      <div className="w-1/2 border-b-2 border-[#0b3a5b] pb-0.5 text-[12.5px] font-bold text-[#0b3a5b]">{TITLES[stage]}</div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        {figure(15, "Croquis de macrolocalización")}
        {figure(17, microCaption)}
      </div>
      <p className="text-[10.5px] text-[#5a6b7b]">
        Coordenadas del inmueble: {subject[0].toFixed(6)}, {subject[1].toFixed(6)} · Frente a {detection.front ?? "—"} · Fuente cartográfica:{" "}
        {apiKey ? "Google Maps" : "OpenStreetMap (en el producto final, Google Maps)"}. Inmueble de ejemplo.
      </p>
    </div>
  );
}

const NONE: readonly DemoComparable[] = [];
const NO_LINES: ReturnType<typeof highlightedWays> = [];
