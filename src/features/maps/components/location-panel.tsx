"use client";

/// <reference types="google.maps" />

import { Maximize2, Minimize2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { EditorConfigPanel } from "@/features/valuations/components/editor/editor-config-panel";
import { COMPARABLE_TYPE_LABELS } from "@/features/valuations/calculation/market-types";
import type { ImageContent } from "@/features/valuations/model";
import { api, SessionExpiredError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { SubjectLocationDto } from "@/features/maps/server/subject-location.service";
import type { GeocodingResult } from "@/features/maps/server/geocoding.service";

import { COMPARABLE_PIN_COLORS, DEFAULT_CROQUIS_SETTINGS, croquisKind, type ComparablePin, type CroquisKind, type CroquisSettings } from "../croquis";
import type { CroquisPlacement } from "../croquis-document";
import { loadGoogleMaps } from "../google-maps-loader";
import {
  HIGHLIGHT_TITLES,
  highlightedWays,
  paintFromStreets,
  paintStreet,
  seedPaint,
  streetLabels,
  streetsFromPaint,
  type CategoryKey,
  type StreetHighlights,
} from "../highlights";
import { MAP_CORNERS, MAP_TYPES, NORTH_ARROW_STYLES, frameCenter, frameFromView, sameFraming, type MapCorner, type MapType, type NorthArrowStyle } from "../map-styles";
import { detectStreets, type StreetWay } from "../streets";
import { OSM_ATTRIBUTION } from "../streets-osm";
import type { LatLon } from "../types";
import { NorthArrow } from "./north-arrow";
import { StreetHighlightsPanel } from "./street-highlights";
import type { MapView } from "./subject-map";

const mapLoading = () => <Skeleton className="h-[380px] w-full rounded-none sm:h-[460px]" />;
const SubjectMap = dynamic(() => import("./subject-map").then((module) => module.SubjectMap), { ssr: false, loading: mapLoading });

/** Where the map opens before the subject is placed: Mexico as a whole. */
const MEXICO_VIEW: MapView = { center: [23.6, -102.5], zoom: 5 };
const PLACED_ZOOM = 17;
const NO_STREETS: readonly StreetWay[] = [];

type MapMode = "loading" | "google" | "failed";

export interface GoogleMapsPageConfig {
  /** The browser key; null when maps are not configured on this server. */
  apiKey: string | null;
  /** The request's CSP nonce, which the loader script carries. */
  nonce?: string;
}

export interface LocationPanelProps {
  valuationId: string;
  readOnly: boolean;
  googleMaps: GoogleMapsPageConfig;
  /** The carátula's address, the default search. */
  address: string;
  /** The croquis this section produces: macro and micro in Croquis, the map of comparables in its annex. */
  captures: readonly CroquisKind[];
  /** Puts the stored images in the document in one step of its history; returns the kinds whose section is not in it. */
  onCroquisImages: (placements: readonly CroquisPlacement[]) => CroquisKind[];
  /** MAP-11: the images uploaded by hand that each croquis would replace the first time. */
  croquisReplacements: (kinds: readonly CroquisKind[]) => Partial<Record<CroquisKind, ImageContent>>;
  /** The editor's «Deshacer». */
  onUndo: () => void;
}

/**
 * "Ubicación y croquis del inmueble": the map to place the subject (address
 * search or dragging the pin), the clean map, the north arrow, whether the
 * comparables show, the highlighted streets (etapa 2: the streets around the
 * pin come from OpenStreetMap through the server, the front street is
 * detected and the nearby ones suggested when the pin moves, and the
 * appraiser paints by category), the frame of each croquis and "Aplicar al
 * croquis", which stores each croquis as an image of the valuation and puts
 * it in the section. The pin and the settings save on every change; the
 * images go into the document and are saved with it.
 */
export function LocationPanel({ valuationId, readOnly, googleMaps, address, captures, onCroquisImages, croquisReplacements, onUndo }: LocationPanelProps) {
  const [data, setData] = useState<SubjectLocationDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<MapMode>("loading");
  const [mapProblem, setMapProblem] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [view, setView] = useState<MapView & { key: number }>({ ...MEXICO_VIEW, key: 0 });
  const liveView = useRef<MapView>(MEXICO_VIEW);
  const canEdit = !readOnly && !(data?.locked ?? false);
  /** The streets around the pin, with the cell of the pin they were fetched for; loading while the cell differs. `failed`: the server could not get them. */
  const [loaded, setLoaded] = useState<{ key: string; ways: readonly StreetWay[]; problem: string | null; failed: boolean }>({ key: "", ways: [], problem: null, failed: false });
  /** «Reintentar» bumps it to ask for the same streets again. */
  const [streetsAttempt, setStreetsAttempt] = useState(0);
  /** «Ampliar»: the map fills the screen with the controls beside it (V6.3-07). */
  const [expanded, setExpanded] = useState(false);
  /** MAP-11: the croquis about to be generated would replace images uploaded by hand; the appraiser decides. */
  const [pendingReplace, setPendingReplace] = useState<Partial<Record<CroquisKind, ImageContent>> | null>(null);
  const [category, setCategory] = useState<CategoryKey>("principal");
  /** True after the pin moves: the next streets that arrive seed the front street and the suggestion again. */
  const reseed = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api.valuations.location
      .get(valuationId)
      .then((dto) => {
        if (cancelled) return;
        setData(dto);
        setSearch((current) => current || address || dto.address);
        if (dto.location) setView((v) => ({ center: dto.location!.point, zoom: PLACED_ZOOM, key: v.key + 1 }));
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "No se pudo cargar la ubicación.");
      });
    return () => {
      cancelled = true;
    };
    // The address only seeds the search box the first time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuationId]);

  useEffect(() => {
    if (!googleMaps.apiKey) return;
    const fail = (problem: string) => {
      setMapProblem(problem);
      setMode("failed");
    };
    loadGoogleMaps(googleMaps.apiKey, googleMaps.nonce, () => fail("Google rechazó la llave del navegador")).then(
      () => setMode((current) => (current === "loading" ? "google" : current)),
      () => fail("no se pudo cargar Google Maps"),
    );
  }, [googleMaps.apiKey, googleMaps.nonce]);

  const subject = data?.location?.point ?? null;
  const settings = data?.croquis ?? DEFAULT_CROQUIS_SETTINGS;
  const highlights = settings.streets;
  const withStreets = !captures.includes("comparables");
  const comparables = useMemo<readonly ComparablePin[]>(() => data?.comparables ?? [], [data]);
  const shownPins = useMemo(() => (settings.includeComparables || captures.includes("comparables") ? comparables : []), [settings.includeComparables, captures, comparables]);

  const report = (error: unknown, fallback: string) => {
    if (error instanceof SessionExpiredError) toast.error("Tu sesión expiró. Inicia sesión en otra pestaña y vuelve a intentarlo.");
    else toast.error(error instanceof Error && error.message ? error.message : fallback);
  };

  // MAP-01: the pin and the settings used to save in two requests at once, and the second could carry the old pin.
  // They now go one after the other, and only the last answer replaces what the panel shows: an earlier one would undo a change still on its way.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingSaves = useRef(0);
  const save = useCallback(
    (input: Parameters<typeof api.valuations.location.save>[1]) => {
      pendingSaves.current += 1;
      saveQueue.current = saveQueue.current.then(async () => {
        try {
          const saved = await api.valuations.location.save(valuationId, input);
          if (pendingSaves.current === 1) setData(saved);
        } catch (error) {
          report(error, "No se pudo guardar la ubicación.");
        } finally {
          pendingSaves.current -= 1;
        }
      });
      return saveQueue.current;
    },
    [valuationId],
  );

  const placeSubject = (point: LatLon, source: "busqueda" | "pin", foundAddress: string | null, recenter: boolean) => {
    setData((current) => (current ? { ...current, location: { point, address: foundAddress, source, updatedAt: new Date().toISOString() } } : current));
    if (recenter) setView((v) => ({ center: point, zoom: PLACED_ZOOM, key: v.key + 1 }));
    reseed.current = true;
    void save({ location: { point: [point[0], point[1]], address: foundAddress, source } });
  };

  const updateSettings = (patch: Partial<CroquisSettings>) => {
    const next = { ...settings, ...patch };
    setData((current) => (current ? { ...current, croquis: next } : current));
    void save({ croquis: next });
  };
  const updateHighlights = (patch: Partial<StreetHighlights>) => updateSettings({ streets: { ...highlights, ...patch } });

  // The streets around the pin, through the server; cached there by rounded coordinates, so only a move beyond the cell asks again.
  const subjectKey = subject ? `${subject[0].toFixed(3)},${subject[1].toFixed(3)}` : "";
  useEffect(() => {
    if (!subject || !withStreets) return;
    let cancelled = false;
    api.maps
      .streets(subject)
      .then((dto) => {
        if (!cancelled) setLoaded({ key: subjectKey, ways: dto.ways, problem: dto.ways.length ? null : "OpenStreetMap no tiene calles con nombre alrededor de este punto.", failed: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({ key: subjectKey, ways: [], problem: error instanceof Error && error.message ? error.message : "No se pudieron obtener las calles.", failed: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectKey, withStreets, streetsAttempt]);
  const streets = loaded.key === subjectKey ? loaded.ways : NO_STREETS;
  const streetsLoading = Boolean(subject) && loaded.key !== subjectKey;
  const streetsStatus = !subject ? null : streetsLoading ? "Buscando las calles alrededor del inmueble…" : loaded.problem;
  const streetsFailed = !streetsLoading && loaded.failed;
  const retryStreets = () => {
    setLoaded({ key: "", ways: [], problem: null, failed: false });
    setStreetsAttempt((attempt) => attempt + 1);
  };

  // MAP-04: without streets loaded a click on a street did nothing at all; now it says why.
  const onMapClick = () => {
    if (!canEdit || !withStreets || !subject || streets.length) return;
    if (streetsLoading) toast("Las calles todavía se están cargando; espera unos segundos para marcarlas.");
    else if (streetsFailed) toast.warning("No hay calles cargadas para marcar.", { description: loaded.problem ?? undefined, action: { label: "Reintentar", onClick: retryStreets } });
    else toast("No hay calles con nombre alrededor de este punto para marcar.");
  };

  // The pin moved (or was never detected): the front street and the suggestion come from the streets that arrived.
  useEffect(() => {
    if (!subject || !streets.length || !canEdit) return;
    if (!reseed.current && highlights.front !== null) return;
    reseed.current = false;
    const detection = detectStreets(subject, streets);
    updateHighlights({ front: detection.front, streets: streetsFromPaint(seedPaint(detection, streets)) });
    // Runs when the streets arrive or the pin moves within the streets already loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streets, subject]);

  const highlightedItems = useMemo(
    () => (withStreets ? highlightedWays({ front: highlights.front, paint: paintFromStreets(highlights.streets) }, highlights.styles, streets) : []),
    [withStreets, highlights, streets],
  );
  const labels = useMemo(() => (highlights.names && subject ? streetLabels(highlightedItems, subject) : []), [highlights.names, highlightedItems, subject]);

  const onStreetClick = (name: string) => {
    if (!canEdit) return;
    if (name === highlights.front) {
      toast(`${name} es la calle de frente: siempre se resalta`);
      return;
    }
    const next = paintStreet(paintFromStreets(highlights.streets), name, category, highlights.front);
    updateHighlights({ streets: streetsFromPaint(next) });
    const painted = next.get(name);
    toast(painted ? `${name}: ${HIGHLIGHT_TITLES[painted].toLowerCase()}` : `${name}: ya no se resalta`);
  };

  const removeStreet = (name: string) => updateHighlights({ streets: highlights.streets.filter((street) => street.name !== name) });

  const onSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    if (!query || searching) return;
    setSearching(true);
    setResults([]);
    try {
      const found = await api.maps.geocode(query);
      if (!found.length) toast("No se encontró esa dirección. Prueba con la colonia y el municipio, o arrastra el pin.");
      else if (found.length === 1) {
        placeSubject(found[0].point, "busqueda", found[0].address, true);
        toast.success(`Pin colocado en ${found[0].address}`);
      } else setResults(found);
    } catch (error) {
      report(error, "No se pudo buscar la dirección.");
    } finally {
      setSearching(false);
    }
  };

  const showFrame = (kind: CroquisKind) => {
    if (!subject) return;
    const frame = settings[kind];
    setView((v) => ({ center: frameCenter(frame, subject), zoom: frame.zoom, key: v.key + 1 }));
  };

  const takeFrame = (kind: CroquisKind) => {
    if (!subject) return;
    const frame = frameFromView(liveView.current, subject);
    updateSettings({ [kind]: frame });
    const other = kind === "macro" ? "micro" : kind === "micro" ? "macro" : null;
    if (other && captures.includes(other) && sameFraming(frame, settings[other], subject[0])) {
      toast.warning(`Encuadre de ${croquisKind(kind).title.toLowerCase()} tomado del mapa, igual al de ${croquisKind(other).title.toLowerCase()}`, {
        description: "Los dos croquis saldrán iguales. Acerca o aleja el mapa antes de «Tomar del mapa» si quieres que sean distintos.",
      });
    } else toast(`Encuadre de ${croquisKind(kind).title.toLowerCase()} tomado del mapa`);
  };
  const framesAlike = captures.includes("macro") && captures.includes("micro") && subject !== null && sameFraming(settings.macro, settings.micro, subject[0]);

  const applyToCroquis = () => {
    if (!subject || applying) return;
    const replacements = croquisReplacements(captures);
    if (Object.keys(replacements).length) setPendingReplace(replacements);
    else void generateCroquis({});
  };

  const generateCroquis = async (replacements: Partial<Record<CroquisKind, ImageContent>>) => {
    if (!subject || applying) return;
    setApplying(true);
    try {
      const placements: CroquisPlacement[] = [];
      const omitted: string[] = [];
      for (const kind of captures) {
        const frame = settings[kind];
        const { image, omittedStreets } = await api.valuations.croquis(valuationId, {
          kind,
          center: [...frameCenter(frame, subject)] as [number, number],
          zoom: frame.zoom,
          clean: settings.clean,
          northArrow: settings.northArrow,
          includeComparables: settings.includeComparables,
          streets: highlights,
          mapType: settings.mapType,
        });
        placements.push({ kind, src: image.url, replaceImageId: replacements[kind]?.id ?? null });
        if (omittedStreets.length) omitted.push(`${croquisKind(kind).title}: ${omittedStreets.join(", ")}`);
      }
      const missing = onCroquisImages(placements);
      const placed = placements.filter((item) => !missing.includes(item.kind));
      const replaced = placed.filter((item) => item.replaceImageId);
      const titles = (items: readonly { kind: CroquisKind }[]) => items.map((item) => croquisKind(item.kind).title).join(" y ");
      if (replaced.length) {
        toast.success(`${titles(replaced)}: reemplazó la imagen que estaba en la sección`, {
          description: "Guarda el avalúo para conservarlo. «Deshacer» (o Ctrl+Z) devuelve la imagen anterior.",
          action: { label: "Deshacer", onClick: onUndo },
          duration: 12_000,
        });
      } else if (placed.length) toast.success(`Croquis actualizado: ${titles(placed)}`, { description: "Guarda el avalúo para conservarlo en el documento." });
      if (missing.length) toast.warning(`${titles(missing.map((kind) => ({ kind })))}: la sección no está en el documento, así que la imagen no se colocó.`);
      if (omitted.length) toast.warning("Algunas calles no cupieron en el croquis; quita las más lejanas o acerca el encuadre.", { description: omitted.join(" · ") });
    } catch (error) {
      report(error, "No se pudo generar el croquis.");
    } finally {
      setApplying(false);
    }
  };

  // The expanded map closes with Escape, and the page behind it does not scroll.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) setExpanded(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const title = captures.includes("comparables") ? "Mapa de comparables" : "Ubicación y croquis del inmueble";

  if (!googleMaps.apiKey) {
    return (
      <EditorConfigPanel title={title}>
        <p className="text-sm text-muted-foreground">
          Los mapas no están configurados en este servidor (falta la llave de Google Maps). Mientras tanto, los croquis se agregan como imágenes, como
          cualquier otra.
        </p>
      </EditorConfigPanel>
    );
  }

  const searchForm = (
    <form className="grid gap-1" onSubmit={onSearch}>
      <Label htmlFor={`${valuationId}-address-search`} className="text-xs text-muted-foreground">
        Buscar dirección
      </Label>
      <div className="flex gap-2">
        <Input
          id={`${valuationId}-address-search`}
          placeholder="Calle y número, colonia, municipio"
          value={search}
          disabled={!canEdit}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={!canEdit || searching || !search.trim()}>
          {searching ? "Buscando…" : "Buscar"}
        </Button>
      </div>
      {results.length ? (
        <ul className="grid gap-1 rounded-md border bg-background p-1 text-sm" aria-label="Direcciones encontradas">
          {results.map((result) => (
            <li key={`${result.point[0]},${result.point[1]}`}>
              <button
                type="button"
                className="w-full rounded px-2 py-1 text-left hover:bg-muted"
                onClick={() => {
                  setResults([]);
                  placeSubject(result.point, "busqueda", result.address, true);
                  toast.success(`Pin colocado en ${result.address}`);
                }}
              >
                {result.address}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );

  const replaceTitles = pendingReplace
    ? (Object.entries(pendingReplace) as [CroquisKind, ImageContent][]).map(([kind, image]) => `${croquisKind(kind).title} en lugar de «${image.title?.trim() || "la imagen subida"}»`)
    : [];

  return (
    <EditorConfigPanel
      title={title}
      description={
        captures.includes("comparables")
          ? "El mapa de comparables toma el pin del inmueble sujeto y los comparables del avalúo que tienen coordenadas."
          : "Busca la dirección o arrastra el pin rojo; las coordenadas se guardan solas. Encuadra el mapa como quieras que salga cada croquis y pulsa «Aplicar al croquis»."
      }
    >
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
      {mode === "failed" ? (
        <p className="text-sm text-muted-foreground" role="status">
          El mapa no se pudo mostrar ({mapProblem}). Revisa la llave y sus restricciones en Google Cloud (docs/OPERACION.md, sección 7).
        </p>
      ) : null}

      {expanded ? null : searchForm}

      <div
        className={cn(expanded ? "fixed inset-0 z-50 flex flex-col bg-background lg:flex-row" : "contents")}
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded ? true : undefined}
        aria-label={expanded ? title : undefined}
      >
        <div className={cn("relative isolate overflow-hidden bg-background", expanded ? "min-h-[45vh] flex-1" : "rounded-lg border")}>
          {mode === "google" ? (
            <SubjectMap
              subject={subject}
              onSubjectMove={canEdit ? (point) => placeSubject(point, "pin", null, false) : undefined}
              clean={settings.clean}
              mapType={settings.mapType}
              pins={shownPins}
              streets={canEdit && withStreets ? streets : NO_STREETS}
              highlights={highlightedItems}
              labels={labels}
              onStreetClick={onStreetClick}
              onMapClick={onMapClick}
              view={view}
              onViewChange={(next) => {
                liveView.current = next;
              }}
              className={expanded ? "absolute inset-0 h-full w-full" : undefined}
            />
          ) : mode === "loading" ? (
            mapLoading()
          ) : null}
          {mode === "google" ? <NorthArrow {...settings.northArrow} size={56} /> : null}
          {mode === "google" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn("absolute bottom-3 z-10 gap-1.5 bg-background/95 shadow-sm", settings.northArrow.corner === "bottom-left" ? "right-14" : "left-3")}
              onClick={() => setExpanded((on) => !on)}
              aria-pressed={expanded}
            >
              {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
              {expanded ? "Reducir" : "Ampliar"}
            </Button>
          ) : null}
        </div>

        <div className={cn(expanded ? "grid content-start gap-3 overflow-y-auto border-t bg-muted/60 p-4 lg:w-[460px] lg:shrink-0 lg:border-t-0 lg:border-l dark:bg-muted/40" : "contents")}>
          {expanded ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{title}</h3>
                <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded(false)}>
                  <Minimize2 aria-hidden="true" />
                  Cerrar
                </Button>
              </div>
              {searchForm}
            </>
          ) : null}

          <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-[13px]">
            <dt className="text-muted-foreground">Coordenadas</dt>
            <dd className="font-mono text-xs">{subject ? `${subject[0].toFixed(6)}, ${subject[1].toFixed(6)}` : data ? "Sin ubicar" : "Cargando…"}</dd>
            {data?.location?.address ? (
              <>
                <dt className="text-muted-foreground">Encontrado en</dt>
                <dd className="text-xs [overflow-wrap:anywhere]">{data.location.address}</dd>
              </>
            ) : null}
          </dl>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
            <span className="inline-flex items-center gap-1.5">
              <Label htmlFor={`${valuationId}-map-type`} className="text-xs text-muted-foreground">
                Vista
              </Label>
              <NativeSelect
                id={`${valuationId}-map-type`}
                size="sm"
                value={settings.mapType}
                disabled={!canEdit}
                onChange={(event) => updateSettings({ mapType: event.target.value as MapType })}
              >
                {MAP_TYPES.map((type) => (
                  <NativeSelectOption key={type.key} value={type.key}>
                    {type.title}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </span>
            <Label className="font-normal">
              <Checkbox checked={settings.clean} disabled={!canEdit || settings.mapType !== "roadmap"} onCheckedChange={(on) => updateSettings({ clean: on === true })} /> Mapa limpio
            </Label>
            {captures.includes("comparables") ? null : (
              <Label className="font-normal">
                <Checkbox checked={settings.includeComparables} disabled={!canEdit} onCheckedChange={(on) => updateSettings({ includeComparables: on === true })} />{" "}
                Incluir comparables
              </Label>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Label htmlFor={`${valuationId}-north-style`} className="text-xs text-muted-foreground">
                Norte
              </Label>
              <NativeSelect
                id={`${valuationId}-north-style`}
                size="sm"
                value={settings.northArrow.style}
                disabled={!canEdit}
                onChange={(event) => updateSettings({ northArrow: { ...settings.northArrow, style: event.target.value as NorthArrowStyle } })}
              >
                {NORTH_ARROW_STYLES.map((style) => (
                  <NativeSelectOption key={style.key} value={style.key}>
                    {style.title}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label="Esquina del norte"
                size="sm"
                value={settings.northArrow.corner}
                disabled={!canEdit}
                onChange={(event) => updateSettings({ northArrow: { ...settings.northArrow, corner: event.target.value as MapCorner } })}
              >
                {MAP_CORNERS.map((corner) => (
                  <NativeSelectOption key={corner.key} value={corner.key}>
                    {corner.title}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </span>
          </div>

          <div className="grid gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Encuadres</span>
            {captures.map((kind) => (
              <div key={kind} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="min-w-36 font-medium">{croquisKind(kind).title}</span>
                <span className="text-xs text-muted-foreground tabular-nums">zoom {settings[kind].zoom}</span>
                <Button type="button" size="sm" variant="outline" disabled={!subject || mode !== "google"} onClick={() => showFrame(kind)}>
                  Ver encuadre
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={!canEdit || !subject || mode !== "google"} onClick={() => takeFrame(kind)}>
                  Tomar del mapa
                </Button>
              </div>
            ))}
            {framesAlike ? (
              <p className="rounded-md border border-highlight/45 bg-highlight/15 px-2 py-1.5 text-xs text-foreground" role="status">
                Macrolocalización y microlocalización tienen el mismo encuadre (zoom {settings.macro.zoom}), así que los dos croquis saldrán iguales. Acerca el mapa y
                pulsa «Tomar del mapa» en microlocalización si quieres que sean distintos.
              </p>
            ) : null}
          </div>

          {withStreets ? (
            <StreetHighlightsPanel
              value={highlights}
              category={category}
              onCategoryChange={setCategory}
              onChange={updateHighlights}
              onRemove={removeStreet}
              status={streetsStatus}
              onRetry={streetsFailed ? retryStreets : undefined}
              disabled={!canEdit || !subject}
              attribution={OSM_ATTRIBUTION}
            />
          ) : null}

          {shownPins.length ? (
            <ul className="grid gap-0.5 text-xs text-muted-foreground" aria-label="Comparables en el mapa">
              {shownPins.map((pin) => (
                <li key={pin.id} className="inline-flex items-center gap-1.5">
                  <span className="inline-block size-2.5 rounded-full" style={{ background: COMPARABLE_PIN_COLORS[pin.type] }} />
                  <span className="font-semibold text-foreground">{pin.label}</span> {COMPARABLE_TYPE_LABELS[pin.type]} · {pin.location}
                </li>
              ))}
            </ul>
          ) : comparables.length === 0 ? (
            <p className="text-xs text-muted-foreground">Ningún comparable del avalúo tiene coordenadas todavía; captúralas en su ficha para verlos en el mapa.</p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {subject
                ? "«Aplicar al croquis» guarda cada croquis como imagen del avalúo y la coloca en la sección; después edítala como cualquier imagen."
                : "Ubica el inmueble para poder generar los croquis."}
            </p>
            <Button type="button" disabled={!canEdit || !subject || applying} onClick={applyToCroquis}>
              {applying ? "Generando…" : captures.includes("comparables") ? "Generar mapa de comparables" : "Aplicar al croquis"}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={pendingReplace !== null} onOpenChange={(open) => (open ? null : setPendingReplace(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reemplazar la imagen actual?</AlertDialogTitle>
            <AlertDialogDescription>
              La sección ya tiene una imagen subida a mano. Puedes poner el mapa generado en su lugar ({replaceTitles.join("; ")}) o agregarlo junto a ella. Si la
              reemplazas, «Deshacer» la devuelve antes de guardar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPendingReplace(null);
                void generateCroquis({});
              }}
            >
              Agregar junto a ella
            </Button>
            <AlertDialogAction
              onClick={() => {
                const replacements = pendingReplace ?? {};
                setPendingReplace(null);
                void generateCroquis(replacements);
              }}
            >
              Reemplazar la imagen actual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </EditorConfigPanel>
  );
}
