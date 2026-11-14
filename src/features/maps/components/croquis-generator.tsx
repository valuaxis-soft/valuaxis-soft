"use client";

import { MapPinned } from "lucide-react";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EditorConfigPanel } from "@/features/valuations/components/editor/editor-config-panel";
import type { AppSection } from "@/features/valuations/model";
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";

import { croquisKind, type CroquisKind } from "../croquis";
import {
  croquisReplacements,
  croquisSectionKey,
  documentCroquis,
  findCroquisById,
  findCroquisImage,
  withCroquisImages,
  withInsertedCroquis,
  withUpdatedCroquis,
  type CroquisLocation,
  type GeneratedCroquis,
} from "../croquis-document";
import type { CroquisImageMarker } from "../croquis-marker";
import { CroquisGeneratorBody, type GoogleMapsPageConfig } from "./location-panel";

/** What one opening of the generator fills. */
type CroquisTarget =
  /** The Croquis section or the annex: its own croquis of these kinds. */
  | { mode: "section"; captures: readonly CroquisKind[] }
  /** «Agregar → Croquis de localización» in a block or subbloque. */
  | { mode: "insert"; at: CroquisLocation; captures: readonly CroquisKind[] }
  /** One croquis already in the document, generated again. */
  | { mode: "image"; imageId: string };

interface CroquisGeneratorApi {
  /** «Agregar → Croquis de localización» of this block or subbloque. */
  openInsert: (at: CroquisLocation) => void;
  /** The generator of one croquis of the document («Croquis» on its image). */
  openImage: (imageId: string) => void;
  /** The section's own access (Croquis, Mapa de comparables). */
  openSection: (captures: readonly CroquisKind[]) => void;
}

const CroquisGeneratorContext = createContext<CroquisGeneratorApi | null>(null);

/** The generator of the editor; null outside it (a new valuation not saved yet, the template views). */
export function useCroquisGenerator() {
  return useContext(CroquisGeneratorContext);
}

/** "Terreno › Información del terreno › Medidas", as the appraiser reads where the croquis goes. */
function placeName(sections: readonly AppSection[], at: CroquisLocation) {
  const section = sections.find((item) => item.id === at.sectionId);
  const block = section?.blocks.find((item) => item.id === at.blockId);
  const apartado = at.apartadoId ? block?.apartados.find((item) => item.id === at.apartadoId) : undefined;
  return [section?.title, block?.title, apartado?.title].filter((part) => part?.trim()).join(" › ") || "el bloque";
}

/**
 * The croquis generator in its own window (V5.7-03): opened from
 * «Agregar → Croquis de localización» in any block or subbloque, from the
 * «Croquis» of a croquis image, or from the compact access of the Croquis
 * section and the annex. It places what it generates where it was opened
 * from, in one step of the editor's history.
 */
export function CroquisGeneratorProvider({
  valuationId,
  readOnly,
  googleMaps,
  address,
  sections,
  updateSections,
  onUndo,
  children,
}: {
  valuationId: string | null;
  readOnly: boolean;
  googleMaps: GoogleMapsPageConfig;
  address: string;
  sections: AppSection[];
  updateSections: (updater: (current: AppSection[]) => AppSection[]) => void;
  onUndo: () => void;
  children: ReactNode;
}) {
  const [target, setTarget] = useState<CroquisTarget | null>(null);
  /** Each opening mounts the generator afresh, with the frames and names of what it opened. */
  const [opening, setOpening] = useState(0);
  const api = useMemo<CroquisGeneratorApi | null>(() => {
    if (!valuationId) return null;
    const open = (next: CroquisTarget) => {
      setOpening((count) => count + 1);
      setTarget(next);
    };
    return {
      openInsert: (at) => open({ mode: "insert", at, captures: ["macro", "micro"] }),
      openImage: (imageId) => open({ mode: "image", imageId }),
      openSection: (captures) => open({ mode: "section", captures }),
    };
  }, [valuationId]);

  const resolved = target ? resolveTarget(sections, target) : null;

  const onGenerated = (generated: readonly GeneratedCroquis[], replacements: Partial<Record<CroquisKind, { id: string }>>): CroquisKind[] => {
    if (!target) return generated.map((item) => item.kind);
    if (target.mode === "image") {
      const item = generated[0];
      if (!item || !findCroquisById(sections, target.imageId)) return generated.map((entry) => entry.kind);
      updateSections((current) => withUpdatedCroquis(current, target.imageId, item.src, item.marker).sections);
      return [];
    }
    if (target.mode === "insert") {
      if (!withInsertedCroquis(sections, target.at, generated).imageIds.length) return generated.map((item) => item.kind);
      updateSections((current) => withInsertedCroquis(current, target.at, generated).sections);
      return [];
    }
    const missing = generated
      .map((item) => item.kind)
      .filter((kind) => !sections.some((section) => !section.removed && getCanonicalSectionKey(section.id) === croquisSectionKey(kind)));
    if (missing.length < generated.length) {
      updateSections((current) => withCroquisImages(current, generated.map((item) => ({ ...item, replaceImageId: replacements[item.kind]?.id ?? null }))).sections);
    }
    return missing;
  };

  return (
    <CroquisGeneratorContext.Provider value={api}>
      {children}
      <Dialog open={Boolean(target && resolved)} onOpenChange={(next) => (next ? null : setTarget(null))}>
        <DialogContent
          className="flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none sm:p-0"
          data-croquis-dialog=""
        >
          <div className="border-b px-4 py-3 pr-12">
            <DialogTitle className="text-base">Generador de croquis</DialogTitle>
            <DialogDescription className="text-xs">
              Ubica el inmueble, encuadra cada croquis, resalta calles y acomoda sus letreros; el croquis se guarda como imagen del avalúo, así el dictamen no
              depende de Google.
            </DialogDescription>
          </div>
          {target && resolved && valuationId ? (
            <CroquisGeneratorBody
              key={opening}
              valuationId={valuationId}
              readOnly={readOnly}
              googleMaps={googleMaps}
              address={address}
              captures={resolved.captures}
              onCapturesChange={target.mode === "insert" ? (captures) => setTarget({ ...target, captures }) : undefined}
              markers={resolved.markers}
              destination={resolved.destination}
              onGenerated={onGenerated}
              replacementsFor={target.mode === "section" ? (kinds) => croquisReplacements(sections, kinds) : undefined}
              onUndo={onUndo}
              onDone={() => setTarget(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </CroquisGeneratorContext.Provider>
  );
}

/** What an opening generates, with the markers of the croquis it generates again and where they go. */
function resolveTarget(sections: readonly AppSection[], target: CroquisTarget) {
  if (target.mode === "insert") return { captures: target.captures, markers: {}, destination: placeName(sections, target.at) };
  if (target.mode === "image") {
    const found = findCroquisById(sections, target.imageId);
    if (!found) return null;
    const marker = found.image.croquis;
    return {
      captures: [marker.kind] as const,
      markers: { [marker.kind]: marker } as Partial<Record<CroquisKind, CroquisImageMarker>>,
      destination: `${placeName(sections, found)} (${found.image.title?.trim() || croquisKind(marker.kind).caption})`,
    };
  }
  const markers: Partial<Record<CroquisKind, CroquisImageMarker>> = {};
  for (const kind of target.captures) {
    const image = findCroquisImage(sections, kind);
    if (image?.croquis) markers[kind] = image.croquis;
  }
  const section = sections.find((item) => !item.removed && getCanonicalSectionKey(item.id) === croquisSectionKey(target.captures[0]));
  return { captures: target.captures, markers, destination: section?.title ?? "su sección" };
}

/**
 * The compact access of the Croquis section and of the annex Mapa de
 * comparables, where the map used to sit at full width (V5.7-03): what the
 * section has and a button that opens the generator.
 */
export function CroquisSectionAccess({ captures, sections }: { captures: readonly CroquisKind[]; sections: readonly AppSection[] }) {
  const generator = useCroquisGenerator();
  const comparables = captures.includes("comparables");
  const elsewhere = documentCroquis(sections).filter((entry) => getCanonicalSectionKey(entry.sectionId) !== croquisSectionKey(captures[0])).length;
  const here = captures.filter((kind) => findCroquisImage(sections, kind));
  return (
    <EditorConfigPanel
      title={comparables ? "Mapa de comparables" : "Ubicación y croquis del inmueble"}
      description={
        comparables
          ? "El mapa de comparables toma el pin del inmueble sujeto y los comparables del avalúo que tienen coordenadas."
          : "El generador abre en su propia ventana. También puedes poner un croquis en cualquier bloque con «Agregar → Croquis de localización»."
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" role="status">
          {here.length ? `En esta sección: ${here.map((kind) => croquisKind(kind).title.toLowerCase()).join(" y ")}.` : "Esta sección aún no tiene croquis generado."}
          {elsewhere ? ` Hay ${elsewhere} croquis más en otras secciones.` : ""}
        </p>
        <Button type="button" disabled={!generator} title={generator ? undefined : "Guarda el avalúo para generar croquis."} onClick={() => generator?.openSection(captures)}>
          <MapPinned data-icon="inline-start" />
          {comparables ? "Abrir generador del mapa de comparables" : "Abrir generador de croquis"}
        </Button>
      </div>
    </EditorConfigPanel>
  );
}
