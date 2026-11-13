"use client";

/// <reference types="google.maps" />

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  ALL_LAYERS,
  COMPARABLE_TYPES,
  DEMO_BOUNDS,
  NAMED_WAYS,
  STREET_NAMES,
  SUBJECT_START,
  comparableDestinations,
  comparableType,
  comparablesWithinRadius,
  detectStreets,
  findStreet,
  formatMoney,
  generateComparables,
  isInsideDemoArea,
  passesFilters,
  summarizeNames,
  type ComparableKind,
  type DemoComparable,
  type LatLon,
} from "../geo";
import { loadGoogleMaps } from "@/features/maps/google-maps-loader";
import {
  DEFAULT_HIGHLIGHT_STYLES,
  HIGHLIGHT_TITLES,
  STREET_CATEGORIES,
  WEIGHT_RANGE,
  highlightedWays,
  isMacroZoom,
  paintStreet,
  seedPaint,
  streetLabels,
  type CategoryKey,
  type HighlightKey,
  type HighlightStyle,
  type HighlightStyles,
  type StreetPaint,
} from "@/features/maps/highlights";
import {
  DEFAULT_NORTH_ARROW,
  MACRO_FRAME,
  MAP_CORNERS,
  MICRO_FRAME,
  NORTH_ARROW_STYLES,
  frameFromView,
  type MapCorner,
  type NorthArrow as NorthArrowConfig,
  type NorthArrowStyle,
} from "@/features/maps/map-styles";
import { DictamenPreview, type CroquisSnapshot } from "./dictamen-preview";
import type { MapViewProps, MapViewState, Stage } from "./map-view";
import { NorthArrow } from "@/features/maps/components/north-arrow";

const mapLoading = () => <Skeleton className="h-[420px] w-full rounded-none sm:h-[560px]" />;
const LeafletMapView = dynamic(() => import("./leaflet-map"), { ssr: false, loading: mapLoading });
const GoogleMapView = dynamic(() => import("./google-map"), { ssr: false, loading: mapLoading });

const STAGES: { value: Stage; title: string; subtitle: string }[] = [
  { value: "etapa-1", title: "Etapa 1", subtitle: "Ubicación y croquis" },
  { value: "etapa-2", title: "Etapa 2", subtitle: "Calles resaltadas" },
  { value: "etapa-3", title: "Etapa 3", subtitle: "Mapa de comparables" },
];

/** Same seed, same 34 comparables on every visit. */
const COMPARABLES = generateComparables();
const START_DETECTION = detectStreets(SUBJECT_START, NAMED_WAYS);
const START_PAINT = seedPaint(START_DETECTION, NAMED_WAYS);

type MapMode = "loading" | "google" | "leaflet";

// The stage lives in the URL hash (#etapa-2), like the prototype.
function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readStage = (hash: string): Stage => (STAGES.some((s) => `#${s.value}` === hash) ? (hash.slice(1) as Stage) : "etapa-1");

const firstValue = (value: number | readonly number[]) => (Array.isArray(value) ? value[0] : (value as number));
const parsePrice = (text: string) => {
  const value = Number(text.replace(/[^\d.]/g, ""));
  return text.trim() && Number.isFinite(value) ? value : null;
};

export function DemoMaps({ googleMapsKey, nonce }: { googleMapsKey: string | null; nonce: string | undefined }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const stage = readStage(useSyncExternalStore(subscribeHash, () => window.location.hash, () => ""));

  const [mode, setMode] = useState<MapMode>(googleMapsKey ? "loading" : "leaflet");
  const [googleProblem, setGoogleProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!googleMapsKey) return;
    const fallBack = (problem: string) => {
      setGoogleProblem(problem);
      setMode("leaflet");
    };
    loadGoogleMaps(googleMapsKey, nonce, () => fallBack("Google rechazó la llave")).then(
      () => setMode((current) => (current === "loading" ? "google" : current)),
      () => fallBack("no se pudo cargar"),
    );
  }, [googleMapsKey, nonce]);

  const [subject, setSubject] = useState<LatLon>(SUBJECT_START);
  const detection = useMemo(() => detectStreets(subject, NAMED_WAYS), [subject]);
  const [paint, setPaint] = useState<StreetPaint>(START_PAINT);
  const [category, setCategory] = useState<CategoryKey>("principal");
  const [styles, setStyles] = useState<HighlightStyles>(DEFAULT_HIGHLIGHT_STYLES);
  const [showNames, setShowNames] = useState(true);
  const [clean, setClean] = useState(true);
  const [northArrow, setNorthArrow] = useState<NorthArrowConfig>(DEFAULT_NORTH_ARROW);
  const [view, setView] = useState({ center: SUBJECT_START, zoom: 17, key: 0 });
  const [framing, setFraming] = useState<15 | 17>(17);
  const liveView = useRef<MapViewState>({ center: SUBJECT_START, zoom: 17 });
  const [search, setSearch] = useState("");

  const [layers, setLayers] = useState<Record<ComparableKind, boolean>>(ALL_LAYERS);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [onlyCurrent, setOnlyCurrent] = useState(false);
  const [showValuations, setShowValuations] = useState(false);
  const [radius, setRadius] = useState(600);
  const [selected, setSelected] = useState<DemoComparable | null>(null);
  const [destination, setDestination] = useState("");
  const [popupHost] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));

  const filters = useMemo(
    () => ({ layers, minPrice: parsePrice(minPrice), maxPrice: parsePrice(maxPrice), onlyCurrent }),
    [layers, minPrice, maxPrice, onlyCurrent],
  );
  const shown = useMemo(() => COMPARABLES.filter((c) => passesFilters(c, filters)), [filters]);
  const near = useMemo(() => comparablesWithinRadius(shown, subject, radius), [shown, subject, radius]);

  const highlights = useMemo(() => highlightedWays({ front: detection.front, paint }, styles, NAMED_WAYS), [detection.front, paint, styles]);
  const labels = useMemo(() => (showNames ? streetLabels(highlights, subject) : []), [showNames, highlights, subject]);

  const moveSubject = useCallback((point: LatLon, recenter: boolean) => {
    setSubject(point);
    setPaint(seedPaint(detectStreets(point, NAMED_WAYS), NAMED_WAYS));
    if (recenter) setView((v) => ({ center: point, zoom: 17, key: v.key + 1 }));
  }, []);

  const onStreetClick = useCallback(
    (name: string) => {
      if (stage !== "etapa-2") return;
      if (name === detection.front) {
        toast(`${name} es la calle de frente: siempre se resalta`);
        return;
      }
      const next = paintStreet(paint, name, category, detection.front);
      setPaint(next);
      const painted = next.get(name);
      toast(painted ? `${name}: ${HIGHLIGHT_TITLES[painted].toLowerCase()}` : `${name}: ya no se resalta`);
    },
    [stage, detection.front, paint, category],
  );

  const selectComparable = useCallback((comparable: DemoComparable | null) => {
    setSelected(comparable);
    setDestination(comparable ? comparableDestinations(comparable)[0] : "");
  }, []);

  const placeOnStreet = (query: string) => {
    const found = findStreet(query);
    if (!found) {
      toast("No encontré esa calle en la zona de la demostración");
      return;
    }
    moveSubject(found.point, true);
    toast(`Pin colocado sobre ${found.name}`);
  };

  const onSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    if (mode === "google") {
      try {
        const [[south, west], [north, east]] = DEMO_BOUNDS;
        const { results } = await new google.maps.Geocoder().geocode({
          address: query,
          bounds: { south, west, north, east },
          componentRestrictions: { country: "MX" },
        });
        const location = results[0]?.geometry.location;
        if (location && isInsideDemoArea([location.lat(), location.lng()])) {
          moveSubject([location.lat(), location.lng()], true);
          toast(`Pin colocado en ${results[0].formatted_address}`);
          return;
        }
        // The street data of the demo only covers Loma Bonita: further away, try the street by name.
        if (location && !findStreet(query)) {
          toast("Esa dirección queda fuera de la zona de la demostración (Loma Bonita, Zapopan)");
          return;
        }
      } catch {
        // Not found or the Geocoding API is not enabled: search the demo streets by name.
      }
    }
    placeOnStreet(query);
  };

  // What the croquis would carry if "Generar croquis de localización" were pressed now; the preview only changes when it is.
  const liveKey = useMemo(
    () => JSON.stringify({ subject, paint: [...paint], styles, showNames, clean, northArrow, comparables: shown.map((c) => c.ref) }),
    [subject, paint, styles, showNames, clean, northArrow, shown],
  );
  const [applied, setApplied] = useState<{ key: string; snapshot: CroquisSnapshot }>(() => ({
    key: liveKey,
    snapshot: {
      subject: SUBJECT_START,
      front: START_DETECTION.front,
      macro: MACRO_FRAME,
      micro: MICRO_FRAME,
      highlights: highlightedWays({ front: START_DETECTION.front, paint: START_PAINT }, DEFAULT_HIGHLIGHT_STYLES, NAMED_WAYS),
      names: true,
      clean: true,
      northArrow: DEFAULT_NORTH_ARROW,
      comparables: COMPARABLES,
    },
  }));
  const pending = applied.key !== liveKey;

  const applyToCroquis = () => {
    const frame = frameFromView(liveView.current, subject);
    const macro = isMacroZoom(frame.zoom);
    setApplied((previous) => ({
      key: liveKey,
      snapshot: {
        subject,
        front: detection.front,
        macro: macro ? frame : previous.snapshot.macro,
        micro: macro ? previous.snapshot.micro : frame,
        highlights,
        names: showNames,
        clean,
        northArrow,
        comparables: shown,
      },
    }));
    toast.success("Croquis actualizado", { description: `Encuadre ${macro ? "macro" : "micro"} tomado del mapa, con resaltados y norte.` });
  };

  const mapProps: MapViewProps = {
    stage,
    subject,
    onSubjectMove: (point) => moveSubject(point, false),
    highlights: stage === "etapa-2" ? highlights : [],
    labels: stage === "etapa-2" ? labels : [],
    onStreetClick,
    clean,
    comparables: shown,
    radius,
    showValuations,
    selected: stage === "etapa-3" ? selected : null,
    onSelect: selectComparable,
    popupHost,
    view,
    onViewChange: (next) => {
      liveView.current = next;
    },
    dark,
  };

  const setStage = (value: Stage) => {
    window.location.hash = value;
  };

  const updateStyle = (key: HighlightKey, patch: Partial<HighlightStyle>) => setStyles((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

  const legendItems = (() => {
    const items: { label: string; swatch: React.ReactNode }[] = [{ label: "Inmueble sujeto", swatch: <Dot color="#c0392b" /> }];
    if (stage === "etapa-2") {
      for (const key of Object.keys(HIGHLIGHT_TITLES) as HighlightKey[]) {
        if (styles[key].on && highlights.some((item) => item.key === key)) {
          items.push({ label: HIGHLIGHT_TITLES[key], swatch: <span className="inline-block h-1 w-5 rounded-sm" style={{ background: styles[key].color }} /> });
        }
      }
    } else if (stage === "etapa-3") {
      for (const type of COMPARABLE_TYPES) items.push({ label: type.name, swatch: <Dot color={type.color} /> });
      items.push({ label: "Pin hueco: oferta vencida", swatch: <Dot color="#ffffff" border="#64748b" /> });
      if (showValuations) items.push({ label: "Mis avalúos (ejemplo)", swatch: <span className="inline-block size-2.5 rounded-[2px] bg-[#0b3a5b]" /> });
    } else if (mode !== "google") {
      items.push({ label: "Avenidas", swatch: <span className="inline-block h-1 w-5 rounded-sm bg-[#d9b766]" /> });
    }
    return items;
  })();

  const paintedNames = (key: CategoryKey) => {
    const names = new Set([...paint].filter(([, value]) => value === key).map(([name]) => name));
    return names.size ? summarizeNames(names) : "Ninguna";
  };

  return (
    <main className="mx-auto grid max-w-[1240px] gap-4 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Valuaxis · demostración</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-balance">Mapas en tu avalúo</h1>
          <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
            Así funcionarían los mapas en tres etapas. Las calles son reales (Loma Bonita, Zapopan); el inmueble sujeto, los comparables, sus anuncios y
            los avalúos son de ejemplo. Nada de lo que hagas aquí se guarda.
          </p>
        </div>
        <Badge variant="outline">Datos de ejemplo</Badge>
      </header>

      {mode === "leaflet" && (
        <p className="text-xs text-muted-foreground" role="status">
          {googleMapsKey ? `Vista sin Google Maps (${googleProblem ?? "no se pudo cargar"})` : "Vista sin Google Maps (falta configurar la llave)"}
        </p>
      )}

      <Tabs value={stage} onValueChange={(value) => setStage(value as Stage)}>
        <TabsList variant="line" aria-label="Etapas" className="h-auto! flex-wrap">
          {STAGES.map((s) => (
            <TabsTrigger key={s.value} value={s.value} className="h-auto flex-none flex-col items-start gap-0 px-3 py-1.5">
              <span className="font-semibold">{s.title}</span>
              <span className="text-[11.5px] font-normal">{s.subtitle}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-2 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="grid min-w-0 gap-4">
            <div className="grid gap-2 rounded-xl border bg-card p-2.5 text-card-foreground">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                <Label className="font-normal">
                  <Checkbox checked={clean} onCheckedChange={(on) => setClean(on === true)} disabled={mode === "leaflet"} /> Mapa limpio
                </Label>
                <span className="inline-flex items-center gap-1.5">
                  <Label htmlFor="demo-north-style" className="text-xs text-muted-foreground">
                    Norte
                  </Label>
                  <NativeSelect id="demo-north-style" size="sm" value={northArrow.style} onChange={(event) => setNorthArrow((n) => ({ ...n, style: event.target.value as NorthArrowStyle }))}>
                    {NORTH_ARROW_STYLES.map((style) => (
                      <NativeSelectOption key={style.key} value={style.key}>
                        {style.title}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <NativeSelect aria-label="Esquina del norte" size="sm" value={northArrow.corner} onChange={(event) => setNorthArrow((n) => ({ ...n, corner: event.target.value as MapCorner }))}>
                    {MAP_CORNERS.map((corner) => (
                      <NativeSelectOption key={corner.key} value={corner.key}>
                        {corner.title}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </span>
              </div>
              {mode === "leaflet" && (
                <p className="text-xs text-muted-foreground">
                  Sin Google Maps el mapa se dibuja solo con las calles, así que no muestra negocios; con teselas de OpenStreetMap no se podrían quitar. «Mapa
                  limpio» aplica al mapa de Google y a los croquis del dictamen.
                </p>
              )}
            </div>

            <div className="relative isolate overflow-hidden rounded-xl border">
              {mode === "loading" ? mapLoading() : mode === "google" ? <GoogleMapView {...mapProps} /> : <LeafletMapView {...mapProps} />}
              <NorthArrow {...northArrow} size={56} />
              <div className={`pointer-events-none absolute ${mode === "google" ? "bottom-8" : "bottom-2.5"} left-2.5 z-[500] grid max-w-[calc(100%-20px)] gap-1 rounded-lg border bg-card/95 px-2.5 py-2 text-xs text-card-foreground`}>
                {legendItems.map((item) => (
                  <span key={item.label} className="inline-flex items-center gap-1.5">
                    {item.swatch}
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            <section className="grid gap-2.5 rounded-xl border bg-card p-4 text-card-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-[15px] font-semibold">Así sale en el dictamen</h2>
                  <p className="text-xs text-muted-foreground" role="status">
                    {pending ? "Hay cambios en el mapa que todavía no están en el croquis." : "El croquis está al día con el mapa."}
                  </p>
                </div>
                <Button variant={pending ? "default" : "outline"} size="sm" onClick={applyToCroquis}>
                  Generar croquis de localización
                </Button>
              </div>
              <DictamenPreview apiKey={mode === "leaflet" ? null : googleMapsKey} stage={stage} snapshot={applied.snapshot} />
              <Note>
                «Generar croquis de localización» fija en el dictamen el encuadre actual del mapa (en el croquis macro hasta zoom 16, en el micro a partir de 17), las
                vialidades resaltadas, sus nombres y el norte. Hasta entonces el croquis no cambia.
              </Note>
            </section>
          </div>

          <aside className="grid min-w-0 gap-3.5 rounded-xl border bg-card p-3.5 text-card-foreground">
            <TabsContent value="etapa-1" className="grid gap-3.5">
              <PanelTitle title="Ubicar el inmueble sujeto">
                {mode === "google" ? "Busca la dirección o arrastra el pin rojo." : "Busca la calle o arrastra el pin rojo."} Las coordenadas se guardan solas.
              </PanelTitle>
              <form className="grid gap-1" onSubmit={onSearch}>
                <Label htmlFor="demo-street-search" className="text-xs text-muted-foreground">
                  {mode === "google" ? "Buscar dirección o calle" : "Buscar calle"}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="demo-street-search"
                    list="demo-street-names"
                    placeholder="Ej. Calle Perla"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <Button type="submit" variant="outline">
                    Buscar
                  </Button>
                </div>
                <datalist id="demo-street-names">
                  {STREET_NAMES.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </form>
              <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-0.5 text-[13px]">
                <dt className="text-muted-foreground">Frente a</dt>
                <dd className="font-mono text-xs [overflow-wrap:anywhere]">{detection.front ?? "—"}</dd>
                <dt className="text-muted-foreground">Latitud</dt>
                <dd className="font-mono text-xs">{subject[0].toFixed(6)}</dd>
                <dt className="text-muted-foreground">Longitud</dt>
                <dd className="font-mono text-xs">{subject[1].toFixed(6)}</dd>
              </dl>
              <div className="grid gap-1">
                <span className="text-xs font-semibold text-muted-foreground">Encuadre</span>
                <div className="flex gap-2">
                  {([15, 17] as const).map((zoom) => (
                    <Button
                      key={zoom}
                      variant={framing === zoom ? "secondary" : "outline"}
                      aria-pressed={framing === zoom}
                      onClick={() => {
                        setFraming(zoom);
                        setView((v) => ({ center: subject, zoom, key: v.key + 1 }));
                      }}
                    >
                      {zoom === 15 ? "Macro" : "Micro"}
                    </Button>
                  ))}
                </div>
              </div>
              <Note>Encuadra el mapa como quieras que salga (mueve y acerca) y pulsa «Generar croquis de localización». Cada encuadre, macro o micro, se guarda por separado.</Note>
            </TabsContent>

            <TabsContent value="etapa-2" className="grid gap-3.5">
              <PanelTitle title="Resaltar vialidades">
                Elige una categoría y toca las calles del mapa para pintarlas con ella; tócalas de nuevo para quitarlas. Con el encuadre macro solo se tocan
                las avenidas.
              </PanelTitle>
              <StyleRow title={HIGHLIGHT_TITLES.front} names={detection.front ?? "—"} style={styles.front} onChange={(patch) => updateStyle("front", patch)} />
              <div role="radiogroup" aria-label="Categoría para pintar" className="grid gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Categoría para pintar</span>
                {STREET_CATEGORIES.map((item) => (
                  <StyleRow
                    key={item.key}
                    title={item.title}
                    names={paintedNames(item.key)}
                    style={styles[item.key]}
                    onChange={(patch) => updateStyle(item.key, patch)}
                    selected={category === item.key}
                    onSelect={() => setCategory(item.key)}
                  />
                ))}
              </div>
              <Label className="text-[13px] font-normal">
                <Checkbox checked={showNames} onCheckedChange={(on) => setShowNames(on === true)} /> Mostrar nombres
              </Label>
              <Note>
                Al mover el pin se proponen de nuevo las avenidas cercanas y las calles colindantes. Colores, grosor y nombres quedan guardados en el avalúo y así
                se imprimen en el croquis; en el macro solo salen las avenidas.
              </Note>
            </TabsContent>

            <TabsContent value="etapa-3" className="grid gap-3.5">
              <PanelTitle title="Tu base de comparables">Pasa el cursor por un pin para ver su ficha; tócalo para agregarlo al avalúo.</PanelTitle>
              <div className="grid gap-1">
                <span className="text-xs font-semibold text-muted-foreground">Capas</span>
                <div className="overflow-hidden rounded-lg border">
                  {COMPARABLE_TYPES.map((type) => (
                    <label key={type.kind} className="grid cursor-pointer grid-cols-[auto_auto_1fr_auto] items-center gap-2 border-t px-2.5 py-1.5 text-[13px] first:border-t-0">
                      <Checkbox checked={layers[type.kind]} onCheckedChange={(on) => setLayers((l) => ({ ...l, [type.kind]: on }))} />
                      <Dot color={type.color} />
                      <span>{type.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{shown.filter((c) => c.kind === type.kind).length}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Filtros</span>
                <div className="flex gap-2">
                  <Input inputMode="numeric" placeholder="Precio mín." aria-label="Precio mínimo" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
                  <Input inputMode="numeric" placeholder="Precio máx." aria-label="Precio máximo" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
                </div>
                <Label className="text-[13px] font-normal">
                  <Checkbox checked={onlyCurrent} onCheckedChange={setOnlyCurrent} /> Solo vigentes
                </Label>
                <Label className="text-[13px] font-normal">
                  <Checkbox checked={showValuations} onCheckedChange={setShowValuations} /> Mostrar mis avalúos
                </Label>
              </div>
              <div className="grid gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  Radio alrededor del sujeto: <span className="font-mono">{radius.toLocaleString("es-MX")} m</span>
                </span>
                <Slider min={200} max={1500} step={50} value={[radius]} onValueChange={(value) => setRadius(firstValue(value))} aria-label="Radio alrededor del sujeto" />
              </div>
              <div className="grid gap-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  {near.length} comparables dentro de {radius.toLocaleString("es-MX")} m
                </span>
                <div className="grid max-h-[230px] gap-1.5 overflow-auto">
                  {near.length ? (
                    near.map(({ comparable, distance }) => (
                      <Button
                        key={comparable.ref}
                        variant="outline"
                        className="h-auto justify-start gap-2 py-1.5 text-left font-normal whitespace-normal"
                        onClick={() => {
                          setView((v) => ({ center: [comparable.lat, comparable.lon], zoom: 17, key: v.key + 1 }));
                          selectComparable(comparable);
                        }}
                      >
                        <ComparableDot color={comparableType(comparable.kind).color} current={comparable.current} />
                        <span className="min-w-0 flex-1">
                          <span className="font-mono text-xs font-medium">{comparable.ref}</span> · {Math.round(distance)} m
                          <small className="block text-muted-foreground">
                            {comparableType(comparable.kind).name} · {comparable.current ? "vigente" : "vencido"}
                          </small>
                        </span>
                        <span className="font-mono text-xs tabular-nums">{formatMoney(comparable.price)}</span>
                      </Button>
                    ))
                  ) : (
                    <p className="text-[13px] text-muted-foreground">Ninguno con estos filtros. Amplía el radio o quita un filtro.</p>
                  )}
                </div>
              </div>
            </TabsContent>
          </aside>
        </div>
      </Tabs>

      <p className="text-[11px] text-muted-foreground">
        Calles: © colaboradores de OpenStreetMap (ODbL).{mode === "google" ? " Mapa base: Google Maps." : ""} Demostración: el inmueble, los anuncios y los avalúos son
        ficticios.
      </p>

      {popupHost &&
        selected &&
        stage === "etapa-3" &&
        createPortal(
          <div className="grid min-w-[210px] gap-2 text-sm">
            <strong>
              {selected.ref} · {formatMoney(selected.price)}
              {selected.rent ? " /mes" : ""}
            </strong>
            <Label htmlFor="demo-destination" className="text-xs text-muted-foreground">
              Agregar al avalúo VLO-0001 (ejemplo) en
            </Label>
            <NativeSelect id="demo-destination" className="w-full" value={destination} onChange={(event) => setDestination(event.target.value)}>
              {comparableDestinations(selected).map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {option}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              onClick={() => {
                toast(`${selected.ref} agregado a ${destination} (demostración, no se guarda)`);
                selectComparable(null);
              }}
            >
              Agregar como comparable
            </Button>
          </div>,
          popupHost,
        )}
    </main>
  );
}

interface StyleRowProps {
  title: string;
  /** The streets drawn with this style. */
  names: string;
  style: HighlightStyle;
  onChange: (patch: Partial<HighlightStyle>) => void;
  /** Categories of the palette: the row is also the option to paint with. */
  selected?: boolean;
  onSelect?: () => void;
}

/** One highlight style: on/off, color and width; for a category, also whether it is the one to paint with. */
function StyleRow({ title, names, style, onChange, selected, onSelect }: StyleRowProps) {
  const lower = title.toLowerCase();
  const text = (
    <>
      <strong className="text-[13px]">{title}</strong>
      <small className="block text-[11.5px] text-muted-foreground">{names}</small>
    </>
  );
  return (
    <div className={`grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border p-2 ${selected ? "border-primary ring-2 ring-primary/30" : ""}`}>
      <Checkbox checked={style.on} onCheckedChange={(on) => onChange({ on: on === true })} aria-label={`Mostrar ${lower}`} />
      {onSelect ? (
        <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className="min-w-0 cursor-pointer rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {text}
          {selected && <span className="block text-[11px] font-semibold text-primary">Toca calles para pintarlas así</span>}
        </button>
      ) : (
        <div className="min-w-0">{text}</div>
      )}
      <input
        type="color"
        value={style.color}
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
          onValueChange={(value) => onChange({ weight: firstValue(value) })}
          aria-label={`Grosor de ${lower}`}
        />
      </span>
    </div>
  );
}

function Dot({ color, border = "#ffffff" }: { color: string; border?: string }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,.25)]" style={{ background: color, border: `2px solid ${border}` }} />;
}

/** Same look as the map pin: filled for a current offer, hollow for an expired one. */
function ComparableDot({ color, current }: { color: string; current: boolean }) {
  return current ? <Dot color={color} /> : <Dot color="#ffffff" border={color} />;
}

function PanelTitle({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="text-[13px] text-muted-foreground">{children}</p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="border-l-[3px] pl-2 text-xs text-muted-foreground">{children}</p>;
}
