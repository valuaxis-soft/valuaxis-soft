"use client";

/// <reference types="google.maps" />

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
  NO_MANUAL_STREETS,
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
  toggleSideStreet,
  type ComparableKind,
  type DemoComparable,
  type LatLon,
  type ManualStreets,
} from "../geo";
import { loadGoogleMaps } from "../google-maps-loader";
import { DEFAULT_HIGHLIGHT_STYLES, type HighlightKey, type HighlightStyles } from "../static-map";
import { DictamenPreview } from "./dictamen-preview";
import type { MapViewProps, Stage } from "./map-view";

const mapLoading = () => <Skeleton className="h-[420px] w-full rounded-none sm:h-[560px]" />;
const LeafletMapView = dynamic(() => import("./leaflet-map"), { ssr: false, loading: mapLoading });
const GoogleMapView = dynamic(() => import("./google-map"), { ssr: false, loading: mapLoading });

const STAGES: { value: Stage; title: string; subtitle: string }[] = [
  { value: "etapa-1", title: "Etapa 1", subtitle: "Ubicación y croquis" },
  { value: "etapa-2", title: "Etapa 2", subtitle: "Calles resaltadas" },
  { value: "etapa-3", title: "Etapa 3", subtitle: "Mapa de comparables" },
];

const HIGHLIGHT_ROWS: { key: HighlightKey; title: string; min: number; max: number }[] = [
  { key: "front", title: "Calle de frente", min: 3, max: 12 },
  { key: "side", title: "Calles colindantes", min: 2, max: 10 },
  { key: "main", title: "Vialidades principales", min: 2, max: 12 },
];

/** Same seed, same 34 comparables on every visit. */
const COMPARABLES = generateComparables();

type MapMode = "loading" | "google" | "leaflet";

// The stage lives in the URL hash (#etapa-2), like the prototype.
function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
const readStage = (hash: string): Stage => (STAGES.some((s) => `#${s.value}` === hash) ? (hash.slice(1) as Stage) : "etapa-1");

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

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
  const [manual, setManual] = useState<ManualStreets>(NO_MANUAL_STREETS);
  const detection = useMemo(() => detectStreets(subject, NAMED_WAYS, manual), [subject, manual]);
  const [styles, setStyles] = useState<HighlightStyles>(DEFAULT_HIGHLIGHT_STYLES);
  const [view, setView] = useState({ center: SUBJECT_START, zoom: 17, key: 0 });
  const [framing, setFraming] = useState<15 | 17>(17);
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
  const [sheetKey, setSheetKey] = useState(0);

  const filters = useMemo(
    () => ({ layers, minPrice: parsePrice(minPrice), maxPrice: parsePrice(maxPrice), onlyCurrent }),
    [layers, minPrice, maxPrice, onlyCurrent],
  );
  const shown = useMemo(() => COMPARABLES.filter((c) => passesFilters(c, filters)), [filters]);
  const near = useMemo(() => comparablesWithinRadius(shown, subject, radius), [shown, subject, radius]);

  const moveSubject = useCallback((point: LatLon, recenter: boolean) => {
    setSubject(point);
    setManual(NO_MANUAL_STREETS);
    if (recenter) setView((v) => ({ center: point, zoom: 17, key: v.key + 1 }));
  }, []);

  const onStreetClick = useCallback(
    (name: string) => {
      if (stage !== "etapa-2" || name === detection.front) return;
      const next = toggleSideStreet(detection, manual, name);
      setManual(next);
      toast(detectStreets(subject, NAMED_WAYS, next).side.has(name) ? `${name}: colindante` : `${name}: ya no se resalta`);
    },
    [stage, detection, manual, subject],
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

  // The croquis follow the map a moment later, as the prototype did.
  const sheetInput = useMemo(() => ({ stage, subject, detection, styles, shown }), [stage, subject, detection, styles, shown]);
  const sheet = useDebounced(sheetInput, 250);

  const mapProps: MapViewProps = {
    stage,
    subject,
    onSubjectMove: (point) => moveSubject(point, false),
    detection,
    highlightStyles: styles,
    onStreetClick,
    comparables: shown,
    radius,
    showValuations,
    selected: stage === "etapa-3" ? selected : null,
    onSelect: selectComparable,
    popupHost,
    view,
    dark,
  };

  const setStage = (value: Stage) => {
    window.location.hash = value;
  };

  const legendItems = (() => {
    const items: { label: string; swatch: React.ReactNode }[] = [{ label: "Inmueble sujeto", swatch: <Dot color="#c0392b" /> }];
    if (stage === "etapa-2") {
      for (const row of HIGHLIGHT_ROWS) {
        if (styles[row.key].on) items.push({ label: row.title, swatch: <span className="inline-block h-1 w-5 rounded-sm" style={{ background: styles[row.key].color }} /> });
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
            <div className="relative isolate overflow-hidden rounded-xl border">
              {mode === "loading" ? mapLoading() : mode === "google" ? <GoogleMapView {...mapProps} /> : <LeafletMapView {...mapProps} />}
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
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[15px] font-semibold">Así sale en el dictamen</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSheetKey((k) => k + 1);
                    toast("Croquis actualizado");
                  }}
                >
                  Actualizar croquis
                </Button>
              </div>
              <DictamenPreview
                key={sheetKey}
                apiKey={mode === "leaflet" ? null : googleMapsKey}
                stage={sheet.stage}
                subject={sheet.subject}
                detection={sheet.detection}
                highlightStyles={sheet.styles}
                comparables={sheet.shown}
              />
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
              <Note>El croquis toma el encuadre y el zoom que elijas. Con «Actualizar croquis» se vuelve a generar la imagen que va en el dictamen.</Note>
            </TabsContent>

            <TabsContent value="etapa-2" className="grid gap-3.5">
              <PanelTitle title="Resaltar vialidades">
                Se detectan solas a partir del pin. Toca una calle en el mapa para agregarla o quitarla como colindante.
              </PanelTitle>
              {HIGHLIGHT_ROWS.map((row) => {
                const style = styles[row.key];
                const update = (patch: Partial<typeof style>) => setStyles((s) => ({ ...s, [row.key]: { ...s[row.key], ...patch } }));
                const names =
                  row.key === "front"
                    ? (detection.front ?? "—")
                    : row.key === "side"
                      ? detection.side.size ? summarizeNames(detection.side) : "Ninguna"
                      : detection.main.size ? summarizeNames(detection.main) : "Ninguna cerca";
                return (
                  <div key={row.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border p-2">
                    <Checkbox checked={style.on} onCheckedChange={(on) => update({ on })} aria-label={`Mostrar ${row.title.toLowerCase()}`} />
                    <div className="min-w-0">
                      <strong className="text-[13px]">{row.title}</strong>
                      <small className="block text-[11.5px] text-muted-foreground">{names}</small>
                    </div>
                    <input
                      type="color"
                      value={style.color}
                      onChange={(event) => update({ color: event.target.value })}
                      aria-label={`Color de ${row.title.toLowerCase()}`}
                      className="h-6 w-8 cursor-pointer rounded border border-input bg-transparent p-0"
                    />
                    <span className="col-span-3 flex items-center gap-2 text-xs text-muted-foreground">
                      Grosor
                      <Slider
                        min={row.min}
                        max={row.max}
                        value={[style.weight]}
                        onValueChange={(value) => update({ weight: firstValue(value) })}
                        aria-label={`Grosor de ${row.title.toLowerCase()}`}
                      />
                    </span>
                  </div>
                );
              })}
              <Note>Colores y grosor quedan guardados en el avalúo y así se imprimen en el croquis.</Note>
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
