"use client";

/// <reference types="google.maps" />

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
import { COMPARABLE_TYPE_LABELS } from "@/features/valuations/calculation/market-types";
import type { ImageContent } from "@/features/valuations/model";
import { api, SessionExpiredError } from "@/lib/api-client";
import type { SubjectLocationDto } from "@/features/maps/server/subject-location.service";
import type { GeocodingResult } from "@/features/maps/server/geocoding.service";

import {
  COMPARABLES_FRAME,
  COMPARABLE_PIN_COLORS,
  CROQUIS_KINDS,
  DEFAULT_CROQUIS_SETTINGS,
  comparablesFitFrame,
  croquisKind,
  includesComparables,
  pinsOutsideFrame,
  type ComparablePin,
  type CroquisKind,
  type CroquisLabelPlacements,
  type CroquisSettings,
} from "../croquis";
import type { GeneratedCroquis } from "../croquis-document";
import type { CroquisImageMarker } from "../croquis-marker";
import { croquisStreets } from "../croquis-streets";
import {
  DEFAULT_FREE_LINE_STYLE,
  addDraftPoint,
  finishFreeLine,
  newFreeLineId,
  undoDraftPoint,
  withLineName,
  withLinePoints,
  withLineStyle,
  withoutLine,
  type FreeLine,
  type FreeLineStyle,
} from "../free-lines";
import { loadGoogleMaps } from "../google-maps-loader";
import {
  HIGHLIGHT_TITLES,
  highlightedWays,
  paintFromStreets,
  paintStreet,
  seedPaint,
  streetsFromPaint,
  withMovedLabel,
  type CategoryKey,
  type StreetHighlights,
  type StreetLabel,
} from "../highlights";
import {
  MAP_CORNERS,
  MAP_TYPES,
  NORTH_ARROW_STYLES,
  SATELLITE_NOTICE,
  frameCenter,
  frameFromView,
  isScreenOnlyMapType,
  sameFraming,
  type CroquisFrame,
  type MapCorner,
  type MapType,
  type NorthArrowStyle,
} from "../map-styles";
import { STATIC_MAP_SIZE } from "../static-map";
import { detectStreets, metersPerPixel, type StreetWay } from "../streets";
import { OSM_ATTRIBUTION, boxContains, mergedStreetWays, viewStreetMaxRank, viewStreetsBox, type ViewBounds } from "../streets-osm";
import { preferredStreetName, renamedHighlights, renamedWays, unifiedHighlights } from "../street-names";
import type { LatLon } from "../types";
import { CroquisDoneNotice, CroquisFramesSection, ScreenOnlyMapNotice, generationFrame } from "./croquis-generator-parts";
import { CroquisLabelEditor } from "./croquis-label-editor";
import { FreeLinesPanel } from "./free-lines-panel";
import { NorthArrow } from "./north-arrow";
import { StreetHighlightsPanel } from "./street-highlights";
import type { MapView } from "./subject-map";

const mapLoading = () => <Skeleton className="h-full min-h-[45vh] w-full rounded-none" />;
const SubjectMap = dynamic(() => import("./subject-map").then((module) => module.SubjectMap), { ssr: false, loading: mapLoading });

/** Where the map opens before the subject is placed: Mexico as a whole. */
const MEXICO_VIEW: MapView = { center: [23.6, -102.5], zoom: 5 };
const NO_STREETS: readonly StreetWay[] = [];
/** The names placed by hand save this long after the last move, not on every step of a drag. */
const LABELS_SAVE_DELAY_MS = 600;
/** Two clicks closer than this many screen pixels are one vertex (a double click's two clicks). */
const SAME_VERTEX_PIXELS = 4;
/** The frame the map shows saves this long after the map stops, not on every step of a pan. */
const FRAME_SAVE_DELAY_MS = 800;
/** The streets of the view load this long after the map stops. */
const VIEW_STREETS_DELAY_MS = 350;
/** A free line's name saves this long after the last key. */
const LINE_NAME_SAVE_DELAY_MS = 600;

/** Two frames the same but for the rounding of a map's report. */
const sameFrame = (a: CroquisFrame, b: CroquisFrame) => a.zoom === b.zoom && Math.abs(a.offset[0] - b.offset[0]) < 1e-7 && Math.abs(a.offset[1] - b.offset[1]) < 1e-7;

type MapMode = "loading" | "google" | "failed";

export interface GoogleMapsPageConfig {
  /** The browser key; null when maps are not configured on this server. */
  apiKey: string | null;
  /** The request's CSP nonce: only a fallback, the loader takes the document's (google-maps-loader.ts). */
  nonce?: string;
}

/** What «Agregar → Croquis de localización» lets the appraiser choose. */
export const CROQUIS_CHOICES: readonly { key: string; title: string; kinds: readonly CroquisKind[] }[] = [
  { key: "macro-micro", title: "Macro y microlocalización (lado a lado)", kinds: ["macro", "micro"] },
  { key: "macro", title: "Macrolocalización", kinds: ["macro"] },
  { key: "micro", title: "Microlocalización", kinds: ["micro"] },
  { key: "comparables", title: "Mapa de comparables", kinds: ["comparables"] },
];

export interface CroquisGeneratorBodyProps {
  valuationId: string;
  readOnly: boolean;
  googleMaps: GoogleMapsPageConfig;
  /** The carátula's address, the default search. */
  address: string;
  /** The croquis this opening generates. */
  captures: readonly CroquisKind[];
  /** «Agregar → Croquis»: the appraiser chooses which croquis go in. */
  onCapturesChange?: (kinds: readonly CroquisKind[]) => void;
  /** The markers of the croquis being generated again: their frame and street names. */
  markers: Partial<Record<CroquisKind, CroquisImageMarker>>;
  /** Where the images go, as the appraiser reads it ("Terreno › Información del terreno"). */
  destination: string;
  /** Puts the stored images in the document in one step of its history; returns the kinds that could not be placed. `asNew`: beside the image it was opened from, not in its place. */
  onGenerated: (generated: readonly GeneratedCroquis[], replacements: Partial<Record<CroquisKind, ImageContent>>, options?: { asNew?: boolean }) => CroquisKind[];
  /** Opened from one croquis: «Agregar como croquis nuevo» keeps it and puts the new one beside it. */
  canAddAsNew?: boolean;
  /** «Generar otro croquis» (video 8.5, 8:34): the next croquis goes beside the last one, with the same streets, lines and frames. */
  onGenerateAnother?: (captures: readonly CroquisKind[]) => void;
  /** MAP-11, the section's own access: the images uploaded by hand that each croquis would replace the first time. */
  replacementsFor?: (kinds: readonly CroquisKind[]) => Partial<Record<CroquisKind, ImageContent>>;
  /** The editor's «Deshacer». */
  onUndo: () => void;
  /** Called once the croquis are in the document. */
  onDone: () => void;
}

/**
 * The croquis generator, inside its window (V5.7-03, nov 2026): the map to
 * place the subject (address search or dragging the pin), the street map or
 * the satellite photo, the clean map, the north arrow, whether the
 * comparables show, the highlighted streets (etapa 2: the streets around the
 * pin come from OpenStreetMap through the server, the front street is
 * detected and the nearby ones suggested when the pin moves, and the
 * appraiser paints by category), the frame of each croquis, its street
 * names («Letreros»: they follow their street and can be moved and turned)
 * and «Generar croquis de localización», which stores each croquis as an
 * image of the valuation and puts it where it was asked for. The pin and the
 * settings save on every change; the frame and the names of each croquis go
 * with its image, saved with the document.
 */
export function CroquisGeneratorBody({
  valuationId,
  readOnly,
  googleMaps,
  address,
  captures,
  onCapturesChange,
  markers,
  destination,
  onGenerated,
  replacementsFor,
  canAddAsNew = false,
  onGenerateAnother,
  onUndo,
  onDone,
}: CroquisGeneratorBodyProps) {
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
  /** MAP-11: the croquis about to be generated would replace images uploaded by hand; the appraiser decides. */
  const [pendingReplace, setPendingReplace] = useState<Partial<Record<CroquisKind, ImageContent>> | null>(null);
  /** FAL-35: the croquis about to be generated would replace one generated before; the appraiser confirms. */
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [category, setCategory] = useState<CategoryKey>("principal");
  /** True after the pin moves: the next streets that arrive seed the front street and the suggestion again. */
  const reseed = useRef(false);
  /** The frame and the names of each croquis of this opening, as the appraiser leaves them; they go with its image. */
  const [frames, setFrames] = useState<Partial<Record<CroquisKind, CroquisFrame>>>(() =>
    Object.fromEntries(Object.entries(markers).flatMap(([kind, marker]) => (marker?.frame ? [[kind, marker.frame]] : []))),
  );
  // The names of a croquis generated again are its own; the others start from the valuation's (FAL-35), once they load.
  const [placements, setPlacements] = useState<CroquisLabelPlacements>(() =>
    Object.fromEntries(Object.entries(markers).map(([kind, marker]) => [kind, marker?.labels ?? []])),
  );
  /**
   * The croquis the map is framing (video 8.5, 11:03: the image must be what
   * the screen shows). The dashed box over the map is its image; moving or
   * zooming the map moves its frame. With macro and micro, «Encuadrar en el
   * mapa» on the other one switches to it.
   */
  const [activeKind, setActiveKind] = useState<CroquisKind>(captures[0]);
  const active = captures.includes(activeKind) ? activeKind : captures[0];
  /** A move of the map the generator asked for: its report is not the appraiser framing. */
  const pendingMove = useRef<{ center: LatLon; zoom: number; at: number } | null>(null);
  /** The first frame was shown: from then on the map's moves are the active croquis' frame. */
  const framing = useRef(false);
  /** After «Generar», what went where; the generator stays open for another (video 8.5, 7:35). */
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.valuations.location
      .get(valuationId)
      .then((dto) => {
        if (cancelled) return;
        setData(dto);
        setPlacements((current) => {
          const next = { ...current };
          for (const { kind } of CROQUIS_KINDS) if (!next[kind]) next[kind] = dto.croquis.labels[kind] ?? [];
          return next;
        });
        setSearch((current) => current || address || dto.address);
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
  /** The settings as last changed, so changes made one right after another (or from a toast's «Deshacer») build on each other. */
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  // V7.1-22: the map of comparables has its streets too, as the croquis.
  const withStreets = captures.length > 0;
  const comparables = useMemo<readonly ComparablePin[]>(() => data?.comparables ?? [], [data]);
  const includes = (kind: CroquisKind) => includesComparables(kind, settings);
  const anyIncludes = captures.some(includes);
  const shownPins = useMemo(() => (anyIncludes ? comparables : []), [anyIncludes, comparables]);
  /**
   * The frame of each croquis: the one it was generated with, else the
   * valuation's. FAL-10: the map of comparables still on its default frame
   * takes the one that shows every comparable.
   */
  const frameOf = (kind: CroquisKind) => {
    const own = frames[kind];
    if (own) return own;
    const stored = settings[kind];
    const untouched = stored.zoom === COMPARABLES_FRAME.zoom && stored.offset[0] === 0 && stored.offset[1] === 0;
    return kind === "comparables" && untouched && subject && comparables.length ? comparablesFitFrame(subject, comparables) : stored;
  };

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
    if (recenter) {
      // A new place: every croquis of this opening centers on it, at the zoom it had, and the map shows the one it frames.
      const centered = Object.fromEntries(captures.map((kind) => [kind, { offset: [0, 0] as LatLon, zoom: frameOf(kind).zoom }])) as Partial<Record<CroquisKind, CroquisFrame>>;
      setFrames((current) => ({ ...current, ...centered }));
      updateSettings(centered);
      framing.current = true;
      moveMapTo(centered[active] ?? frameOf(active), point);
    } else if (framing.current && mode === "google") {
      // The pin moved under the box: the box stays where it is on the map, so the frame keeps what the screen shows.
      changeFrame(active, frameFromView(liveView.current, point));
    }
    reseed.current = true;
    void save({ location: { point: [point[0], point[1]], address: foundAddress, source } });
  };

  const updateSettings = (patch: Partial<CroquisSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setData((current) => (current ? { ...current, croquis: next } : current));
    void save({ croquis: next });
  };

  // The streets around the pin, through the server; cached there by rounded coordinates, so only a move beyond the cell asks again.
  const subjectKey = subject ? `${subject[0].toFixed(3)},${subject[1].toFixed(3)}` : "";
  useEffect(() => {
    if (!subject || !withStreets) return;
    let cancelled = false;
    api.maps
      .streets(subject)
      .then((dto) => {
        if (!cancelled) setLoaded({ key: subjectKey, ways: dto.ways, problem: dto.ways.length ? null : "OpenStreetMap no tiene calles con nombre en esta zona.", failed: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({ key: subjectKey, ways: [], problem: error instanceof Error && error.message ? error.message : "No se pudieron obtener las calles.", failed: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectKey, withStreets, streetsAttempt]);
  /* The streets of what the map shows (video 8.5, 4:01): an avenue far from the pin can be painted too. */
  const [viewStreets, setViewStreets] = useState<{ box: ViewBounds; rank: number; names: string; ways: readonly StreetWay[] } | null>(null);
  const viewStreetsRef = useRef(viewStreets);
  const viewRequest = useRef("");
  const viewTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (viewTimer.current !== null) window.clearTimeout(viewTimer.current);
  }, []);
  /** The highlighted streets come whole in the view's answer, whatever their class, so the map shows them as the croquis prints them. */
  const highlightedNamesRef = useRef<string[]>([]);
  const loadViewStreets = (bounds: ViewBounds, zoom: number) => {
    if (!withStreets) return;
    if (viewTimer.current !== null) window.clearTimeout(viewTimer.current);
    viewTimer.current = window.setTimeout(() => {
      viewTimer.current = null;
      const rank = viewStreetMaxRank(zoom);
      const highlighted = highlightedNamesRef.current;
      const names = highlighted.join("|");
      const current = viewStreetsRef.current;
      if (current && current.rank >= rank && current.names === names && boxContains(current.box, bounds)) return;
      const box = viewStreetsBox(bounds);
      const key = `${box.flat().join(",")}|${rank}|${names}`;
      if (viewRequest.current === key) return;
      viewRequest.current = key;
      api.maps.streetsInView(bounds, zoom, highlighted).then(
        (dto) => {
          if (viewRequest.current !== key) return;
          viewStreetsRef.current = { box, rank, names, ways: dto.ways };
          setViewStreets(viewStreetsRef.current);
        },
        // The streets around the pin are still there; the next move of the map asks again.
        () => {
          if (viewRequest.current === key) viewRequest.current = "";
        },
      );
    }, VIEW_STREETS_DELAY_MS);
  };
  const aroundStreets = loaded.key === subjectKey ? loaded.ways : NO_STREETS;
  const osmStreets = useMemo(() => (viewStreets ? mergedStreetWays(aroundStreets, viewStreets.ways) : aroundStreets), [aroundStreets, viewStreets]);
  // FAL-35: the subject's street with the address's spelling, everywhere the generator shows it, as the server draws it.
  const savedAddress = data?.address ?? "";
  const streetRename = useMemo(() => preferredStreetName(new Set(osmStreets.map((way) => way.n)), savedAddress), [osmStreets, savedAddress]);
  const streets = useMemo(() => renamedWays(osmStreets, streetRename), [osmStreets, streetRename]);
  const highlights = useMemo(() => renamedHighlights(unifiedHighlights(settings.streets, osmStreets), streetRename), [settings.streets, osmStreets, streetRename]);
  const updateHighlights = (patch: Partial<StreetHighlights>) => updateSettings({ streets: { ...highlights, ...patch } });
  // A street painted (or the pin's front street) loads whole in the view the next time the map stops, or now.
  const highlightedNames = useMemo(() => [...new Set([...(highlights.front ? [highlights.front] : []), ...highlights.streets.map((street) => street.name)])].sort(), [highlights]);
  const highlightedKey = highlightedNames.join("|");
  useEffect(() => {
    highlightedNamesRef.current = highlightedNames;
    const view = liveView.current as MapView & { bounds?: ViewBounds };
    if (view.bounds) loadViewStreets(view.bounds, view.zoom);
    // The names, not the list's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedKey]);
  const streetsLoading = Boolean(subject) && loaded.key !== subjectKey;
  const streetsStatus = !subject ? null : streetsLoading ? "Buscando las calles alrededor del inmueble…" : loaded.problem;
  const streetsFailed = !streetsLoading && loaded.failed;
  const retryStreets = () => {
    setLoaded({ key: "", ways: [], problem: null, failed: false });
    setStreetsAttempt((attempt) => attempt + 1);
  };

  // MAP-04: without streets loaded a click on a street did nothing at all; now it says why.
  const onMapClick = () => {
    if (draftRef.current) return;
    if (!canEdit || !withStreets || !subject || streets.length) return;
    if (streetsLoading) toast("Las calles todavía se están cargando; espera unos segundos para marcarlas.");
    else if (streetsFailed) toast.warning("No hay calles cargadas para marcar.", { description: loaded.problem ?? undefined, action: { label: "Reintentar", onClick: retryStreets } });
    else toast("No hay calles con nombre alrededor de este punto para marcar.");
  };

  // The pin moved (or was never detected): the front street and the suggestion come from the streets around it, once they arrived.
  useEffect(() => {
    if (!subject || !streets.length || !canEdit || loaded.key !== subjectKey) return;
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
  /** What each croquis prints of the streets and the free lines' names, at its frame: the same pure function the server draws with. */
  const croquisOf = (kind: CroquisKind, around: LatLon) => {
    const frame = frameOf(kind);
    const center = frameCenter(frame, around);
    const drawn = croquisStreets(kind, center, frame.zoom, highlights, withStreets ? streets : NO_STREETS, around, {
      placements: placements[kind],
      pins: includes(kind) ? comparables.map((pin) => pin.point) : [],
      lines: settings.lines,
      corner: settings.northArrow.corner,
    });
    return { frame, center, streets: drawn };
  };
  // The names on the map are the ones the framed croquis prints, where it prints them (turned too: video 8.5, 5:28).
  const labels = subject ? croquisOf(active, subject).streets.labels : [];

  // FAL-35: the names placed by hand save with the valuation's settings, a moment after the last move.
  const placementsRef = useRef(placements);
  const labelsSaveTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (labelsSaveTimer.current !== null) window.clearTimeout(labelsSaveTimer.current);
  }, []);
  const changePlacements = (patch: CroquisLabelPlacements) => {
    const next = { ...placementsRef.current, ...patch };
    placementsRef.current = next;
    setPlacements(next);
    if (!canEdit) return;
    if (labelsSaveTimer.current !== null) window.clearTimeout(labelsSaveTimer.current);
    labelsSaveTimer.current = window.setTimeout(() => {
      labelsSaveTimer.current = null;
      updateSettings({ labels: { ...settingsRef.current.labels, ...placementsRef.current } });
    }, LABELS_SAVE_DELAY_MS);
  };
  /** A name dragged on the map: it goes there in every croquis of this opening. */
  const moveLabel = (label: StreetLabel, point: LatLon) => {
    changePlacements(Object.fromEntries(captures.map((kind) => [kind, withMovedLabel(placementsRef.current[kind] ?? [], label, point)])));
    toast(`Letrero «${label.name}» acomodado`, { description: "Así sale en el croquis. «Seguir la calle» en «Letreros» lo regresa a su calle." });
  };

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

  /* «Trazo libre»: the line being drawn lives here until it is finished; the finished lines save with the settings. */
  const [draft, setDraftState] = useState<LatLon[] | null>(null);
  /** The same line, read by the map's double click right after its two clicks, before the panel renders again. */
  const draftRef = useRef<LatLon[] | null>(null);
  const setDraft = (next: LatLon[] | null) => {
    draftRef.current = next;
    setDraftState(next);
  };
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [lineStyle, setLineStyle] = useState<FreeLineStyle>(DEFAULT_FREE_LINE_STYLE);
  const freeLines = settings.lines;
  const updateLines = (next: FreeLine[]) => updateSettings({ lines: next });
  const sameVertexMeters = () => metersPerPixel(liveView.current.zoom, liveView.current.center[0]) * SAME_VERTEX_PIXELS;

  const startLine = () => {
    if (!canEdit) return;
    setSelectedLine(null);
    setDraft([]);
  };
  const addLinePoint = (point: LatLon) => {
    if (draftRef.current) setDraft(addDraftPoint(draftRef.current, point, sameVertexMeters()));
  };
  const undoLinePoint = () => {
    if (draftRef.current) setDraft(undoDraftPoint(draftRef.current));
  };
  const cancelLine = () => setDraft(null);
  const finishLine = () => {
    const current = draftRef.current;
    if (!current) return;
    const lines = settingsRef.current.lines;
    const id = newFreeLineId(lines);
    const next = finishFreeLine(lines, current, lineStyle, id, sameVertexMeters());
    if (!next) {
      toast("Un trazo necesita al menos dos puntos distintos; sigue tocando el mapa o pulsa «Cancelar».");
      return;
    }
    updateLines(next);
    setDraft(null);
    setSelectedLine(id);
    toast.success(`Trazo ${next.length} agregado`, { description: "Arrastra sus puntos para ajustarlo, o cambia su color y grosor." });
  };
  const removeLine = (id: string) => {
    const lines = settingsRef.current.lines;
    const index = lines.findIndex((line) => line.id === id);
    if (index < 0) return;
    const removed = lines[index];
    updateLines(withoutLine(lines, id));
    if (selectedLine === id) setSelectedLine(null);
    toast(`Trazo ${index + 1} quitado`, {
      action: {
        label: "Deshacer",
        onClick: () => {
          const current = settingsRef.current.lines.filter((line) => line.id !== removed.id);
          updateLines([...current.slice(0, index), removed, ...current.slice(index)]);
        },
      },
    });
  };

  /** The name of a line shows at once on the map and in «Letreros»; it saves a moment after the last key. */
  const lineNameTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (lineNameTimer.current !== null) window.clearTimeout(lineNameTimer.current);
  }, []);
  const renameLine = (id: string, name: string) => {
    const next = withLineName(settingsRef.current.lines, id, name);
    settingsRef.current = { ...settingsRef.current, lines: next };
    setData((current) => (current ? { ...current, croquis: settingsRef.current } : current));
    if (lineNameTimer.current !== null) window.clearTimeout(lineNameTimer.current);
    lineNameTimer.current = window.setTimeout(() => {
      lineNameTimer.current = null;
      void save({ croquis: settingsRef.current });
    }, LINE_NAME_SAVE_DELAY_MS);
  };

  // Enter finishes the line being drawn, Esc cancels it (and not the window), Retroceso takes its last vertex back.
  const drawing = draft !== null;
  const keyActions = useRef({ finishLine, cancelLine, undoLinePoint });
  useEffect(() => {
    keyActions.current = { finishLine, cancelLine, undoLinePoint };
  });
  useEffect(() => {
    if (!drawing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        keyActions.current.cancelLine();
      } else if (event.key === "Enter" && !typing && !target?.closest("button")) {
        event.preventDefault();
        keyActions.current.finishLine();
      } else if (event.key === "Backspace" && !typing) {
        event.preventDefault();
        keyActions.current.undoLinePoint();
      }
    };
    // Capture on the window runs before the dialog's own Esc, which would close the generator.
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [drawing]);

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

  /** Moves the map to a frame around this point; the map's report of that move is not taken as the appraiser framing. */
  const moveMapTo = (frame: CroquisFrame, around: LatLon) => {
    const center = frameCenter(frame, around);
    pendingMove.current = { center, zoom: frame.zoom, at: Date.now() };
    setView((v) => ({ center, zoom: frame.zoom, key: v.key + 1 }));
  };

  // The map opens on the frame of the croquis it frames, not on a zoom of its own (video 8.5, 11:03).
  useEffect(() => {
    if (framing.current || !data || !subject) return;
    framing.current = true;
    moveMapTo(frameOf(active), subject);
    // Once, when the pin first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, subject]);

  /** «Encuadrar en el mapa»: the map shows this croquis' frame and from then on moves it. */
  const frameOnMap = (kind: CroquisKind) => {
    setActiveKind(kind);
    if (subject) moveMapTo(frameOf(kind), subject);
  };

  /** The frame of a croquis changes on the screen at once and saves a moment after the map stops: the next croquis of this kind starts from it. */
  const frameSaveTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (frameSaveTimer.current !== null) window.clearTimeout(frameSaveTimer.current);
  }, []);
  const changeFrame = (kind: CroquisKind, frame: CroquisFrame) => {
    setFrames((current) => ({ ...current, [kind]: frame }));
    if (!canEdit) return;
    if (frameSaveTimer.current !== null) window.clearTimeout(frameSaveTimer.current);
    frameSaveTimer.current = window.setTimeout(() => {
      frameSaveTimer.current = null;
      updateSettings({ [kind]: frame });
    }, FRAME_SAVE_DELAY_MS);
  };

  /** The map stopped: its box loads its streets, and where the appraiser left it is the frame of the croquis it frames. */
  const onViewChange = (next: MapView & { bounds?: ViewBounds }) => {
    liveView.current = next;
    if (next.bounds) loadViewStreets(next.bounds, next.zoom);
    const pending = pendingMove.current;
    if (pending) {
      // One map pixel at that zoom, in degrees: the map reports the center it was given within that.
      const pixel = 360 / (256 * 2 ** pending.zoom);
      const arrived = Math.round(next.zoom) === pending.zoom && Math.abs(next.center[0] - pending.center[0]) <= pixel && Math.abs(next.center[1] - pending.center[1]) <= pixel;
      if (arrived || Date.now() - pending.at > 2000) pendingMove.current = null;
      if (arrived) return;
    }
    if (!framing.current || !subject || !canEdit) return;
    const frame = frameFromView(next, subject);
    if (!sameFrame(frame, frameOf(active))) changeFrame(active, frame);
  };

  /** FAL-10: the frame that shows the subject and every comparable, for this croquis; the map moves to it. */
  const fitComparables = (kind: CroquisKind) => {
    if (!subject || !comparables.length) return;
    const frame = comparablesFitFrame(subject, comparables);
    setActiveKind(kind);
    setFrames((current) => ({ ...current, [kind]: frame }));
    updateSettings({ [kind]: frame });
    moveMapTo(frame, subject);
    toast(`Encuadre de ${croquisKind(kind).title.toLowerCase()} ajustado a los ${comparables.length} comparables (zoom ${frame.zoom})`);
  };

  const framesAlike = captures.includes("macro") && captures.includes("micro") && subject !== null && sameFraming(frameOf("macro"), frameOf("micro"), subject[0]);

  /** The croquis of this opening already generated, which the new ones replace. */
  const regenerated = captures.filter((kind) => markers[kind]);
  const applyToCroquis = () => {
    if (!subject || applying) return;
    const replacements = replacementsFor?.(captures) ?? {};
    if (Object.keys(replacements).length) setPendingReplace(replacements);
    else if (regenerated.length) setConfirmRegenerate(true);
    else void generateCroquis({});
  };

  const generateCroquis = async (replacements: Partial<Record<CroquisKind, ImageContent>>, options: { asNew?: boolean } = {}) => {
    if (!subject || applying) return;
    setApplying(true);
    setDone(null);
    // The croquis the map frames is exactly what the screen shows now, even if the map has not stopped yet (video 8.5, 11:03).
    const onScreen = framing.current && mode === "google" && !pendingMove.current ? frameFromView(liveView.current, subject) : null;
    try {
      const generated: GeneratedCroquis[] = [];
      const omitted: string[] = [];
      const outside: string[] = [];
      for (const kind of captures) {
        const frame = generationFrame(kind, active, onScreen, frameOf(kind));
        const labelPlacements = placements[kind] ?? [];
        const { image, omittedStreets, omittedPins } = await api.valuations.croquis(valuationId, {
          kind,
          center: [...frameCenter(frame, subject)] as [number, number],
          zoom: frame.zoom,
          clean: settings.clean,
          northArrow: settings.northArrow,
          includeComparables: includes(kind),
          streets: highlights,
          mapType: settings.mapType,
          labels: labelPlacements,
          lines: settings.lines,
        });
        generated.push({ kind, src: image.url, marker: { kind, frame, ...(labelPlacements.length ? { labels: labelPlacements } : {}) } });
        if (omittedStreets.length) omitted.push(`${croquisKind(kind).title}: ${omittedStreets.join(", ")}`);
        if (omittedPins.length) outside.push(`${croquisKind(kind).title}: ${omittedPins.length} de ${comparables.length} (${omittedPins.join(", ")})`);
      }
      const missing = onGenerated(generated, replacements, options);
      const placed = generated.filter((item) => !missing.includes(item.kind));
      const replaced = placed.filter((item) => replacements[item.kind]);
      const titles = (items: readonly { kind: CroquisKind }[]) => items.map((item) => croquisKind(item.kind).title).join(" y ");
      if (onScreen) changeFrame(active, onScreen);
      if (placed.length) {
        const how = replaced.length || (regenerated.length && !options.asNew) ? "reemplazó al anterior en" : options.asNew ? "agregado junto al anterior en" : "colocado en";
        setDone(`${titles(placed)}: ${how} ${destination}.`);
      }
      if (replaced.length) {
        toast.success(`${titles(replaced)}: reemplazó la imagen que estaba en la sección`, {
          description: "Guarda el avalúo para conservarlo. «Deshacer» (o Ctrl+Z) devuelve la imagen anterior.",
          action: { label: "Deshacer", onClick: onUndo },
          duration: 12_000,
        });
      } else if (placed.length && regenerated.length && !options.asNew) {
        toast.success(`${titles(placed)}: reemplazó al que estaba en ${destination}`, {
          description: "Guarda el avalúo para conservarlo. «Deshacer» (o Ctrl+Z) devuelve el anterior.",
          action: { label: "Deshacer", onClick: onUndo },
          duration: 12_000,
        });
      } else if (placed.length) toast.success(`Croquis listo en ${destination}: ${titles(placed)}`, { description: "Guarda el avalúo para conservarlo en el documento." });
      if (missing.length) toast.warning(`${titles(missing.map((kind) => ({ kind })))}: su lugar ya no está en el documento, así que la imagen no se colocó.`);
      if (omitted.length) toast.warning("Algunas calles no cupieron en el croquis; quita las más lejanas o acerca el encuadre.", { description: omitted.join(" · ") });
      if (outside.length) {
        toast.warning("Algunos comparables quedaron fuera del encuadre y no salen en la imagen.", {
          description: `${outside.join(" · ")}. Pulsa «Encuadrar los comparables» o aleja el mapa hasta que queden dentro del recuadro.`,
          duration: 12_000,
        });
      }
      if (placed.length && isScreenOnlyMapType(settings.mapType)) toast.info("El croquis se guardó con el mapa de calles", { description: SATELLITE_NOTICE, duration: 12_000 });
    } catch (error) {
      report(error, "No se pudo generar el croquis.");
    } finally {
      setApplying(false);
    }
  };

  const generatesComparables = captures.length === 1 && captures[0] === "comparables";

  if (!googleMaps.apiKey) {
    return (
      <div className="grid gap-2 p-6">
        <p className="text-sm text-muted-foreground">
          Los mapas no están configurados en este servidor (falta la llave de Google Maps). Mientras tanto, los croquis se agregan como imágenes, como
          cualquier otra.
        </p>
      </div>
    );
  }

  const replaceTitles = pendingReplace
    ? (Object.entries(pendingReplace) as [CroquisKind, ImageContent][]).map(([kind, image]) => `${croquisKind(kind).title} en lugar de «${image.title?.trim() || "la imagen subida"}»`)
    : [];
  const choice = CROQUIS_CHOICES.find((item) => item.kinds.join() === captures.join())?.key ?? CROQUIS_CHOICES[0].key;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row" data-croquis-generator="">
      <div className="relative isolate min-h-[45vh] flex-1 overflow-hidden bg-muted lg:min-h-0">
        {mode === "google" ? (
          <SubjectMap
            subject={subject}
            onSubjectMove={canEdit ? (point) => placeSubject(point, "pin", null, false) : undefined}
            clean={settings.clean}
            mapType={settings.mapType}
            pins={shownPins}
            streets={canEdit && withStreets && !drawing ? streets : NO_STREETS}
            highlights={highlightedItems}
            labels={labels}
            onLabelMove={canEdit && !drawing ? moveLabel : undefined}
            onStreetClick={onStreetClick}
            onMapClick={onMapClick}
            freeLines={freeLines}
            draft={draft}
            draftStyle={lineStyle}
            selectedLineId={selectedLine}
            onDrawPoint={addLinePoint}
            onDrawFinish={finishLine}
            onLineSelect={setSelectedLine}
            onLinePointsChange={canEdit ? (id, points) => updateLines(withLinePoints(settingsRef.current.lines, id, points)) : undefined}
            view={view}
            onViewChange={onViewChange}
            className="absolute inset-0 h-full w-full"
          />
        ) : mode === "loading" ? (
          mapLoading()
        ) : (
          <div className="flex h-full min-h-[45vh] items-center justify-center p-6 text-center" role="status">
            <p className="max-w-md text-sm text-muted-foreground">
              El mapa no se pudo mostrar ({mapProblem}). Revisa la llave y sus restricciones en Google Cloud (docs/OPERACION.md, sección 7). Los letreros y la
              configuración de la derecha siguen disponibles.
            </p>
          </div>
        )}
        {mode === "google" ? <NorthArrow {...settings.northArrow} size={56} /> : null}
        {mode === "google" && subject ? (
          // The image of the croquis the map frames, at its size in map pixels: what is inside is what prints.
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-dashed border-primary"
            style={{ width: STATIC_MAP_SIZE.width, height: STATIC_MAP_SIZE.height, boxShadow: "0 0 0 200vmax color-mix(in oklab, var(--foreground) 16%, transparent)" }}
            data-croquis-frame-box={active}
          >
            <span className="absolute top-1 left-1 rounded-sm bg-background/90 px-1.5 py-0.5 text-[11px] font-medium text-foreground tabular-nums">
              {croquisKind(active).title} · zoom {frameOf(active).zoom}
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 content-start gap-3 overflow-y-auto border-t bg-muted/60 p-4 pb-0 lg:w-[480px] lg:shrink-0 lg:border-t-0 lg:border-l dark:bg-muted/40">
        <p className="text-xs text-muted-foreground">
          Se coloca en <span className="font-medium text-foreground">{destination}</span>.
        </p>
        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

        {onCapturesChange ? (
          <div className="grid gap-1">
            <Label htmlFor={`${valuationId}-croquis-choice`} className="text-xs text-muted-foreground">
              Qué croquis
            </Label>
            <NativeSelect
              id={`${valuationId}-croquis-choice`}
              value={choice}
              disabled={applying}
              onChange={(event) => onCapturesChange(CROQUIS_CHOICES.find((item) => item.key === event.target.value)?.kinds ?? ["macro", "micro"])}
            >
              {CROQUIS_CHOICES.map((item) => (
                <NativeSelectOption key={item.key} value={item.key}>
                  {item.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ) : null}

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

        <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-[13px]">
          <dt className="text-muted-foreground">Coordenadas</dt>
          <dd className="font-mono text-xs tabular-nums">{subject ? `${subject[0].toFixed(6)}, ${subject[1].toFixed(6)}` : data ? "Sin ubicar" : "Cargando…"}</dd>
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
              Vista en pantalla
            </Label>
            <NativeSelect id={`${valuationId}-map-type`} size="sm" value={settings.mapType} disabled={!canEdit} onChange={(event) => updateSettings({ mapType: event.target.value as MapType })}>
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
          {generatesComparables ? (
            <Label className="font-normal">
              <Checkbox checked={settings.comparablesOnMap} disabled={!canEdit} onCheckedChange={(on) => updateSettings({ comparablesOnMap: on === true })} /> Incluir
              comparables
            </Label>
          ) : (
            <Label className="font-normal">
              <Checkbox checked={settings.includeComparables} disabled={!canEdit} onCheckedChange={(on) => updateSettings({ includeComparables: on === true })} /> Incluir
              comparables
            </Label>
          )}
          <ScreenOnlyMapNotice mapType={settings.mapType} />
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

        <CroquisFramesSection
          rows={captures.map((kind) => {
            const frame = frameOf(kind);
            // FAL-10: the comparables this frame leaves out, said before generating.
            return { kind, zoom: frame.zoom, outside: subject && includes(kind) ? pinsOutsideFrame(frameCenter(frame, subject), frame.zoom, comparables) : [] };
          })}
          active={active}
          placed={subject !== null}
          mapReady={mode === "google"}
          comparables={comparables.length}
          canEdit={canEdit}
          alikeZoom={framesAlike ? frameOf("macro").zoom : null}
          onFrameOnMap={frameOnMap}
          onFitComparables={fitComparables}
        />

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

        <FreeLinesPanel
          lines={freeLines}
          draft={draft}
          nextStyle={lineStyle}
          selectedId={selectedLine}
          onStart={startLine}
          onUndoPoint={undoLinePoint}
          onFinish={finishLine}
          onCancel={cancelLine}
          onSelect={setSelectedLine}
          onNextStyleChange={(patch) => setLineStyle((current) => ({ ...current, ...patch }))}
          onLineStyleChange={(id, patch) => updateLines(withLineStyle(settingsRef.current.lines, id, patch))}
          onLineNameChange={renameLine}
          onRemove={removeLine}
          disabled={!canEdit || !subject || mode !== "google"}
        />

        {subject
          ? captures.map((kind) => {
              const croquis = croquisOf(kind, subject);
              return (
                <CroquisLabelEditor
                  key={kind}
                  title={croquisKind(kind).title}
                  center={croquis.center}
                  zoom={croquis.frame.zoom}
                  subject={subject}
                  streets={croquis.streets}
                  placements={placements[kind] ?? []}
                  lines={freeLines}
                  disabled={!canEdit}
                  onChange={(next) => changePlacements({ [kind]: next })}
                />
              );
            })
          : null}

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

        <div className="sticky bottom-0 -mx-4 grid gap-2 border-t bg-background p-4">
          {done ? (
            <CroquisDoneNotice
              message={done}
              onClose={onDone}
              onAnother={
                onGenerateAnother
                  ? () => {
                      setDone(null);
                      onGenerateAnother(captures);
                      toast("El siguiente croquis se agrega junto al anterior", { description: "Cambia el encuadre, la vista o las calles y pulsa «Generar croquis de localización»." });
                    }
                  : undefined
              }
            />
          ) : null}
          <p className="text-xs text-muted-foreground">
            {subject
              ? "Cada croquis se dibuja con el mapa de OpenStreetMap (el de Google solo se ve aquí, en pantalla), se guarda como imagen del avalúo y se coloca en su lugar; después edítalo como cualquier imagen o vuelve a abrir este generador desde ella."
              : "Ubica el inmueble (busca la dirección o arrastra el pin) para poder generar los croquis."}
          </p>
          <Button type="button" disabled={!canEdit || !subject || applying} onClick={applyToCroquis}>
            {applying ? "Generando…" : generatesComparables ? "Generar mapa de comparables" : "Generar croquis de localización"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{generatesComparables ? "¿Reemplazar el mapa de comparables actual?" : "¿Reemplazar el croquis actual?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {regenerated.map((kind) => croquisKind(kind).title).join(" y ")} ya está en {destination}. El nuevo toma su lugar con el mismo pie y tamaño; «Deshacer» (o
              Ctrl+Z) devuelve el anterior antes de guardar.
              {canAddAsNew ? " Si quieres conservarlo, agrega el nuevo junto a él." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {canAddAsNew ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setConfirmRegenerate(false);
                  void generateCroquis({}, { asNew: true });
                }}
              >
                Agregar como croquis nuevo
              </Button>
            ) : null}
            <AlertDialogAction
              onClick={() => {
                setConfirmRegenerate(false);
                void generateCroquis({});
              }}
            >
              Reemplazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </div>
  );
}
